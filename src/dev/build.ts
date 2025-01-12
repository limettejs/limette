import * as esbuild from "esbuild";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import { parseImports } from "parse-imports";
import { parse, join, toFileUrl, SEPARATOR } from "@std/path";
import { walk, emptyDir, ensureFile, exists } from "@std/fs";
import { encodeHex } from "@std/encoding";
import type { BuildRoutesOptions } from "../server/fs-routes.ts";
import type { AppTemplateInterface } from "../server/ssr.ts";
import { getIslandsRegistered } from "./extract-islands.ts";
import { resolvePath, getTailwind } from "./path.ts";
import type { RouteModule, LayoutModule, MiddlewareModule } from "../types.ts";

const TEST_FILE_PATTERN = /[._]test\.(?:[tj]sx?|[mc][tj]s)$/;

export type BuildRoute = {
  id: string;
  path: string;
  relativeFilePath: string;
  absoluteFilePath: string;
  routeModule?: RouteModule;
  tagName: string;
  jsAssetContent: esbuild.OutputFile | undefined;
  jsAssetPath: string | undefined;
  cssAssetContent: string | undefined;
  cssAssetPath: string | undefined;
  islands: string[] | undefined;
  middlewares: MiddlewareModule[] | [];
  middlewarePaths: string[] | [];
  layouts: LayoutModule[] | [];
  layoutPaths: string[] | [];
};

const encoder = new TextEncoder();

async function getIslandsImports(file: string) {
  const imports = [];

  const code = await Deno.readTextFile(file);
  // Lazily iterate over iterable of imports
  for (const $import of await parseImports(code, { resolveFrom: file })) {
    const path = $import.moduleSpecifier.value;

    if (!path) {
      throw new Error(
        `We can't process this import: ${$import.moduleSpecifier.code}`
      );
    }

    if (path?.includes?.("/islands/")) {
      imports.push(`import "${await resolvePath(path, file)}";`);
    }
  }
  return imports;
}

async function buildJS(path: string, { devMode }: { devMode?: boolean }) {
  const imports = await getIslandsImports(path);
  let result: { jsAssetContent?: esbuild.OutputFile; islands?: string[] } = {
    jsAssetContent: undefined,
    islands: undefined,
  };

  // Without islands imported, we don't create any bundle for this route
  if (!imports.length) return result;

  const entryPoint = [
    // `import "https://esm.sh/@lit-labs/ssr-client@1.1.7/lit-element-hydrate-support.js";`,
    `import "@limette/core/runtime/ssr-client/lit-element-hydrate-support.ts";`,
    `import "@limette/core/runtime/ssr-client/lit-element-hydrate-support-patch.ts";`,
    `import "@limette/core/runtime/is-land.ts";`,
    devMode ? `import "@limette/core/runtime/refresh.ts";` : ``,
    ...imports,
  ].join("\n");

  const tempDirPath = await Deno.makeTempDir();
  const entrypointPath = join(tempDirPath, "/entrypoint.js");
  await Deno.writeTextFile(entrypointPath, entryPoint, {});

  const esbuildResult = await esbuild.build({
    plugins: [
      ...denoPlugins({
        loader: "native",
        configPath: join(Deno.cwd(), "deno.json"),
      }),
    ],
    entryPoints: [toFileUrl(entrypointPath).href],
    sourcemap: devMode,
    minify: !devMode,
    bundle: true,
    format: "esm",
    write: false,
  });

  esbuild.stop();

  const jsAssetContent = esbuildResult.outputFiles?.[0];

  try {
    const islands = await getIslandsRegistered(
      jsAssetContent.text,
      entrypointPath
    );
    result = { jsAssetContent, islands };
  } catch {
    console.error("ERROR: There was an error while processing the islands.");
  } finally {
    await Deno.remove(tempDirPath, { recursive: true });
  }

  return result;
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
  const tailwindcss = await getTailwind();

  if (!tailwindcss) throw new Error("Tailwind is missing from deno.json!");

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
      tailwindcss,
      `--input=${join(Deno.cwd(), "/static/tailwind.css")}`,
      `--content=${contentFlag}`,
      !devMode ? `--minify` : ``,
    ],
    stdout: "piped",
    stderr: "null",
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
}: BuildRoutesOptions) {
  if (!devMode && !buildAssets) {
    return (
      (await loadFs?.("_limette/routes.js")) as {
        routes: BuildRoute[];
      }
    ).routes;
  }

  const ignoreFilePattern = TEST_FILE_PATTERN;
  const routes: BuildRoute[] = [];
  const allMiddlewareFiles = await getMiddlewareFiles();
  const allLayoutFiles = await getLayoutFiles();

  for await (const entry of walk("./routes", {
    includeDirs: false,
    includeSymlinks: false,
    exts: ["ts", "js"],
    skip: [
      ignoreFilePattern,
      new RegExp("/_app.(js|ts)$"),
      new RegExp("/_middleware.(js|ts)$"),
      new RegExp("/_layout.(js|ts)$"),
    ],
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
    const { jsAssetContent, islands } = buildAssets
      ? await buildJS(absoluteFilePath, { devMode })
      : {};
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

    // For buildAssets, we set the middlewares as an array of paths, otherwise an array of modules
    const middlewares = devMode
      ? ((await getMiddlewaresForRoute({
          filePath: entry.path,
          allMiddlewareFiles: allMiddlewareFiles,
          loadFs: loadFs,
          valueType: "module",
        })) as MiddlewareModule[])
      : [];

    const middlewarePaths =
      !devMode && buildAssets
        ? ((await getMiddlewaresForRoute({
            filePath: entry.path,
            allMiddlewareFiles: allMiddlewareFiles,
            loadFs: loadFs,
            valueType: "absolutePath",
          })) as string[])
        : [];

    const layouts = (await getLayoutsForRoute({
      filePath: entry.path,
      allLayoutFiles: allLayoutFiles,
      loadFs: loadFs,
      valueType: "module",
    })) as LayoutModule[];

    const layoutPaths = (await getLayoutsForRoute({
      filePath: entry.path,
      allLayoutFiles: allLayoutFiles,
      loadFs: loadFs,
      valueType: "absolutePath",
    })) as string[];

    const route: BuildRoute = {
      id,
      path,
      relativeFilePath: `.${SEPARATOR}${entry.path}`,
      absoluteFilePath,
      routeModule: (await loadFs?.(entry.path)) as RouteModule,
      tagName,
      jsAssetContent,
      jsAssetPath,
      cssAssetContent,
      cssAssetPath,
      islands,
      middlewares: middlewares,
      middlewarePaths: middlewarePaths,
      layouts: layouts,
      layoutPaths: layoutPaths,
    };
    routes.push(route);
  }

  return routes;
}

// Method to get all _middleware files
async function getMiddlewareFiles(): Promise<Map<string, string>> {
  const middlewareFiles = new Map();
  for await (const entry of walk("./routes", {
    includeDirs: false,
    includeSymlinks: false,
    exts: ["ts", "js"],
    match: [new RegExp("/_middleware.(ts|js)$")],
  })) {
    const parsed = parse(entry.path);
    middlewareFiles.set(parsed.dir, entry.path);
  }
  return middlewareFiles;
}

// Method to find middleware files in the tree of a given file path
async function getMiddlewaresForRoute({
  filePath,
  allMiddlewareFiles,
  loadFs,
  valueType,
}: {
  filePath: string;
  allMiddlewareFiles: Map<string, string>;
  loadFs?: (path: string) => Promise<unknown>;
  valueType: "module" | "relativePath" | "absolutePath";
}): Promise<MiddlewareModule[] | string[] | []> {
  if (allMiddlewareFiles.size === 0) return [];

  // Remove file name from path
  const pathSegments = filePath.split("/").slice(0, -1); // ["foo", "bar"]

  // Build directory paths from root to the file's directory using a for...of loop
  const directoriesToCheck: string[] = [];
  let currentDir = "";

  for (const segment of pathSegments) {
    currentDir = join(currentDir, segment);
    directoriesToCheck.push(currentDir);
  }

  const middlewareFilesForRoute = directoriesToCheck
    .filter((dir) => allMiddlewareFiles.has(dir))
    .map((dir) => allMiddlewareFiles.get(dir) ?? "")
    .filter(Boolean);

  // Return array of relative paths
  if (valueType === "relativePath") {
    return middlewareFilesForRoute;
  }

  // Return array of absolute paths
  if (valueType === "absolutePath") {
    return middlewareFilesForRoute.map((path) => join(Deno.cwd(), path));
  }

  return await Promise.all(
    middlewareFilesForRoute.map(
      (file) => loadFs?.(file) as unknown as MiddlewareModule
    )
  );
}

// Method to get all _layout files
async function getLayoutFiles(): Promise<Map<string, string>> {
  const layoutFiles = new Map();
  for await (const entry of walk("./routes", {
    includeDirs: false,
    includeSymlinks: false,
    exts: ["ts", "js"],
    match: [new RegExp("/_layout.(ts|js)$")],
  })) {
    const parsed = parse(entry.path);
    layoutFiles.set(parsed.dir, entry.path);
  }
  return layoutFiles;
}

// Method to find middleware files in the tree of a given file path
async function getLayoutsForRoute({
  filePath,
  allLayoutFiles,
  loadFs,
  valueType,
}: {
  filePath: string;
  allLayoutFiles: Map<string, string>;
  loadFs?: (path: string) => Promise<unknown>;
  valueType: "module" | "relativePath" | "absolutePath";
}): Promise<LayoutModule[] | string[] | []> {
  if (allLayoutFiles.size === 0) return [];

  // Remove file name from path
  const pathSegments = filePath.split("/").slice(0, -1); // ["foo", "bar"]

  // Build directory paths from root to the file's directory using a for...of loop
  const directoriesToCheck: string[] = [];
  let currentDir = "";

  for (const segment of pathSegments) {
    currentDir = join(currentDir, segment);
    directoriesToCheck.push(currentDir);
  }

  const layoutFilesForRoute = directoriesToCheck
    .filter((dir) => allLayoutFiles.has(dir))
    .map((dir) => allLayoutFiles.get(dir) ?? "")
    .filter(Boolean);

  // Return array of relative paths
  if (valueType === "relativePath") {
    return layoutFilesForRoute;
  }

  // Return array of absolute paths
  if (valueType === "absolutePath") {
    return layoutFilesForRoute.map((path) => join(Deno.cwd(), path));
  }

  return await Promise.all(
    layoutFilesForRoute.map((file) => loadFs?.(file) as unknown as LayoutModule)
  );
}

export async function getAppTemplate({
  loadFs,
}: BuildRoutesOptions): Promise<AppTemplateInterface> {
  const [checkTs, checkJs] = await Promise.allSettled([
    exists("./routes/_app.ts", { isFile: true }),
    exists("./routes/_app.js", { isFile: true }),
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

  return ((await loadFs?.("./routes/_app.js")) as { default: unknown })
    .default as AppTemplateInterface;
}

async function getAppTemplatePath() {
  const [checkTs, checkJs] = await Promise.allSettled([
    exists("./routes/_app.ts", { isFile: true }),
    exists("./routes/_app.js", { isFile: true }),
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
  let middlewareImportsString = ``;
  const importedMiddlewares = new Map();
  let layoutImportsString = `\n`;
  const importedLayouts = new Map();

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
    routesImportsString += `import * as route${routeIndex} from "${toFileUrl(
      route.absoluteFilePath
    )}";
`;

    middlewareImportsString += route.middlewarePaths
      .filter((path) => !importedMiddlewares.has(path))
      .map((path) => {
        const middlewareModuleName = `middleware${importedMiddlewares.size}`;
        importedMiddlewares.set(path, middlewareModuleName);
        return `\nimport * as ${middlewareModuleName} from "${toFileUrl(
          path
        )}";`;
      })
      .join("");

    layoutImportsString += route.layoutPaths
      .filter((path) => !importedLayouts.has(path))
      .map((path) => {
        const layoutModuleName = `layout${importedLayouts.size}`;
        importedLayouts.set(path, layoutModuleName);
        return `\nimport * as ${layoutModuleName} from "${toFileUrl(path)}";`;
      })
      .join("");

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
    },
    islands: ${JSON.stringify(route.islands)},
    middlewares: [${route.middlewarePaths
      .map((path) => importedMiddlewares.get(path))
      .join()}],
    layouts: [${route.layoutPaths
      .map((path) => importedLayouts.get(path))
      .join()}]
  },
`;
    routeIndex++;
  }

  routesArrayString = `\n\nexport const routes = [${routesArrayString}];`;

  await Deno.writeTextFile(
    "./_limette/routes.js",
    routesImportsString +
      middlewareImportsString +
      layoutImportsString +
      routesArrayString
  );
}
