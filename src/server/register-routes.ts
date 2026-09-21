import type { App } from './app.ts';
import { handlersForRoute, type RouteHandler } from './handlers.ts';
import type { RuntimeRouteDefinition } from './route.ts';
import { type Method, METHODS } from './methods.ts';
import type { AppWrapperComponentClass } from './ssr.ts';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import { LitElement } from 'lit';
import { islandComponent, type ServerComponentClass } from './components.ts';
import type { DefaultState } from './context.ts';
import type { Middleware } from './middlewares.ts';

function registerMethod<State = DefaultState, Platform = unknown>(
  app: App<State, Platform>,
  method: Method,
  path: string | URLPattern,
  handlers: RouteHandler<State, Platform>[],
) {
  const [handler, ...remainingHandlers] = handlers;
  if (!handler) {
    throw new Error(`Cannot register ${method} ${path} without a handler.`);
  }

  switch (method) {
    case 'GET':
      return app.get(path, handler, ...remainingHandlers);
    case 'POST':
      return app.post(path, handler, ...remainingHandlers);
    case 'PUT':
      return app.put(path, handler, ...remainingHandlers);
    case 'PATCH':
      return app.patch(path, handler, ...remainingHandlers);
    case 'DELETE':
      return app.delete(path, handler, ...remainingHandlers);
    case 'HEAD':
      return app.head(path, handler, ...remainingHandlers);
    case 'OPTIONS':
      return app.options(path, handler, ...remainingHandlers);
  }
}

function isMiddleware<State = DefaultState, Platform = unknown>(
  value: unknown,
): value is Middleware<State, Platform> {
  return typeof value === 'function';
}

function normalizeMiddlewareModules<
  State = DefaultState,
  Platform = unknown,
>(
  modules: readonly unknown[],
  routeFile: string,
): Middleware<State, Platform>[] {
  const normalized: Middleware<State, Platform>[] = [];

  for (const [moduleIndex, middlewareModule] of modules.entries()) {
    if (
      !middlewareModule || typeof middlewareModule !== 'object' ||
      !('handler' in middlewareModule)
    ) {
      throw new TypeError(
        `Invalid filesystem middleware for route "${routeFile}" at index ${moduleIndex}: ` +
          'expected a module exporting "handler" as a function or array of functions.',
      );
    }

    const exported = middlewareModule.handler;
    const handlers = Array.isArray(exported) ? exported : [exported];

    for (const [handlerIndex, handler] of handlers.entries()) {
      if (!isMiddleware<State, Platform>(handler)) {
        throw new TypeError(
          `Invalid filesystem middleware for route "${routeFile}" at index ${moduleIndex}` +
            `${Array.isArray(exported) ? `, handler ${handlerIndex}` : ''}: ` +
            'expected "handler" to contain only functions.',
        );
      }
      normalized.push(handler);
    }
  }

  return normalized;
}

export interface RegisterRouteDefinitionsOptions<
  State = DefaultState,
  Platform = unknown,
> {
  readonly appWrapper: AppWrapperComponentClass<State, Platform>;
  readonly routes: readonly RuntimeRouteDefinition<State, Platform>[];
}

function collectIslandComponents(
  components: readonly (ServerComponentClass | undefined)[],
) {
  const islands: Record<string, CustomElementConstructor> = {};
  const visited = new Set<CustomElementConstructor>();

  const visit = (component: ServerComponentClass | undefined) => {
    if (!component || visited.has(component)) return;
    visited.add(component);
    for (
      const [tagName, definition] of Object.entries(component.islands ?? {})
    ) {
      const Island = islandComponent(definition);
      islands[tagName] = Island;
      visit(Island as ServerComponentClass);
    }
  };

  for (const component of components) visit(component);
  return islands;
}

function prepareRoute<State = DefaultState, Platform = unknown>(
  route: RuntimeRouteDefinition<State, Platform>,
  appWrapper: AppWrapperComponentClass<State, Platform>,
): RuntimeRouteDefinition<State, Platform> {
  const renderComponents = {
    ...Object.fromEntries(
      Object.entries(collectIslandComponents([
        appWrapper as unknown as ServerComponentClass,
        ...route.layouts.map((layout) =>
          layout.default as unknown as ServerComponentClass
        ),
        route.routeModule.default as ServerComponentClass,
        ...Object.values(route.renderComponents ?? {}).map((component) =>
          component as ServerComponentClass
        ),
      ])).filter(([tagName]) => route.ssrIslands.includes(tagName)),
    ),
    ...Object.fromEntries(
      Object.entries(route.renderComponents ?? {}).filter(([tagName]) =>
        !route.islands.includes(tagName) || route.ssrIslands.includes(tagName)
      ),
    ),
  };

  for (const tagName of route.islands) {
    if (!customElements.get(tagName)) {
      // Lit's SSR renderer needs a registered Lit class to recognize the tag.
      // The real island constructor is kept request-local and is used only
      // when this route explicitly opts the island into SSR.
      customElements.define(tagName, class extends LitElement {});
    }
  }

  return { ...route, renderComponents };
}

export function registerRouteDefinitions<
  State = DefaultState,
  Platform = unknown,
>(
  app: App<State, Platform>,
  options: RegisterRouteDefinitionsOptions<State, Platform>,
): void {
  const { appWrapper, routes } = options;

  if (!appWrapper) {
    throw new Error(
      'You need to create an AppWrapper (_app.ts/js) to render a page.',
    );
  }

  for (const route of routes) {
    const preparedRoute = prepareRoute(route, appWrapper);
    const errorRoute = preparedRoute.path.endsWith('/_error');
    const renderedRoute = errorRoute
      ? { ...preparedRoute, layouts: [] }
      : preparedRoute;
    const handlers = handlersForRoute(renderedRoute, appWrapper);

    // Register error pages
    if (errorRoute && handlers.GET) {
      app.error(preparedRoute.path, handlers.GET);
      continue;
    }

    const middlewares = normalizeMiddlewareModules<State, Platform>(
      preparedRoute.middlewares,
      preparedRoute.file,
    );

    for (const method of METHODS) {
      const handler = handlers[method];
      if (!handler) continue;
      registerMethod(
        app,
        method,
        preparedRoute.path,
        [...middlewares, handler],
      );
    }
  }
}
