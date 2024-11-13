export async function getIslandsRegistered(content: string, path: string) {
  await Deno.writeTextFile(path, content);

  await injectPatches(path);

  const command = new Deno.Command("deno", {
    args: ["run", "--config", Deno.cwd() + "/deno.json", path],
    stdout: "piped",
    // stderr: "null",
    stderr: "piped",
  });

  const { stdout, stderr } = await command.output();

  if (stderr.length > 0) {
    console.error("ERROR: " + new TextDecoder().decode(stderr));
  }

  const output = new TextDecoder().decode(stdout).trim();

  try {
    const islandComponents = JSON.parse(output);
    return islandComponents;
  } catch {
    throw new Error(output);
  }
}

async function injectPatches(path: string) {
  // Read the original bundle file
  let content = await Deno.readTextFile(path);

  // **Step 1: Remove Inline Source Map (if present)**
  // Inline source maps usually start with `//# sourceMappingURL=data:application/json;base64,`
  const sourceMapRegex =
    /\/\/# sourceMappingURL=data:application\/json;base64,[^\n]*\n?/g;
  content = content.replace(sourceMapRegex, "");

  // **Step 2: Inject DOM Shim Import from lit-labs/ssr**
  const domShimImport = `
    // Import the DOM shim for SSR to provide customElements, window, and document
    import { installWindowOnGlobal } from "npm:@lit-labs/ssr@3.2.2/lib/dom-shim.js";
    installWindowOnGlobal();
    // Set window object, because the shim doesn't do it
    globalThis.window = globalThis;
  `;

  // **Step 2: Inject Patches for console and customElements.define**
  const consolePatch = `
    // Suppress console logs except the final output
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};

    // Patch customElements.define to collect island components
    const originalDefine = customElements.define;
    const islandComponents = new Set();

    customElements.define = function (tagName, constructor, options) {
      islandComponents.add(tagName);
      originalDefine.call(this, tagName, constructor, options);
    };
  `;

  const outputPatch = `
    // Restore console.log and output collected components
    await new Promise(resolve => setTimeout(resolve));
    originalLog(JSON.stringify(Array.from(islandComponents)));
  `;

  // Inject the patches at the beginning and end of the bundle
  const patchedContent = `${domShimImport}${consolePatch}\n${content}\n${outputPatch}`;

  // Write the patched bundle to the output path
  await Deno.writeTextFile(path, patchedContent);
}
