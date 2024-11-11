// import type { esbuild } from "../deps.ts";
// import { acorn, acornWalk } from "../deps.ts";

// export function extractTagNamesFromBundle(contents: string) {
//   const ast = acorn.parse(contents, {
//     ecmaVersion: "latest",
//     sourceType: "module",
//   });

//   const tagNames = new Set<string>();

//   // Variable map for resolving tag names
//   const variableMap = new Map<string, string>();

//   acornWalk.simple(ast, {
//     VariableDeclaration(node) {
//       for (const decl of node.declarations) {
//         if (decl.id.type === "Identifier" && decl.init?.type === "Literal") {
//           variableMap.set(decl.id.name, decl.init.value);
//         }
//       }
//     },
//     CallExpression(node) {
//       if (
//         node.callee.type === "MemberExpression" &&
//         node.callee.object.name === "customElements" &&
//         node.callee.property.name === "define"
//       ) {
//         // Check if tag name is a variable or literal
//         const tagNode = node.arguments[0];
//         let tagName = null;

//         if (tagNode.type === "Literal") {
//           tagName = tagNode.value;
//         } else if (tagNode.type === "Identifier") {
//           tagName = variableMap.get(tagNode.name);
//         }

//         if (tagName) {
//           tagNames.add(tagName);
//         }
//       }
//     },
//   });

//   return Array.from(tagNames);
// }

// export function IslandsManifestPlugin(
//   islandsDir: string,
//   manifestPath: string
// ) {
//   const manifest: Record<string, string> = {};

//   return {
//     name: "islands-manifest-plugin",
//     setup(build: esbuild.PluginBuild) {
//       build.onLoad({ filter: /\.(ts|js)$/ }, async (args) => {
//         if (!args.path.startsWith(islandsDir)) return;

//         const contents = await Deno.readTextFile(args.path);

//         // Use Acorn to parse the file into an AST
//         const ast = acorn.parse(contents, {
//           ecmaVersion: "latest",
//           sourceType: "module",
//         });

//         // Variable map for resolving tag names
//         const variableMap = new Map<string, string>();

//         // Walk the AST to resolve `customElements.define`
//         acornWalk.simple(ast, {
//           VariableDeclaration(node) {
//             for (const decl of node.declarations) {
//               if (
//                 decl.id.type === "Identifier" &&
//                 decl.init?.type === "Literal"
//               ) {
//                 variableMap.set(decl.id.name, decl.init.value);
//               }
//             }
//           },
//           CallExpression(node) {
//             if (
//               node.callee.type === "MemberExpression" &&
//               node.callee.object.name === "customElements" &&
//               node.callee.property.name === "define"
//             ) {
//               // Check if tag name is a variable or literal
//               const tagNode = node.arguments[0];
//               let tagName = null;

//               if (tagNode.type === "Literal") {
//                 tagName = tagNode.value;
//               } else if (tagNode.type === "Identifier") {
//                 tagName = variableMap.get(tagNode.name);
//               }

//               if (tagName) {
//                 manifest[tagName] = args.path;
//               }
//             }
//           },
//         });

//         return { contents, loader: "ts" };
//       });

//       build.onEnd(async () => {
//         await Deno.writeTextFile(
//           manifestPath,
//           JSON.stringify(manifest, null, 2)
//         );
//         console.log(`Island manifest generated at ${manifestPath}`);
//       });
//     },
//   };
// }

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
    import { installWindowOnGlobal } from "npm:@lit-labs/ssr/lib/dom-shim.js";
    installWindowOnGlobal();
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
    // globalThis.addEventListener('load', () => {
    //   console.log = originalLog;
    //   console.log(JSON.stringify(Array.from(islandComponents)));
    // });
    await new Promise(resolve => setTimeout(resolve));
    originalLog(JSON.stringify(Array.from(islandComponents)));
  `;

  // Inject the patches at the beginning and end of the bundle
  const patchedContent = `${domShimImport}${consolePatch}\n${content}\n${outputPatch}`;

  // Write the patched bundle to the output path
  await Deno.writeTextFile(path, patchedContent);
}
