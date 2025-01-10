import { Router } from "../deps.ts";
import type {
  RouterContext,
  OakResponse,
  OakRequest,
  Middleware,
} from "../deps.ts";

import type { Context } from "../router/app.ts";
import { renderContent } from "./ssr.ts";
import { getRoutes, getAppTemplate } from "../dev/build.ts";

export type GetRouterOptions = {
  buildAssets?: boolean;
  devMode?: boolean;
  staticRoutes?: boolean;
  loadFs?: (path: string) => Promise<unknown>;
};

export type Handlers = {
  GET?(ctx: Context): Response | Promise<Response>;
  POST?(ctx: Context): Response | Promise<Response>;
  PUT?(ctx: Context): Response | Promise<Response>;
  DELETE?(ctx: Context): Response | Promise<Response>;
  PATCH?(ctx: Context): Response | Promise<Response>;
  OPTIONS?(ctx: Context): Response | Promise<Response>;
  HEAD?(ctx: Context): Response | Promise<Response>;
};
export type LimetteContext = {
  readonly request: Request | OakRequest;
  readonly response: Response | OakResponse;
  readonly cookies: RouterContext<string>["cookies"];
  readonly params: RouterContext<string>["params"];
  render(data?: unknown): Promise<Response> | Promise<OakResponse>;
};

export type ComponentContext = {
  params: RouterContext<string>["params"];
  data: unknown;
};

export async function getRouter(options: GetRouterOptions) {
  const router = new Router();

  const [routes, AppRoot] = await Promise.all([
    getRoutes(options),
    getAppTemplate(options),
  ]);

  if (!AppRoot) {
    throw new Error(
      "You need to create an AppRoot (_app.ts/js) to render a page."
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
    const middlewares = route.middlewares
      .map((module) => module?.handler)
      .flat()
      .filter(Boolean) as Middleware[];

    // Register custom handlers
    if (route.routeModule?.handler) {
      for (const [handlerName, handlerFn] of Object.entries(
        route.routeModule.handler
      )) {
        const routeHandler = async (
          routerContext: RouterContext<typeof route.path>
        ) => {
          const ctx: LimetteContext = {
            request: routerContext.request,
            response: routerContext.response,
            cookies: routerContext.cookies,
            params: routerContext.params,
            render: async (data: ComponentContext["data"]) => {
              if (!route.routeModule?.default) {
                throw new Error(
                  "No component was provided. Make sure you export a component as default to be redered."
                );
              }

              const content = await renderContent(
                AppRoot,
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

          routerContext.response.status = response.status;
          routerContext.response.type = response.headers.get(
            "Content-Type"
          ) as string;
          routerContext.response.headers = response.headers;
          routerContext.response.body = response.body;
        };

        // Register route
        router[handlerName.toLocaleLowerCase() as Lowercase<keyof Handlers>](
          route.path,
          // @ts-ignore middlewares is always a tuple
          ...middlewares,
          routeHandler
        );
      }
    }

    // Default behaviour if no GET handler is provided
    if (route.routeModule?.default && !route.routeModule?.handler?.GET) {
      const routeHandler = async (
        routerContext: RouterContext<typeof route.path>
      ) => {
        const content = await renderContent(AppRoot, route, routerContext);

        routerContext.response.type = "text/html";
        routerContext.response.body = content;
      };

      router.get(
        route.path,
        // @ts-ignore middlewares is always a tuple
        ...middlewares,
        routeHandler
      );
    }
  });

  return router;
}
