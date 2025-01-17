import { type Method, UrlPatternRouter } from "./router.ts";
import { type MiddlewareFn, runMiddlewares } from "./middlewares.ts";
import { staticBuildMiddleware } from "./static-files.ts";
import { HttpError } from "./error.ts";
import { setFsRoutes } from "./fs.ts";
import { bgGreen, blue } from "@std/fmt/colors";
import type { FsRoutesPluginOptions } from "../plugins/fs-routes.ts";
import type { TailwindPluginOptions } from "../plugins/tailwind.ts";
import type { Builder } from "../dev/builder.ts";
import { Context } from "./context.ts";

// TODO: context on client side

export interface AppConfig {
  basePath?: string;
  mode?: "development" | "production";
  builder?: Builder;
}

interface ResolvedAppConfig {
  basePath: string;
  mode: "development" | "production";
  builder?: Builder;
}

export type ListenOptions = Partial<
  Deno.ServeTcpOptions & Deno.TlsCertifiedKeyPem
> & {
  remoteAddress?: string;
};

interface BuiltinPluginOptions {
  fsRoutes: FsRoutesPluginOptions;
  tailwind: TailwindPluginOptions;
}

const DEFAULT_NOT_FOUND = () => {
  throw new HttpError(404);
};
const DEFAULT_NOT_ALLOWED_METHOD = () => {
  throw new HttpError(405);
};

export function mergePaths(a: string, b: string) {
  if (a === "" || a === "/" || a === "/*") return b;
  if (b === "/") return a;
  if (a.endsWith("/")) {
    return a.slice(0, -1) + b;
  } else if (!b.startsWith("/")) {
    return a + "/" + b;
  }
  return a + b;
}

function normalizeConfig(options?: AppConfig): ResolvedAppConfig {
  return {
    basePath: options?.basePath || "",
    mode: options?.mode || "production",
    builder: options?.builder,
  };
}

export class App {
  config: ResolvedAppConfig;
  builder?: Builder;
  #builtinPluginOptions: BuiltinPluginOptions = {
    fsRoutes: {
      enabled: false,
      loadFile: undefined,
    },
    tailwind: {
      enabled: false,
    },
  };

  middlewares: MiddlewareFn[] = [];
  #router = new UrlPatternRouter();

  get builtinPluginOptions() {
    return this.#builtinPluginOptions;
  }

  constructor(config?: AppConfig) {
    this.config = normalizeConfig(config);
  }

  _setBuiltinPluginOptions<K extends keyof BuiltinPluginOptions>(
    pluginName: K,
    options: BuiltinPluginOptions[K]
  ): void {
    this.#builtinPluginOptions[pluginName] = options;
  }

  use(middleware: MiddlewareFn): this {
    this.#router.addMiddleware(middleware);
    return this;
  }

  error(pathname: string | URLPattern, middleware: MiddlewareFn): this {
    this.#router.addError(pathname, middleware);
    return this;
  }

  get(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes("GET", path, middlewares);
  }
  post(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes("POST", path, middlewares);
  }
  patch(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes("PATCH", path, middlewares);
  }
  put(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes("PUT", path, middlewares);
  }
  delete(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes("DELETE", path, middlewares);
  }
  head(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes("HEAD", path, middlewares);
  }
  all(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes("ALL", path, middlewares);
  }

  #addRoutes(
    method: Method | "ALL",
    pathname: string | URLPattern,
    middlewares: MiddlewareFn[]
  ): this {
    const merged =
      typeof pathname === "string"
        ? mergePaths(this.config.basePath, pathname)
        : pathname;
    this.#router.add(method, merged, middlewares);
    return this;
  }

  handler(): Deno.ServeHandler {
    return async (request: Request, conn: Deno.ServeHandlerInfo) => {
      const url = new URL(request.url);
      // Prevent open redirect attacks
      url.pathname = url.pathname.replace(/\/+/g, "/");
      const method = request.method.toUpperCase() as Method;

      const matched = this.#router.match(method, url);

      const next =
        matched.patternMatch && !matched.methodMatch
          ? DEFAULT_NOT_ALLOWED_METHOD
          : DEFAULT_NOT_FOUND;

      const { params, handlers } = matched;

      const ctx = new Context({
        request,
        url,
        info: conn,
        params,
        config: this.config,
        next,
      });

      try {
        if (handlers.length === 1 && handlers[0].length === 1) {
          return handlers[0][0](ctx);
        }
        return await runMiddlewares(handlers, ctx);
      } catch (err) {
        // Check if we have an error page registered for the url
        const errorRoute = this.#router.matchError(url);

        if (errorRoute.handler) {
          if (err instanceof HttpError) {
            ctx.error = err;
          }
          try {
            return await runMiddlewares([[errorRoute.handler]], ctx);
          } catch (e) {
            console.error(e);
            return new Response("Internal server error", { status: 500 });
          }
        }

        if (err instanceof HttpError) {
          if (err.status >= 500) {
            // deno-lint-ignore no-console
            console.error(err);
          }
          return new Response(err.message, { status: err.status });
        }

        // deno-lint-ignore no-console
        console.error(err);
        return new Response("Internal server error", { status: 500 });
      }
    };
  }

  async listen(options: ListenOptions = {}): Promise<void> {
    const t0 = performance.now();
    if (!options.onListen) {
      options.onListen = (params) => {
        const pathname = this.config.basePath + "/";
        const protocol =
          "key" in options && options.key && options.cert ? "https:" : "http:";

        let hostname = params.hostname;

        if (
          Deno.build.os === "windows" &&
          (hostname === "0.0.0.0" || hostname === "::")
        ) {
          hostname = "localhost";
        }
        // Work around https://github.com/denoland/deno/issues/23650
        hostname = hostname.startsWith("::") ? `[${hostname}]` : hostname;
        const address = `${protocol}//${hostname}:${params.port}${pathname}`;
      };
    }

    // For production mode, use the static build middleware
    if (this.config.mode === "production") {
      this.get("/_limette/*", staticBuildMiddleware);
    }

    // Set routes
    if (this.#builtinPluginOptions.fsRoutes?.enabled === true) {
      await setFsRoutes(this);
    }

    const handler = this.handler();
    if (options.port) {
      Deno.serve(options, handler);
      const t1 = performance.now();
      const duration = ((t1 - t0) / 1000).toFixed(2);
      console.log(
        `🟢 ${bgGreen(" Limette ")} app started (${duration}s) \n\t ${blue(
          `http://localhost:${options.port}`
        )}\n`
      );
    } else {
      // No port specified, check for a free port. Instead of picking just
      // any port we'll check if the next one is free for UX reasons.
      // That way the user only needs to increment a number when running
      // multiple apps vs having to remember completely different ports.
      let firstError;
      for (let port = 8000; port < 8020; port++) {
        try {
          Deno.serve({ ...options, port }, handler);
          firstError = undefined;
          const t1 = performance.now();
          const duration = ((t1 - t0) / 1000).toFixed(2);
          console.log(
            `🟢 ${bgGreen(" Limette ")} app started (${duration}s) \n\t ${blue(
              `http://localhost:${port}`
            )}\n`
          );
          break;
        } catch (err) {
          if (err instanceof Deno.errors.AddrInUse) {
            // Throw first EADDRINUSE error
            // if no port is free
            if (!firstError) {
              firstError = err;
            }
            continue;
          }

          throw err;
        }
      }

      if (firstError) {
        throw firstError;
      }
    }
  }
}
