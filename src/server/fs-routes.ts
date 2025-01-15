import { getRoutes, getAppWrapper } from "../dev/build.ts";
import type { App } from "./app.ts";
import type { Method } from "./router.ts";
import type { BuilderOptions } from "../dev/builder.ts";
import { handlersForRoute } from "./handlers.ts";

export interface BuildRoutesOptions {
  buildAssets?: boolean;
  devMode?: boolean;
  tailwind?: boolean;
  target?: BuilderOptions["target"];
  loadFile?: (path: string) => Promise<unknown>;
}

/**
 * This will load the fs routes in the app.listen() method , only if the `fsRoutes` was called.
 */
export async function setFsRoutes(app: App) {
  const options: BuildRoutesOptions = {
    buildAssets: app.config.mode === "development",
    devMode: app.config.mode === "development",
    tailwind: app.builtinPluginOptions.tailwind.enabled,
    target: app.builder?.options.target,
    loadFile: app.builtinPluginOptions.fsRoutes.loadFile,
  };

  const [routes, AppWrapper] = await Promise.all([
    getRoutes(options),
    getAppWrapper(options),
  ]);

  if (!AppWrapper) {
    throw new Error(
      "You need to create an AppWrapper (_app.ts/js) to render a page."
    );
  }

  // Serve static files from memory on dev mode
  if (app.config.mode === "development") {
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

  for (const route of routes) {
    const handlers = handlersForRoute(route, AppWrapper);

    // Register error pages
    if (route.path.endsWith("/_error") && handlers?.GET) {
      app.error(route.path, handlers.GET);
      continue;
    }

    const middlewares = route.middlewares
      .map((module) => module?.handler)
      .flat();

    for (const [method, handler] of Object.entries(handlers)) {
      // Register route
      app[method.toLocaleLowerCase() as Lowercase<Method>](
        route.path,
        ...middlewares,
        handler
      );
    }
  }
}
