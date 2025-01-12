import { type Method, UrlPatternRouter } from "./router.ts";
import { type MiddlewareFn, runMiddlewares } from "./middleware.ts";
import { staticBuildMiddleware } from "./static-files.ts";
import { refreshMiddleware } from "../dev/refresh-middleware.ts";
import { HttpError } from "./error.ts";
import { type FsRoutesOptions, setFsRoutes } from "./fs-routes.ts";

interface AppConfig {
  basePath?: string;
  mode?: "development" | "production";
}

interface ResolvedAppConfig {
  basePath: string;
  mode: "development" | "production";
}

export type ListenOptions = Partial<
  Deno.ServeTcpOptions & Deno.TlsCertifiedKeyPem
> & {
  remoteAddress?: string;
};

export interface ContextInit {
  request: Request;
  url: URL;
  info: Deno.ServeHandlerInfo;
  params: Record<string, string>;
  config: AppConfig;
  next: () => Promise<Response>;
}
export interface Context extends ContextInit {
  error: unknown;
  render: (data?: unknown) => Promise<Response>;
  redirect(path: string, status?: number): Response;
}

export interface ComponentContext {
  params: Context["params"];
  data: unknown;
}

export class Context implements Context {
  constructor({ request, url, info, params, config, next }: ContextInit) {
    this.request = request;
    this.url = url;
    this.info = info;
    this.params = params;
    this.config = config;
    this.next = next;
  }

  redirect(pathOrUrl: string, status = 302): Response {
    let location = pathOrUrl;

    // Disallow protocol relative URLs
    if (pathOrUrl !== "/" && pathOrUrl.startsWith("/")) {
      let idx = pathOrUrl.indexOf("?");
      if (idx === -1) {
        idx = pathOrUrl.indexOf("#");
      }

      const pathname = idx > -1 ? pathOrUrl.slice(0, idx) : pathOrUrl;
      const search = idx > -1 ? pathOrUrl.slice(idx) : "";

      // Remove double slashes to prevent open redirect vulnerability.
      location = `${pathname.replaceAll(/\/+/g, "/")}${search}`;
    }

    return new Response(null, {
      status,
      headers: {
        location,
      },
    });
  }
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
    mode: options?.mode || "development",
  };
}

export class App {
  config: ResolvedAppConfig;
  #devMode: boolean = false;
  #fsRoutesOptions: FsRoutesOptions = {
    enabled: false,
    loadFs: undefined,
  };

  middlewares: MiddlewareFn[] = [];
  #router = new UrlPatternRouter();

  constructor(config?: AppConfig) {
    this.config = normalizeConfig(config);
  }

  _getDevMode(): boolean {
    return this.#devMode;
  }
  _setDevMode(devMode: boolean): void {
    this.#devMode = devMode;
  }
  _setFsRoutesOption(options: FsRoutesOptions): void {
    this.#fsRoutesOptions = options;
  }

  use(middleware: MiddlewareFn): this {
    this.#router.addMiddleware(middleware);
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

    // For dev mode, use the refresh middleware
    if (this.#devMode) {
      this.use(refreshMiddleware);
    }

    // For production mode, use the static build middleware
    if (!this.#devMode) {
      this.get("/_limette/*", staticBuildMiddleware);
    }

    // Serve static files
    // this.use(staticFiles);

    // Set routes
    if (this.#fsRoutesOptions?.enabled === true) {
      await setFsRoutes(this, {
        buildAssets: this.#devMode,
        devMode: this.#devMode,
        loadFs: this.#fsRoutesOptions.loadFs,
      });
    }

    const handler = this.handler();
    if (options.port) {
      Deno.serve(options, handler);
      console.log(`Limette app started on: http://localhost:${options.port}`);
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
          console.log(`Limette app started on: http://localhost:${port}`);
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
