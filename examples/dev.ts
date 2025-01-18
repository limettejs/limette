import { Builder, tailwind } from "@limette/core";
import { app } from "./main.ts";

const builder = new Builder();
tailwind(app);
if (Deno.args.includes("build")) {
  await builder.build(app);
} else {
  await builder.listen(app);
}
