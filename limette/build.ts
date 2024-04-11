import * as esbuild from "npm:esbuild@0.20.2";
// Import the WASM build on platforms where running subprocesses is not
// permitted, such as Deno Deploy, or when running without `--allow-run`.
// import * as esbuild from "https://deno.land/x/esbuild@0.20.2/wasm.js";

import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@^0.10.3";
import parseImports from "npm:parse-imports";
import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { walk } from "jsr:@std/fs/walk";
import { parse } from "jsr:@std/path";
import hash from "https://deno.land/x/object_hash@2.0.3.1/mod.ts";

// await build();

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
    `import "${Deno.cwd()}/limette/is-land.ts";`,
    ...imports,
  ].join("\n");

  await ensureDir("./temp");
  await Deno.writeTextFile(Deno.cwd() + "/temp/entrypoint.js", entryPoint, {});

  const result = await esbuild.build({
    plugins: [
      ...denoPlugins({
        loader: "native",
        configPath: Deno.cwd() + "/deno.json",
      }),
    ],
    entryPoints: ["./temp/entrypoint.js"],
    // outfile: "./dist/bundle.js",
    // outdir: "dist",
    sourcemap: false,
    bundle: true,
    format: "esm",
    write: false,
  });

  esbuild.stop();

  await Deno.remove("./temp", { recursive: true });

  return result.outputFiles?.[0];
}

// console.log(await getRoutes());
export async function getRoutes() {
  const routes = [];
  for await (const entry of walk("./routes", {
    includeDirs: false,
    includeSymlinks: false,
  })) {
    const parsed = parse(entry.path);
    let path = parsed.dir.replace("routes", "") + "/" + parsed.name;
    path = path.endsWith("/index") ? path.substring(0, -6) : path;
    path = path === "" ? "/" : path;
    const filePath = Deno.cwd() + "/" + entry.path;
    const id = hash({ path });

    const bundle = await build(filePath);
    const bundlePath = bundle
      ? `/_lmt/js/${id}/chunk-${bundle?.hash}.js`
      : undefined;

    const route = {
      id,
      path,
      filePath,
      bundle,
      bundlePath,
    };
    routes.push(route);
  }

  return routes;
}
