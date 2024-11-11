import { Router } from "../deps.ts";
import type { RouterContext, OakResponse, OakRequest } from "../deps.ts";

import { renderContent } from "./ssr.ts";
import { getRoutes, getAppTemplate } from "../dev/build.ts";

export type GetRouterOptions = {
  buildAssets?: boolean;
  devMode?: boolean;
  staticRoutes?: boolean;
  loadFs?: (path: string) => Promise<unknown>;
};

export type Handlers = {
  GET?(
    ctx: LimetteContext
  ): Response | OakResponse | Promise<Response | OakResponse>;
  POST?(
    ctx: LimetteContext
  ): Response | OakResponse | Promise<Response | OakResponse>;
  PUT?(
    ctx: LimetteContext
  ): Response | OakResponse | Promise<Response | OakResponse>;
  DELETE?(
    ctx: LimetteContext
  ): Response | OakResponse | Promise<Response | OakResponse>;
  PATCH?(
    ctx: LimetteContext
  ): Response | OakResponse | Promise<Response | OakResponse>;
  OPTIONS?(
    ctx: LimetteContext
  ): Response | OakResponse | Promise<Response | OakResponse>;
  HEAD?(
    ctx: LimetteContext
  ): Response | OakResponse | Promise<Response | OakResponse>;
};
export type LimetteContext = {
  readonly req: Request | OakRequest;
  render(data?: unknown): Promise<Response> | Promise<OakResponse>;
};

export type ComponentContext = {
  params: RouterContext<string>["params"];
  data: unknown;
};

export async function getRouter(options: GetRouterOptions) {
  const router = new Router();

  const [routes, AppTemplate] = await Promise.all([
    getRoutes(options),
    getAppTemplate(options),
  ]);

  if (!AppTemplate) {
    throw new Error(
      "You need to create an AppTemplate (_app.ts/js) to render a page."
    );
  }

  // Serve static files from memory on dev mode
  if (options?.devMode) {
    router.get("/_limette/js/chunk-:id.js", (ctx) => {
      const { id } = ctx.params;
      const route = routes.find((r) => r.id === id);
      ctx.response.type = "application/javascript; charset=UTF-8";
      ctx.response.body = route?.jsAssetContent?.contents;
    });

    router.get("/_limette/css/tailwind-:id.css", (ctx) => {
      const { id } = ctx.params;
      const route = routes.find((r) => r.id === id);
      ctx.response.type = "text/css; charset=UTF-8";
      ctx.response.body = route?.cssAssetContent;
    });
  }

  routes.map((route) => {
    // Register custom handlers
    if (route.routeModule?.handler) {
      for (const [handlerName, handlerFn] of Object.entries(
        route.routeModule.handler
      )) {
        // Register route
        router[handlerName.toLocaleLowerCase() as Lowercase<keyof Handlers>](
          route.path,
          async (routerContext: RouterContext<typeof route.path>) => {
            const ctx: LimetteContext = {
              req: routerContext.request,
              render: async (data: ComponentContext["data"]) => {
                if (!route.routeModule?.default) {
                  throw new Error(
                    "No component was provided. Make sure you export a component as default to be redered."
                  );
                }

                const content = await renderContent(
                  AppTemplate,
                  route,
                  routerContext,
                  data
                );

                return new Response(content, {
                  status: 200,
                  statusText: "OK",
                  headers: new Headers({ "Content-Type": "text/html" }),
                });
              },
            };
            const response = await handlerFn(ctx);

            routerContext.response.type = response.headers.get(
              "Content-Type"
            ) as string;
            routerContext.response.headers = response.headers;
            routerContext.response.body = response.body;
          }
        );
      }
    }

    // Default behaviour if no GET handler is provided
    if (route.routeModule?.default && !route.routeModule?.handler?.GET)
      router.get(route.path, async (routerContext) => {
        const content = await renderContent(AppTemplate, route, routerContext);

        routerContext.response.type = "text/html";
        routerContext.response.body = content;
      });
  });

  return router;
}
