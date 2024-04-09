import { Application } from "jsr:@oak/oak/application";
import { Router } from "jsr:@oak/oak/router";

import { render } from "@lit-labs/ssr";
import { collectResult } from "@lit-labs/ssr/lib/render-result.js";

import { staticMiddleware } from "./limette/utils.ts";
import { bootstrapContent } from "./limette/ssr.ts";

// console.log(globalThis.customElements);

const router = new Router();
router.get("/", async (ctx) => {
  const result = render(bootstrapContent());
  const contents = await collectResult(result);
  ctx.response.type = "text/html";
  ctx.response.body = contents;
});

const app = new Application();

app.use(staticMiddleware);

app.use(router.routes());
app.use(router.allowedMethods());

app.listen({ port: 1995 });
console.log("Server started on: http://localhost:1995");
