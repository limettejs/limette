import './ssr.ts';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from 'lit';
import type { Middleware } from './middlewares.ts';
import type { RouteHandler, RouteHandlers } from './handlers.ts';
import type { ServerComponentClass } from './components.ts';
import type { DefaultState } from './context.ts';
import type { Method } from './methods.ts';

export interface RouteConfig {
  skipInheritedLayouts: boolean; // Skip already inherited layouts
}

export interface RouteModule<State = DefaultState, Platform = unknown> {
  config: RouteConfig;
  handler: RouteHandlers<State, Platform>;
  default: ServerComponentClass | typeof LitElement;
}

interface RouteResult<State, Platform> {
  params: Record<string, string>;
  handlers: Middleware<State, Platform>[][];
  methodMatch: boolean;
  patternMatch: boolean;
  pattern: string | null;
}

export interface Route<State = DefaultState, Platform = unknown> {
  path: URLPattern;
  method: Method | 'ALL';
  handlers: RouteHandler<State, Platform>[];
}

function patternIdentity(pattern: URLPattern) {
  return [
    pattern.protocol,
    pattern.username,
    pattern.password,
    pattern.hostname,
    pattern.port,
    pattern.pathname,
    pattern.search,
    pattern.hash,
  ].join('\u0000');
}

interface ErrorRoute<State, Platform> {
  path: URLPattern;
  handler: Middleware<State, Platform>;
}

interface ErrorRouteResult<State, Platform> {
  params: Record<string, string>;
  handler: Middleware<State, Platform> | undefined;
  methodMatch: boolean;
  patternMatch: boolean;
  pattern: string | null;
}

export class UrlPatternRouter<State = DefaultState, Platform = unknown> {
  #routes: Route<State, Platform>[] = [];
  #routeKeys = new Set<string>();
  #middlewares: Middleware<State, Platform>[] = [];
  #errors: ErrorRoute<State, Platform>[] = [];

  addMiddleware(fn: Middleware<State, Platform>) {
    this.#middlewares.push(fn);
  }

  addError(pathname: string | URLPattern, fn: Middleware<State, Platform>) {
    let path = pathname;

    if (typeof pathname === 'string' && pathname.endsWith('/_error')) {
      path = pathname.substring(0, pathname.length - 7) + '/*';
    }

    this.#errors.push({
      path: typeof path === 'string'
        ? new URLPattern({ pathname: path })
        : path,
      handler: fn,
    });
  }

  add(
    method: Method | 'ALL',
    pathname: string | URLPattern,
    handlers: RouteHandler<State, Platform>[],
  ) {
    const path = typeof pathname === 'string'
      ? new URLPattern({ pathname })
      : pathname;
    const key = `${method}\u0000${patternIdentity(path)}`;
    if (this.#routeKeys.has(key)) {
      throw new Error(
        `Duplicate route registration for ${method} ${path.pathname}.`,
      );
    }
    this.#routeKeys.add(key);
    this.#routes.push({
      path,
      handlers,
      method,
    });
  }

  match(method: string, url: URL): RouteResult<State, Platform> {
    const result: RouteResult<State, Platform> = {
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
        result.patternMatch = true;
        result.pattern = route.path.pathname;

        if (route.method === 'ALL' || route.method === method) {
          result.methodMatch = true;
          result.handlers.push(route.handlers);

          // Decode matched params
          for (const [key, value] of Object.entries(match.pathname.groups)) {
            result.params[key] = value === undefined ? '' : decodeURI(value);
          }

          if (route.method === 'ALL') {
            continue;
          }

          return result;
        }
      }
    }

    return result;
  }

  matchError(url: URL): ErrorRouteResult<State, Platform> {
    const result: ErrorRouteResult<State, Platform> = {
      params: {},
      handler: undefined,
      methodMatch: false,
      patternMatch: false,
      pattern: null,
    };

    for (const route of this.#errors) {
      const match = route.path.exec(url);
      if (match !== null) {
        result.handler = route.handler;
        result.methodMatch = true;
        result.patternMatch = true;
        result.pattern = route.path.pathname;

        return result;
      }
    }

    return result;
  }
}
