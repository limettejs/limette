import './ssr.ts';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from 'lit';
import type { MiddlewareFn } from './middlewares.ts';
import type { Handlers } from './handlers.ts';
import type { ServerComponentClass } from './components.ts';
import type { DefaultState } from './context.ts';

export type Method = 'HEAD' | 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RouteConfig {
  skipInheritedLayouts: boolean; // Skip already inherited layouts
}

export interface RouteModule<State = DefaultState, Platform = unknown> {
  config: RouteConfig;
  handler: Handlers<State, Platform>;
  default: ServerComponentClass | typeof LitElement;
}

interface RouteResult<State, Platform> {
  params: Record<string, string>;
  handlers: MiddlewareFn<State, Platform>[][];
  methodMatch: boolean;
  patternMatch: boolean;
  pattern: string | null;
}

export interface Route<State = DefaultState, Platform = unknown> {
  path: URLPattern;
  method: Method | 'ALL';
  handlers: MiddlewareFn<State, Platform>[];
}

interface ErrorRoute<State, Platform> {
  path: URLPattern;
  handler: MiddlewareFn<State, Platform>;
}

interface ErrorRouteResult<State, Platform> {
  params: Record<string, string>;
  handler: MiddlewareFn<State, Platform> | undefined;
  methodMatch: boolean;
  patternMatch: boolean;
  pattern: string | null;
}

export class UrlPatternRouter<State = DefaultState, Platform = unknown> {
  #routes: Route<State, Platform>[] = [];
  #middlewares: MiddlewareFn<State, Platform>[] = [];
  #errors: ErrorRoute<State, Platform>[] = [];

  addMiddleware(fn: MiddlewareFn<State, Platform>) {
    this.#middlewares.push(fn);
  }

  addError(pathname: string | URLPattern, fn: MiddlewareFn<State, Platform>) {
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
    handlers: MiddlewareFn<State, Platform>[],
  ) {
    this.#routes.push({
      path: typeof pathname === 'string'
        ? new URLPattern({ pathname })
        : pathname,
      handlers,
      method,
    });
  }

  match(method: Method, url: URL): RouteResult<State, Platform> {
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
        if (route.method !== 'ALL') result.patternMatch = true;
        result.pattern = route.path.pathname;

        if (route.method === 'ALL' || route.method === method) {
          result.handlers.push(route.handlers);

          // Decode matched params
          for (const [key, value] of Object.entries(match.pathname.groups)) {
            result.params[key] = value === undefined ? '' : decodeURI(value);
          }

          if (route.method === 'ALL') {
            continue;
          }

          result.methodMatch = true;
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
