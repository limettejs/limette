import { type Method, UrlPatternRouter } from './router.ts';
import { type MiddlewareFn, runMiddlewares } from './middlewares.ts';
import { HttpError } from './error.ts';
import { Context } from './context.ts';

// TODO: context on client side

export interface AppConfig {
  basePath?: string;
}

interface ResolvedAppConfig {
  basePath: string;
}

export type AppHandler = (
  request: Request,
  info?: unknown,
) => Response | Promise<Response>;

const DEFAULT_NOT_FOUND = () => {
  throw new HttpError(404);
};
const DEFAULT_NOT_ALLOWED_METHOD = () => {
  throw new HttpError(405);
};

export function mergePaths(a: string, b: string) {
  if (a === '' || a === '/' || a === '/*') return b;
  if (b === '/') return a;
  if (a.endsWith('/')) {
    return a.slice(0, -1) + b;
  } else if (!b.startsWith('/')) {
    return a + '/' + b;
  }
  return a + b;
}

function normalizeConfig(options?: AppConfig): ResolvedAppConfig {
  return {
    basePath: options?.basePath || '',
  };
}

export class App {
  config: ResolvedAppConfig;
  #fsRoutesEnabled = false;

  middlewares: MiddlewareFn[] = [];
  #router = new UrlPatternRouter();

  constructor(config?: AppConfig) {
    this.config = normalizeConfig(config);
  }

  use(middleware: MiddlewareFn): this {
    this.#router.addMiddleware(middleware);
    return this;
  }

  fsRoutes(): this {
    this.#fsRoutesEnabled = true;
    return this;
  }

  /** @internal Used by Limette's Vite development and generated entry. */
  _hasFsRoutes(): boolean {
    return this.#fsRoutesEnabled;
  }

  error(pathname: string | URLPattern, middleware: MiddlewareFn): this {
    this.#router.addError(pathname, middleware);
    return this;
  }

  get(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes('GET', path, middlewares);
  }
  post(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes('POST', path, middlewares);
  }
  patch(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes('PATCH', path, middlewares);
  }
  put(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes('PUT', path, middlewares);
  }
  delete(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes('DELETE', path, middlewares);
  }
  head(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes('HEAD', path, middlewares);
  }
  all(path: string, ...middlewares: MiddlewareFn[]): this {
    return this.#addRoutes('ALL', path, middlewares);
  }

  #addRoutes(
    method: Method | 'ALL',
    pathname: string | URLPattern,
    middlewares: MiddlewareFn[],
  ): this {
    const merged = typeof pathname === 'string'
      ? mergePaths(this.config.basePath, pathname)
      : pathname;
    this.#router.add(method, merged, middlewares);
    return this;
  }

  handler(): AppHandler {
    return async (request: Request, info: unknown = {}) => {
      const url = new URL(request.url);
      // Prevent open redirect attacks
      url.pathname = url.pathname.replace(/\/+/g, '/');
      const method = request.method.toUpperCase() as Method;

      const matched = this.#router.match(method, url);

      const next = matched.patternMatch && !matched.methodMatch
        ? DEFAULT_NOT_ALLOWED_METHOD
        : DEFAULT_NOT_FOUND;

      const { params, handlers } = matched;

      const ctx = new Context({
        request,
        url,
        info,
        params,
        config: this.config,
        next,
      });

      try {
        if (handlers.length === 1 && handlers[0].length === 1) {
          return await handlers[0][0](ctx);
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
            console.error(err);
            return await runMiddlewares([[errorRoute.handler]], ctx);
          } catch (e) {
            console.error(e);
            return new Response('Internal server error', { status: 500 });
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
        return new Response('Internal server error', { status: 500 });
      }
    };
  }
}
