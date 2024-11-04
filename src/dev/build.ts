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
  join,
} from "../deps.ts";
import { fileExists } from "../server/utils.ts";
import type { GetRouterOptions, Handlers } from "../server/router.ts";
import type { AppTemplateInterface } from "../server/ssr.ts";

const TEST_FILE_PATTERN = /[._]test\.(?:[tj]sx?|[mc][tj]s)$/;

export type BuildRoute = {
  id: string;
  path: string;
  relativeFilePath: string;
  absoluteFilePath: string;
  routeModule?: { default: unknown; handler?: Handlers };
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

async function buildJS(path: string, { devMode }: { devMode?: boolean }) {
  const imports = await getImports(path);

  // Without islands imported, we don't create any bundle for this route
  if (!imports.length) return;

  const entryPoint = [
    `import "https://esm.sh/@lit-labs/ssr-client@1.1.7/lit-element-hydrate-support.js";`,
    `import "@limette/core/runtime/is-land.ts";`,
    devMode ? `import "@limette/core/runtime/refresh.ts";` : ``,
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
    sourcemap: devMode,
    minify: !devMode,
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
  absoluteFilePath: string,
  jsAssetContent: esbuild.OutputFile | undefined,
  { devMode }: { devMode?: boolean }
) {
  const appTemplatePath = await getAppTemplatePath();
  let tempDirPath = "";
  let contentFlag = absoluteFilePath;

  if (jsAssetContent?.text) {
    tempDirPath = await Deno.makeTempDir();
    const bundlePathTemp = `${tempDirPath}/bundle.js`;
    await Deno.writeTextFile(bundlePathTemp, jsAssetContent.text, {});

    contentFlag = `${appTemplatePath},${contentFlag},${bundlePathTemp}`;
  }

  const command = new Deno.Command(`${Deno.execPath()}`, {
    args: [
      `run`,
      `--allow-all`,
      `npm:tailwindcss@^3.4.7`,
      `--input=${join(Deno.cwd(), "/static/tailwind.css")}`,
      `--content=${contentFlag}`,
      !devMode ? `--minify` : ``,
    ],
    stdout: "piped",
    cwd: Deno.cwd(),
  });
  const process = command.spawn();
  const { stdout } = await process.output();
  const css = new TextDecoder().decode(stdout);

  process.unref();

  if (jsAssetContent?.text) {
    await Deno.remove(tempDirPath, { recursive: true });
  }

  return css;
}

export async function getRoutes({
  buildAssets,
  devMode,
  loadFs,
}: GetRouterOptions) {
  if (!devMode && !buildAssets) {
    return (
      (await loadFs?.("_limette/routes.js")) as {
        routes: BuildRoute[];
      }
    ).routes;
  }

  const ignoreFilePattern = TEST_FILE_PATTERN;
  const routes: BuildRoute[] = [];

  for await (const entry of walk("./routes", {
    includeDirs: false,
    includeSymlinks: false,
    exts: ["ts", "js"],
    skip: [ignoreFilePattern, new RegExp("/_app.(js|ts)$")],
  })) {
    const parsed = parse(entry.path);
    let path = parsed.dir.replace("routes", "") + "/" + parsed.name;
    path = path.endsWith("/index") ? path.slice(0, -6) : path;
    path = path === "" ? "/" : path;
    path = convertFilenameToPattern(path);

    // Check if route exists
    const exists = routes.find((r) => r.path === path);
    if (exists) {
      const error = `Route conflict for "${path}" (${entry.path}"). Another file is resolved to the same route: "${exists.path}" (${exists.absoluteFilePath}).`;
      throw new Error(error);
    }

    const absoluteFilePath = join(Deno.cwd(), entry.path);

    // Generate tag name
    const id = encodeHex(
      await globalThis.crypto.subtle.digest("SHA-1", encoder.encode(path))
    ).substring(0, 6);
    const tagName = convertToWebComponentTagName(path);

    // Generate JS assets
    const jsAssetContent = buildAssets
      ? await buildJS(absoluteFilePath, { devMode })
      : undefined;
    const jsAssetPath =
      jsAssetContent || buildAssets === false
        ? `/_limette/js/chunk-${id}.js`
        : undefined;

    // Generate CSS assets
    const cssAssetContent = buildAssets
      ? await buildCSS(absoluteFilePath, jsAssetContent, { devMode })
      : undefined;
    const cssAssetPath =
      cssAssetContent || buildAssets === false
        ? `/_limette/css/tailwind-${id}.css`
        : undefined;

    const route: BuildRoute = {
      id,
      path,
      relativeFilePath: `./${entry.path}`,
      absoluteFilePath,
      routeModule: (await loadFs?.(entry.path)) as { default: unknown },
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

export async function getAppTemplate({ loadFs }: GetRouterOptions) {
  const [checkTs, checkJs] = await Promise.allSettled([
    fileExists("./routes/_app.ts"),
    fileExists("./routes/_app.js"),
  ]);

  const hasAppTs = checkTs.status === "fulfilled" && checkTs.value === true;
  const hasAppJs = checkJs.status === "fulfilled" && checkJs.value === true;

  if (hasAppTs && hasAppJs) {
    throw new Error(
      "You have two app templates defined: _app.ts and _app.js. Use only one."
    );
  }

  if (!hasAppTs && !hasAppJs) {
    throw new Error("You don't an app template defined: _app.ts or _app.js.");
  }

  if (hasAppTs) {
    return ((await loadFs?.("./routes/_app.ts")) as { default: unknown })
      .default as AppTemplateInterface;
  }

  if (hasAppJs) {
    return ((await loadFs?.("./routes/_app.js")) as { default: unknown })
      .default as AppTemplateInterface;
  }
}

async function getAppTemplatePath() {
  const [checkTs, checkJs] = await Promise.allSettled([
    fileExists("./routes/_app.ts"),
    fileExists("./routes/_app.js"),
  ]);

  const hasAppTs = checkTs.status === "fulfilled" && checkTs.value === true;
  const hasAppJs = checkJs.status === "fulfilled" && checkJs.value === true;

  if (hasAppTs && hasAppJs) {
    throw new Error(
      "You have two app templates defined: _app.ts and _app.js. Use only one."
    );
  }

  if (!hasAppTs && !hasAppJs) {
    throw new Error("You don't an app template defined: _app.ts or _app.js.");
  }

  if (hasAppTs) {
    return "./routes/_app.ts";
  }

  if (hasAppJs) {
    return "./routes/_app.js";
  }
}

export async function build() {
  const routes = await getRoutes({ buildAssets: true });

  await emptyDir("./_limette");

  let routeIndex = 0;
  let routesImportsString = ``;
  let routesArrayString = ``;

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

    // Generate static routes file
    routesImportsString += `import * as route${routeIndex} from ".${route.relativeFilePath}";
`;

    routesArrayString += `
  {
    id: "${route.id}", 
    path: "${route.path}",
    relativeFilePath: "${route.relativeFilePath}",
    absoluteFilePath: undefined,
    routeModule: route${routeIndex},
    tagName: "${route.tagName}",
    jsAssetPath: ${route.jsAssetPath ? `"${route.jsAssetPath}"` : `undefined`},
    cssAssetPath: ${
      route.cssAssetPath ? `"${route.cssAssetPath}"` : `undefined`
    }
  },
`;
    routeIndex++;
  }

  routesArrayString = `export const routes = [${routesArrayString}];`;

  await Deno.writeTextFile(
    "./_limette/routes.js",
    routesImportsString + routesArrayString
  );
}
