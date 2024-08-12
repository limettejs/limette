import * as path from "@std/path";
import * as semver from "@std/semver";

const ROOT_DIR = path.join(import.meta.dirname!, "..");
const denoJsonPath = path.join(ROOT_DIR, "deno.json");
const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath));
const currentVersion = denoJson.version;

const initJsonPath = path.join(ROOT_DIR, "init", "deno.json");
const initJson = JSON.parse(await Deno.readTextFile(initJsonPath));
const currentInitVersion = initJson.version;

// Update version for /init/deno.json only if the version is lower than core version
if (
  semver.lessThan(
    semver.parse(currentInitVersion),
    semver.parse(currentVersion)
  )
) {
  const initJsonContent = await Deno.readTextFile(
    path.join(ROOT_DIR, "init", "deno.json")
  );
  const initJsonReplaced = initJsonContent.replace(
    /"version":\s"[^"]+"/,
    `"version": "${currentVersion}"`
  );
  await Deno.writeTextFile(
    path.join(ROOT_DIR, "init", "deno.json"),
    initJsonReplaced
  );
}

// Update version for /init/src/mod.ts
const initModContent = await Deno.readTextFile(
  path.join(ROOT_DIR, "init", "src", "mod.ts")
);
const initModReplaced = initModContent.replace(
  /LIMETTE_VERSION\s=\s["']([^'"]+)['"]/g,
  `LIMETTE_VERSION = "${currentVersion}"`
);
await Deno.writeTextFile(
  path.join(ROOT_DIR, "init", "src", "mod.ts"),
  initModReplaced
);
