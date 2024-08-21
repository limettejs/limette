import { build } from "./build.ts";
import type { LimetteApp } from "../server/app.ts";

export async function dev(app: LimetteApp) {
  if (Deno.args.includes("build")) {
    await build();
  } else {
    app.setDevMode(true);
    app.listen();
  }
}
