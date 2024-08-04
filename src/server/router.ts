import { Router, render, collectResult } from "../deps.ts";

import { bootstrapContent } from "./ssr.ts";
import { getRoutes } from "../dev/build.ts";
import { LimetteElementRenderer } from "./rendering/limette-element-renderer.ts";

export const router = new Router();

const routes = await getRoutes();

router.get("/_lmt/js/chunk-:id.js", (ctx) => {
  const { id } = ctx.params;
  const route = routes.find((r) => r.id === id);
  ctx.response.type = "application/javascript; charset=UTF-8";
  ctx.response.body = route?.bundle?.contents;
});

router.get("/_lmt/css/tailwind-:id.css", (ctx) => {
  const { id } = ctx.params;
  const route = routes.find((r) => r.id === id);
  ctx.response.type = "text/css; charset=UTF-8";
  ctx.response.body = route?.css;
});

routes.map((route) => {
  router.get(route.path, async (ctx) => {
    const componentContext = { params: ctx.params };

    const result = render(await bootstrapContent(route, componentContext), {
      elementRenderers: [LimetteElementRenderer(route)],
    });
    const contents = await collectResult(result);

    ctx.response.type = "text/html";
    ctx.response.body = contents;
  });
});
