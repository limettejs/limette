import './ssr.ts';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from 'lit';
import type { Middleware } from './middlewares.ts';
import type { RouteHandler, RouteHandlers } from './handlers.ts';
import type { ServerComponentClass } from './components.ts';
import type { DefaultState } from './context.ts';
import { METHODS, type Method } from './methods.ts';
import { HttpError } from './error.ts';

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
  allowedMethods: Method[];
  error?: HttpError;
  methodMatch: boolean;
  patternMatch: boolean;
  pattern: string | null;
}

const ALLOW_METHOD_ORDER: readonly Method[] = [
  'GET',
  'HEAD',
  ...METHODS.filter((method) => method !== 'GET' && method !== 'HEAD'),
];

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

function createParams(): Record<string, string> {
  return Object.create(null) as Record<string, string>;
}

function decodePathnameGroups(groups: Record<string, string | undefined>) {
  const entries: Array<[string, string]> = [];

  try {
    for (const [key, value] of Object.entries(groups)) {
      entries.push([key, value === undefined ? '' : decodeURI(value)]);
    }
  } catch (cause) {
    if (!(cause instanceof URIError)) throw cause;
    return {
      entries,
      error: new HttpError(400, 'Bad Request', { cause }),
    };
  }

  return { entries, error: undefined };
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
    this.#errors.push({
      path: typeof pathname === 'string' ? new URLPattern({ pathname }) : pathname,
      handler: fn,
    });
  }

  add(
    method: Method | 'ALL',
    pathname: string | URLPattern,
    handlers: RouteHandler<State, Platform>[]
  ) {
    const path = typeof pathname === 'string' ? new URLPattern({ pathname }) : pathname;
    const key = `${method}\u0000${patternIdentity(path)}`;
    if (this.#routeKeys.has(key)) {
      throw new Error(`Duplicate route registration for ${method} ${path.pathname}.`);
    }
    this.#routeKeys.add(key);
    this.#routes.push({
      path,
      handlers,
      method,
    });
  }

  #createResult(): RouteResult<State, Platform> {
    const result: RouteResult<State, Platform> = {
      params: createParams(),
      handlers: [],
      allowedMethods: [],
      methodMatch: false,
      patternMatch: false,
      pattern: null,
    };

    if (this.#middlewares.length > 0) {
      result.handlers.push(this.#middlewares);
    }

    return result;
  }

  #findExactMatch(method: Method, url: URL) {
    for (let index = 0; index < this.#routes.length; index++) {
      const route = this.#routes[index];
      if (route.method !== method) continue;
      if (route.path.exec(url) !== null) return index;
    }
  }

  #matchCompatible(method: string, url: URL, selectedIndex?: number): RouteResult<State, Platform> {
    const result = this.#createResult();

    for (let index = 0; index < this.#routes.length; index++) {
      if (selectedIndex !== undefined && index > selectedIndex) break;
      const route = this.#routes[index];
      if (
        route.method !== 'ALL' &&
        (selectedIndex === undefined ? route.method !== method : index !== selectedIndex)
      ) {
        continue;
      }
      const match = route.path.exec(url);

      if (match !== null) {
        result.patternMatch = true;
        result.pattern = route.path.pathname;
        const decoded = decodePathnameGroups(match.pathname.groups);
        if (decoded.error) {
          result.error = decoded.error;
          return result;
        }
        for (const [key, value] of decoded.entries) {
          result.params[key] = value;
        }
        result.handlers.push(route.handlers);

        if (route.method === 'ALL') continue;
        result.methodMatch = true;
        return result;
      }
    }

    return result;
  }

  match(method: string, url: URL): RouteResult<State, Platform> {
    let result: RouteResult<State, Platform>;

    if (method === 'HEAD') {
      const selectedIndex = this.#findExactMatch('HEAD', url) ?? this.#findExactMatch('GET', url);
      result =
        selectedIndex === undefined
          ? this.#matchCompatible(method, url)
          : this.#matchCompatible(method, url, selectedIndex);
    } else {
      result = this.#matchCompatible(method, url);
    }

    if (result.methodMatch || result.error) return result;

    const allowed = new Set<Method>();
    for (const route of this.#routes) {
      if (route.method === 'ALL') continue;
      if (route.path.exec(url) === null) continue;
      result.patternMatch = true;
      result.pattern ??= route.path.pathname;
      allowed.add(route.method);
    }

    if (allowed.has('GET')) allowed.add('HEAD');
    if (allowed.size > 0) allowed.add('OPTIONS');
    result.allowedMethods = ALLOW_METHOD_ORDER.filter((method) => allowed.has(method));

    return result;
  }

  matchError(url: URL): ErrorRouteResult<State, Platform> {
    const result: ErrorRouteResult<State, Platform> = {
      params: createParams(),
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
