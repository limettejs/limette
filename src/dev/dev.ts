import { build } from "./build.ts";

export default async function dev() {
  if (Deno.args.includes("build")) {
    //build app
    // Similar with getRoutes(), but localli
    await build();
  }
}
