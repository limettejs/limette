import { type Method, UrlPatternRouter } from './router.ts';
import { type Middleware, runMiddlewares } from './middlewares.ts';
import { HttpError } from './error.ts';
import { ContextImpl, type DefaultState } from './context.ts';

export interface AppConfig {
  readonly basePath?: string;
}

interface ResolvedAppConfig {
  readonly basePath: string;
}

export type AppHandler<Platform = unknown> = (
  request: Request,
  platform?: Platform,
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

export class App<State = DefaultState, Platform = unknown> {
  readonly config: ResolvedAppConfig;
  #fsRoutesEnabled = false;

  middlewares: Middleware<State, Platform>[] = [];
  #router = new UrlPatternRouter<State, Platform>();

  constructor(config?: AppConfig) {
    this.config = normalizeConfig(config);
  }

  use(middleware: Middleware<State, Platform>): this {
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

  error(
    pathname: string | URLPattern,
    middleware: Middleware<State, Platform>,
  ): this {
    this.#router.addError(pathname, middleware);
    return this;
  }

  get(path: string, ...middlewares: Middleware<State, Platform>[]): this {
    return this.#addRoutes('GET', path, middlewares);
  }
  post(path: string, ...middlewares: Middleware<State, Platform>[]): this {
    return this.#addRoutes('POST', path, middlewares);
  }
  patch(path: string, ...middlewares: Middleware<State, Platform>[]): this {
    return this.#addRoutes('PATCH', path, middlewares);
  }
  put(path: string, ...middlewares: Middleware<State, Platform>[]): this {
    return this.#addRoutes('PUT', path, middlewares);
  }
  delete(path: string, ...middlewares: Middleware<State, Platform>[]): this {
    return this.#addRoutes('DELETE', path, middlewares);
  }
  head(path: string, ...middlewares: Middleware<State, Platform>[]): this {
    return this.#addRoutes('HEAD', path, middlewares);
  }
  options(path: string, ...middlewares: Middleware<State, Platform>[]): this {
    return this.#addRoutes('OPTIONS', path, middlewares);
  }
  all(path: string, ...middlewares: Middleware<State, Platform>[]): this {
    return this.#addRoutes('ALL', path, middlewares);
  }

  #addRoutes(
    method: Method | 'ALL',
    pathname: string | URLPattern,
    middlewares: Middleware<State, Platform>[],
  ): this {
    const merged = typeof pathname === 'string'
      ? mergePaths(this.config.basePath, pathname)
      : pathname;
    this.#router.add(method, merged, middlewares);
    return this;
  }

  handler(): AppHandler<Platform> {
    return async (request: Request, platform = undefined as Platform) => {
      const url = new URL(request.url);
      // Prevent open redirect attacks
      url.pathname = url.pathname.replace(/\/+/g, '/');
      const method = request.method.toUpperCase() as Method;

      const matched = this.#router.match(method, url);

      const next = matched.patternMatch && !matched.methodMatch
        ? DEFAULT_NOT_ALLOWED_METHOD
        : DEFAULT_NOT_FOUND;

      const { params, handlers } = matched;

      const ctx = new ContextImpl<State, Platform>({
        request,
        url,
        platform,
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
          const error = err instanceof HttpError
            ? err
            : new HttpError(500, undefined, { cause: err });
          ctx._setError(error);
          try {
            if (error.status >= 500) console.error(err);
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
