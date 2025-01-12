import type { MiddlewareFn } from "./middleware.ts";
import "./ssr.ts";
import type { Context } from "./app.ts";

export type Method = "HEAD" | "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

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

export type Handlers = {
  GET?(ctx: Context): Response | Promise<Response>;
  POST?(ctx: Context): Response | Promise<Response>;
  PUT?(ctx: Context): Response | Promise<Response>;
  DELETE?(ctx: Context): Response | Promise<Response>;
  PATCH?(ctx: Context): Response | Promise<Response>;
  OPTIONS?(ctx: Context): Response | Promise<Response>;
  HEAD?(ctx: Context): Response | Promise<Response>;
};

export class UrlPatternRouter {
  #routes: Route[] = [];
  #middlewares: MiddlewareFn[] = [];

  addMiddleware(fn: MiddlewareFn) {
    this.#middlewares.push(fn);
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
}
