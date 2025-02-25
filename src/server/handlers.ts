import type { BuildRoute } from "../dev/build.ts";
import type { Context } from "./context.ts";
import { HttpError } from "./error.ts";
import type { MiddlewareFn } from "./middlewares.ts";
import { type AppWrapperComponentClass, renderContent } from "./ssr.ts";

export interface Handlers {
  GET?: MiddlewareFn;
  POST?: MiddlewareFn;
  PUT?: MiddlewareFn;
  DELETE?: MiddlewareFn;
  PATCH?: MiddlewareFn;
  OPTIONS?: MiddlewareFn;
  HEAD?: MiddlewareFn;
}

export function handlersForRoute(
  route: BuildRoute,
  AppWrapper: AppWrapperComponentClass
) {
  const handlers: Handlers = {};

  // Register custom handlers
  if (route.routeModule?.handler) {
    for (const [method, fn] of Object.entries(route.routeModule.handler)) {
      const handler = async (ctx: Context) => {
        ctx.render = async (data: Context["data"]) => {
          if (!route.routeModule?.default) {
            throw new Error(
              "No component was provided. Make sure you export a component as default to be redered."
            );
          }

          ctx.data = data;

          const content = await renderContent(AppWrapper, route, ctx);

          let status = 200;
          if (ctx.error instanceof HttpError) {
            status = ctx.error.status ?? 200;
          }

          return new Response(content, {
            status: status,
            statusText: "OK",
            headers: new Headers({ "Content-Type": "text/html" }),
          });
        };

        return await fn(ctx);
      };
      handlers[method as keyof Handlers] = handler as MiddlewareFn;
    }
  }

  // Default behaviour if no GET handler is provided
  if (route.routeModule?.default && !route.routeModule?.handler?.GET) {
    // TODO: Add render method to ctx for this case
    const handler = async (ctx: Context) => {
      const content = await renderContent(AppWrapper, route, ctx);

      let status = 200;
      if (ctx.error instanceof HttpError) {
        status = ctx.error.status ?? 200;
      }

      return new Response(content, {
        status: status,
        headers: {
          "Content-Type": "text/html",
        },
      });
    };

    handlers["GET"] = handler;
  }

  return handlers;
}
