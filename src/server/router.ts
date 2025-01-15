import "./ssr.ts";
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from "lit";
import type { MiddlewareFn } from "./middlewares.ts";
import type { Handlers } from "./handlers.ts";

export type Method = "HEAD" | "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RouteConfig {
  skipInheritedLayouts: boolean; // Skip already inherited layouts
}

export interface RouteModule {
  config: RouteConfig;
  handler: Handlers;
  default: LitElement;
}

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

interface ErrorRoute {
  path: URLPattern;
  handler: MiddlewareFn;
}

interface ErrorRouteResult {
  params: Record<string, string>;
  handler: MiddlewareFn | undefined;
  methodMatch: boolean;
  patternMatch: boolean;
  pattern: string | null;
}

export class UrlPatternRouter {
  #routes: Route[] = [];
  #middlewares: MiddlewareFn[] = [];
  #errors: ErrorRoute[] = [];

  addMiddleware(fn: MiddlewareFn) {
    this.#middlewares.push(fn);
  }

  addError(pathname: string | URLPattern, fn: MiddlewareFn) {
    let path = pathname;

    if (typeof pathname === "string" && pathname.endsWith("/_error")) {
      path = pathname.substring(0, pathname.length - 7) + "/:path*";
    }

    this.#errors.push({
      path:
        typeof path === "string" ? new URLPattern({ pathname: path }) : path,
      handler: fn,
    });

    console.log("add error", path);
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

  matchError(url: URL): ErrorRouteResult {
    const result: ErrorRouteResult = {
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
