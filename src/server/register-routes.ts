import type { App } from './app.ts';
import { handlersForRoute } from './handlers.ts';
import type { RuntimeRouteDefinition } from './route.ts';
import type { Method } from './router.ts';
import type { AppWrapperComponentClass } from './ssr.ts';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import { LitElement } from 'lit';
import { islandComponent, type ServerComponentClass } from './components.ts';

export interface RegisterRouteDefinitionsOptions {
  readonly appWrapper: AppWrapperComponentClass;
  readonly routes: readonly RuntimeRouteDefinition[];
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

function prepareRoute(
  route: RuntimeRouteDefinition,
  appWrapper: AppWrapperComponentClass,
): RuntimeRouteDefinition {
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

export function registerRouteDefinitions(
  app: App,
  options: RegisterRouteDefinitionsOptions,
): void {
  const { appWrapper, routes } = options;

  if (!appWrapper) {
    throw new Error(
      'You need to create an AppWrapper (_app.ts/js) to render a page.',
    );
  }

  for (const route of routes) {
    const preparedRoute = prepareRoute(route, appWrapper);
    const handlers = handlersForRoute(preparedRoute, appWrapper);

    // Register error pages
    if (preparedRoute.path.endsWith('/_error') && handlers.GET) {
      app.error(preparedRoute.path, handlers.GET);
      continue;
    }

    const middlewares = preparedRoute.middlewares
      .map((module) => module?.handler)
      .flat();

    for (const [method, handler] of Object.entries(handlers)) {
      app[method.toLocaleLowerCase() as Lowercase<Method>](
        preparedRoute.path,
        ...middlewares,
        handler,
      );
    }
  }
}
