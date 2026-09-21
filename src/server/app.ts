import { UrlPatternRouter } from './router.ts';
import { type Middleware, runMiddlewares } from './middlewares.ts';
import { HttpError } from './error.ts';
import { ContextImpl, type DefaultState } from './context.ts';
import type { RouteHandler } from './handlers.ts';
import type { Method } from './methods.ts';

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

function normalizeBasePath(basePath = '') {
  if (!basePath || basePath === '/') return '';
  const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function joinRoutePath(basePath: string, routePath: string) {
  const normalizedRoute = routePath.replace(/^\/+/, '');
  if (!basePath) return normalizedRoute ? `/${normalizedRoute}` : '/';
  return normalizedRoute ? `${basePath}/${normalizedRoute}` : basePath;
}

function normalizeConfig(options?: AppConfig): ResolvedAppConfig {
  return {
    basePath: normalizeBasePath(options?.basePath),
  };
}

export class App<State = DefaultState, Platform = unknown> {
  readonly config: ResolvedAppConfig;
  #fsRoutesEnabled = false;

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

  get(
    path: string | URLPattern,
    handler: RouteHandler<State, Platform>,
    ...handlers: RouteHandler<State, Platform>[]
  ): this {
    return this.#addRoute('GET', path, [handler, ...handlers]);
  }
  post(
    path: string | URLPattern,
    handler: RouteHandler<State, Platform>,
    ...handlers: RouteHandler<State, Platform>[]
  ): this {
    return this.#addRoute('POST', path, [handler, ...handlers]);
  }
  patch(
    path: string | URLPattern,
    handler: RouteHandler<State, Platform>,
    ...handlers: RouteHandler<State, Platform>[]
  ): this {
    return this.#addRoute('PATCH', path, [handler, ...handlers]);
  }
  put(
    path: string | URLPattern,
    handler: RouteHandler<State, Platform>,
    ...handlers: RouteHandler<State, Platform>[]
  ): this {
    return this.#addRoute('PUT', path, [handler, ...handlers]);
  }
  delete(
    path: string | URLPattern,
    handler: RouteHandler<State, Platform>,
    ...handlers: RouteHandler<State, Platform>[]
  ): this {
    return this.#addRoute('DELETE', path, [handler, ...handlers]);
  }
  head(
    path: string | URLPattern,
    handler: RouteHandler<State, Platform>,
    ...handlers: RouteHandler<State, Platform>[]
  ): this {
    return this.#addRoute('HEAD', path, [handler, ...handlers]);
  }
  options(
    path: string | URLPattern,
    handler: RouteHandler<State, Platform>,
    ...handlers: RouteHandler<State, Platform>[]
  ): this {
    return this.#addRoute('OPTIONS', path, [handler, ...handlers]);
  }
  all(
    path: string | URLPattern,
    handler: RouteHandler<State, Platform>,
    ...handlers: RouteHandler<State, Platform>[]
  ): this {
    return this.#addRoute('ALL', path, [handler, ...handlers]);
  }

  #addRoute(
    method: Method | 'ALL',
    pathname: string | URLPattern,
    handlers: RouteHandler<State, Platform>[],
  ): this {
    const merged = typeof pathname === 'string'
      ? joinRoutePath(this.config.basePath, pathname)
      : pathname;
    this.#router.add(method, merged, handlers);
    return this;
  }

  handler(): AppHandler<Platform> {
    return async (request: Request, platform = undefined as Platform) => {
      const url = new URL(request.url);
      // Prevent open redirect attacks
      url.pathname = url.pathname.replace(/\/+/g, '/');
      const method = request.method.toUpperCase();

      const matched = this.#router.match(method, url);
      const decodingError = matched.error;

      const next = decodingError
        ? () => {
          throw decodingError;
        }
        : matched.patternMatch && !matched.methodMatch
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
