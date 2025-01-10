import type { MiddlewareFn } from "./middleware.ts";
import { getRoutes, getAppTemplate } from "../dev/build.ts";
import "../server/ssr.ts";
import type { Context } from "./app.ts";
import type { ComponentContext } from "../server/router.ts";
import type { LimetteApp } from "./app.ts";
import { renderContent } from "../server/ssr.ts";

export type Method = "HEAD" | "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RouteResult {
  params: Record<string, string>;
  handlers: MiddlewareFn[][];
  methodMatch: boolean;
  patternMatch: boolean;
  pattern: string | null;
}

export interface Route {
  path: URLPattern;
  method: Method | "ALL";
  handlers: MiddlewareFn[];
}

export interface GetRouterOptions {
  buildAssets?: boolean;
  devMode?: boolean;
  staticRoutes?: boolean;
  loadFs?: (path: string) => Promise<unknown>;
}

export class UrlPatternRouter {
  #routes: Route[] = [];
  #middlewares: MiddlewareFn[] = [];

  addMiddleware(fn: MiddlewareFn) {
    this.#middlewares.push(fn);
  }

  add(
    method: Method | "ALL",
    pathname: string | URLPattern,
    handlers: MiddlewareFn[]
  ) {
    this.#routes.push({
      path:
        typeof pathname === "string" ? new URLPattern({ pathname }) : pathname,
      handlers,
      method,
    });
  }

  match(method: Method, url: URL): RouteResult {
    const result: RouteResult = {
      params: {},
      handlers: [],
      methodMatch: false,
      patternMatch: false,
      pattern: null,
    };

    if (this.#middlewares.length > 0) {
      result.handlers.push(this.#middlewares);
    }

    for (const route of this.#routes) {
      const match = route.path.exec(url);

      if (match !== null) {
        if (route.method !== "ALL") result.patternMatch = true;
        result.pattern = route.path.pathname;

        if (route.method === "ALL" || route.method === method) {
          result.handlers.push(route.handlers);

          // Decode matched params
          for (const [key, value] of Object.entries(match.pathname.groups)) {
            result.params[key] = value === undefined ? "" : decodeURI(value);
          }

          if (route.method === "ALL") {
            continue;
          }

          result.methodMatch = true;
          return result;
        }
      }
    }

    return result;
  }
}

export async function setRoutes(app: LimetteApp, options: GetRouterOptions) {
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
    app.get("/_limette/js/chunk-:id.js", (ctx) => {
      const { id } = ctx.params;
      const route = routes.find((r) => r.id === id);

      return new Response(route?.jsAssetContent?.contents, {
        headers: {
          "Content-Type": "application/javascript; charset=UTF-8",
        },
      });
    });

    app.get("/_limette/css/tailwind-:id.css", (ctx) => {
      const { id } = ctx.params;
      const route = routes.find((r) => r.id === id);

      return new Response(route?.cssAssetContent, {
        headers: {
          "Content-Type": "text/css; charset=UTF-8",
        },
      });
    });
  }

  routes.map((route) => {
    const middlewares = route.middlewares
      .map((module) => module?.handler)
      .flat();

    // Register custom handlers
    if (route.routeModule?.handler) {
      for (const [method, handlerFn] of Object.entries(
        route.routeModule.handler
      )) {
        const routeHandler = async (ctx: Context) => {
          ctx.render = async (data: ComponentContext["data"]) => {
            if (!route.routeModule?.default) {
              throw new Error(
                "No component was provided. Make sure you export a component as default to be redered."
              );
            }

            const content = await renderContent(AppRoot, route, ctx, data);

            return new Response(content, {
              status: 200,
              statusText: "OK",
              headers: new Headers({ "Content-Type": "text/html" }),
            });
          };

          return await handlerFn(ctx);
        };

        // Register route
        app[method.toLocaleLowerCase() as Lowercase<Method>](
          route.path,
          ...middlewares,
          routeHandler
        );
      }
    }

    // Default behaviour if no GET handler is provided
    if (route.routeModule?.default && !route.routeModule?.handler?.GET) {
      const routeHandler = async (ctx: Context) => {
        const content = await renderContent(AppRoot, route, ctx);

        return new Response(content, {
          headers: {
            "Content-Type": "text/html",
          },
        });
      };

      app.get(route.path, ...middlewares, routeHandler);
    }
  });
}
