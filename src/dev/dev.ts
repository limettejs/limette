import { build } from "./build.ts";
import type { App } from "../server/app.ts";

export async function dev(app: App) {
  if (Deno.args.includes("build")) {
    await build();
  } else {
    app.config.mode = "development";
    app.listen();
  }
}
