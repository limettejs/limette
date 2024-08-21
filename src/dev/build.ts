// Import the WASM build on platforms where running subprocesses is not
// permitted, such as Deno Deploy, or when running without `--allow-run`.
// import * as esbuild from "https://deno.land/x/esbuild@0.20.2/wasm.js";

import {
  esbuild,
  denoPlugins,
  walk,
  parse,
  encodeHex,
  parseImports,
  emptyDir,
  ensureFile,
} from "../deps.ts";

const TEST_FILE_PATTERN = /[._]test\.(?:[tj]sx?|[mc][tj]s)$/;

export type BuildRoute = {
  id: string;
  path: string;
  filePath: string;
  tagName: string;
  jsAssetContent: esbuild.OutputFile | undefined;
  jsAssetPath: string | undefined;
  cssAssetContent: string | undefined;
  cssAssetPath: string | undefined;
};

const encoder = new TextEncoder();

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

async function buildJS(path: string) {
  const imports = await getImports(path);

  // Without islands imported, we don't create any bundle for this route
  if (!imports.length) return;

  const entryPoint = [
    `import "https://esm.sh/@lit-labs/ssr-client@1.1.7/lit-element-hydrate-support.js";`,
    `import "@limette/core/runtime/is-land.ts";`,
    `import "@limette/core/runtime/refresh.ts";`,
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

function convertFilenameToPattern(filename: string) {
  // Replace all dynamic parts (e.g., "[[version]]") with their corresponding placeholders
  let outputString = filename.replace(
    /\[([^\]]+\])\]/g,
    (_match, dynamicPart: string) => {
      if (dynamicPart.startsWith("[") && dynamicPart.endsWith("]")) {
        // Handle "[[version]]" format
        return `{/:${dynamicPart.slice(1, -1)}}?`;
      }

      return _match;
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

async function buildCSS(
  filePath: string,
  bundle: esbuild.OutputFile | undefined
) {
  let tempDirPath = "";
  let contentFlag = filePath;

  if (bundle?.text) {
    tempDirPath = await Deno.makeTempDir();
    const bundlePathTemp = `${tempDirPath}/bundle.js`;
    await Deno.writeTextFile(bundlePathTemp, bundle.text, {});

    contentFlag = `${contentFlag},${bundlePathTemp}`;
  }

  const command = new Deno.Command(`${Deno.execPath()}`, {
    args: [
      `run`,
      `--allow-all`,
      `npm:tailwindcss@^3.4.7`,
      `--input=${Deno.cwd()}/static/tailwind.css`,
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

export async function getRoutes({ buildAssets } = { buildAssets: false }) {
  const ignoreFilePattern = TEST_FILE_PATTERN;
  const routes: BuildRoute[] = [];
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

    const id = encodeHex(
      await window.crypto.subtle.digest("SHA-1", encoder.encode(path))
    ).substring(0, 6);
    const tagName = convertToWebComponentTagName(path);

    const jsAssetContent = buildAssets ? await buildJS(filePath) : undefined;
    const jsAssetPath =
      jsAssetContent || buildAssets === false
        ? `/_limette/js/chunk-${id}.js`
        : undefined;

    const cssAssetContent = buildAssets
      ? await buildCSS(filePath, jsAssetContent)
      : undefined;
    const cssAssetPath =
      cssAssetContent || buildAssets === false
        ? `/_limette/css/tailwind-${id}.css`
        : undefined;

    const route: BuildRoute = {
      id,
      path,
      filePath,
      tagName,
      jsAssetContent,
      jsAssetPath,
      cssAssetContent,
      cssAssetPath,
    };
    routes.push(route);
  }

  return routes;
}

export async function build() {
  const routes = await getRoutes({ buildAssets: true });

  await emptyDir("./_limette");

  for (const route of routes) {
    if (route.jsAssetContent?.contents) {
      await ensureFile("." + route.jsAssetPath);
      await Deno.writeFile(
        "." + route.jsAssetPath,
        route.jsAssetContent.contents
      );
    }

    if (route.cssAssetContent) {
      await ensureFile("." + route.cssAssetPath);
      await Deno.writeTextFile("." + route.cssAssetPath, route.cssAssetContent);
    }
  }
}
