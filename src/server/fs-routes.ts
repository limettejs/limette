import { getRoutes, getAppTemplate } from "../dev/build.ts";
import type { App, Context, ComponentContext } from "./app.ts";
import type { Method } from "./router.ts";
import { renderContent } from "./ssr.ts";
import type { BuilderOptions } from "../dev/builder.ts";

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
          status: 200,
          headers: {
            "Content-Type": "text/html",
          },
        });
      };

      app.get(route.path, ...middlewares, routeHandler);
    }
  });
}
