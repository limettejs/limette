import { Router } from "@oak/oak/router";

import { render } from "@lit-labs/ssr";
import { collectResult } from "@lit-labs/ssr/lib/render-result.js";
import { bootstrapContent } from "./ssr.ts";
import { getRoutes } from "../dev/build.ts";
import { LimetteElementRenderer } from "./rendering/limette-element-renderer.ts";

export const router = new Router();

const routes = await getRoutes();

router.get("/_lmt/js/:id/chunk-:hash.js", (ctx) => {
  const { id } = ctx.params;
  const route = routes.find((r) => r.id === id);
  ctx.response.type = "application/javascript; charset=UTF-8";
  ctx.response.body = route?.bundle?.contents;
});

routes.map((route) => {
  router.get(route.path, async (ctx) => {
    const componentContext = { params: ctx.params };

    const result = render(await bootstrapContent(route, componentContext), {
      elementRenderers: [LimetteElementRenderer],
    });
    const contents = await collectResult(result);
    ctx.response.type = "text/html";
    ctx.response.body = contents;
  });
});