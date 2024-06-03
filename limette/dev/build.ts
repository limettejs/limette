// Import the WASM build on platforms where running subprocesses is not
// permitted, such as Deno Deploy, or when running without `--allow-run`.
// import * as esbuild from "https://deno.land/x/esbuild@0.20.2/wasm.js";

import {
  esbuild,
  denoPlugins,
  walk,
  parse,
  hash,
  parseImports,
} from "../../deps.ts";

// await build();
const TEST_FILE_PATTERN = /[._]test\.(?:[tj]sx?|[mc][tj]s)$/;

async function getImports(file: string) {
  const imports = [];

  const code = await Deno.readTextFile(file);
  // Lazily iterate over iterable of imports
  for (const $import of await parseImports(code, { resolveFrom: file })) {
    const path = $import.moduleSpecifier.resolved;
    if (path?.includes?.("/islands/")) {
      imports.push(`import "${path}";`);
    }
  }
  return imports;
}

async function build(path: string) {
  const imports = await getImports(path);

  // Without islands imported, we don't create any bundle for this route
  if (!imports.length) return;

  const entryPoint = [
    `import "https://esm.sh/@lit-labs/ssr-client@1.1.7/lit-element-hydrate-support.js";`,
    `import "$limette/runtime/is-land.ts";`,
    `import "$limette/runtime/refresh.ts";`,
    ...imports,
  ].join("\n");

  const tempDirPath = await Deno.makeTempDir();
  const entrypointPath = `${tempDirPath}/entrypoint.js`;
  await Deno.writeTextFile(entrypointPath, entryPoint, {});

  const result = await esbuild.build({
    plugins: [
      ...denoPlugins({
        loader: "native",
        configPath: Deno.cwd() + "/deno.json",
      }),
    ],
    entryPoints: [entrypointPath],
    // outfile: "./dist/bundle.js",
    // outdir: "dist",
    sourcemap: false,
    bundle: true,
    format: "esm",
    write: false,
  });

  esbuild.stop();

  await Deno.remove(tempDirPath, { recursive: true });

  return result.outputFiles?.[0];
}

export async function getRoutes() {
  const ignoreFilePattern = TEST_FILE_PATTERN;
  const routes = [];
  for await (const entry of walk("./routes", {
    includeDirs: false,
    includeSymlinks: false,
    exts: ["ts", "js"],
    skip: [ignoreFilePattern],
  })) {
    const parsed = parse(entry.path);
    let path = parsed.dir.replace("routes", "") + "/" + parsed.name;
    path = path.endsWith("/index") ? path.slice(0, -6) : path;
    path = path === "" ? "/" : path;
    path = convertFilenameToPattern(path);

    // Check if route exists
    const exists = routes.find((r) => r.path === path);
    if (exists) {
      const error = `Route conflict for "${path}" (${entry.path}"). Another file is resolved to the same route: "${exists.path}" (${exists.filePath}).`;
      throw new Error(error);
    }

    const filePath = Deno.cwd() + "/" + entry.path;
    const id = hash({ path });
    const tagName = convertToWebComponentTagName(path);

    const bundle = await build(filePath);
    const bundlePath = bundle
      ? `/_lmt/js/${id}/chunk-${id.substring(0, 6)}.js`
      : undefined;

    const css = await buildCSS(filePath, bundle);
    const cssPath = css
      ? `/_lmt/css/${id}/tailwind-${id.substring(0, 6)}.css`
      : undefined;

    const route = {
      id,
      path,
      filePath,
      tagName,
      bundle,
      bundlePath,
      css,
      cssPath,
    };
    routes.push(route);
  }

  return routes;
}

function convertFilenameToPattern(filename: string) {
  // Replace all dynamic parts (e.g., "[[version]]") with their corresponding placeholders
  let outputString = filename.replace(
    /\[([^\]]+\])\]/g,
    (_match, dynamicPart: string) => {
      if (dynamicPart.startsWith("[") && dynamicPart.endsWith("]")) {
        // Handle "[[version]]" format
        return `{/:${dynamicPart.slice(1, -1)}}?`;
      }
    }
  );

  // Replace all dynamic parts (e.g., "[slug]", "[...params]") with their corresponding placeholders
  outputString = outputString.replace(
    /\[([^\[\]]+)\]/g,
    (_match, dynamicPart: string) => {
      if (dynamicPart.startsWith("...")) {
        // Handle "[...params]" format
        return `:${dynamicPart.slice(3)}*`;
      } else {
        // Handle regular dynamic parts
        return `:${dynamicPart}`;
      }
    }
  );

  outputString = outputString.replaceAll("/{/", "{/");

  // Add a leading slash if not already present
  return outputString.startsWith("/") ? outputString : `/${outputString}`;
}

function convertToWebComponentTagName(str: string) {
  const stringWithId =
    (str === "/" ? "index" : str) +
    "-" +
    globalThis.crypto.randomUUID().substring(0, 5);

  // Replace non-alphanumeric characters with hyphens
  const cleanedString = stringWithId.replace(/[^a-zA-Z0-9]+/g, "-");

  // Remove consecutive hyphens
  const tagName = cleanedString.replace(/-+/g, "-");

  // Remove hyphens from the start and end
  return tagName.replace(/^-+|-+$/g, "").toLowerCase();
}

async function buildCSS(filePath: string, bundle) {
  let tempDirPath = "";
  let contentFlag = filePath;

  if (bundle?.text) {
    tempDirPath = await Deno.makeTempDir();
    const bundlePathTemp = `${tempDirPath}/bundle.js`;
    await Deno.writeTextFile(bundlePathTemp, bundle.text, {});

    contentFlag = `${contentFlag},${bundlePathTemp}`;
  }

  const command = new Deno.Command(`${import.meta.dirname}/lib/tailwindcss`, {
    args: [
      `--input=${import.meta.dirname}/lib/input.css`,
      `--content=${contentFlag}`,
    ],
    stdout: "piped",
    cwd: Deno.cwd(),
  });
  const process = command.spawn();
  const { stdout } = await process.output();
  const css = new TextDecoder().decode(stdout);

  process.unref();

  if (bundle?.text) {
    await Deno.remove(tempDirPath, { recursive: true });
  }

  return css;
}
