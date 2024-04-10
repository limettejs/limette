import * as esbuild from "npm:esbuild@0.20.2";
// Import the WASM build on platforms where running subprocesses is not
// permitted, such as Deno Deploy, or when running without `--allow-run`.
// import * as esbuild from "https://deno.land/x/esbuild@0.20.2/wasm.js";

import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@^0.10.3";
import parseImports from "npm:parse-imports";
import { ensureDir } from "jsr:@std/fs/ensure-dir";

// getImports("./routes/index.js");

await build();

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

async function build() {
  const imports = await getImports("./routes/test/index.js");

  // Without islands imported, we don't create any bundle for this route
  if (!imports.length) return;

  const entryPoint = [
    `import "https://esm.sh/@lit-labs/ssr-client@1.1.7/lit-element-hydrate-support.js";`,
    `import "${Deno.cwd()}/limette/is-island.js";`,
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
    outfile: "./dist/bundle.js",
    sourcemap: true,
    bundle: true,
    format: "esm",
  });

  //   console.log(result);
  esbuild.stop();

  await Deno.remove("./temp", { recursive: true });
}
