import type { App } from './app.ts';
import { handlersForRoute } from './handlers.ts';
import type { RuntimeRouteDefinition } from './route.ts';
import type { Method } from './router.ts';
import type { AppWrapperComponentClass } from './ssr.ts';

export interface RegisterRouteDefinitionsOptions {
  readonly appWrapper: AppWrapperComponentClass;
  readonly routes: readonly RuntimeRouteDefinition[];
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
    const handlers = handlersForRoute(route, appWrapper);

    // Register error pages
    if (route.path.endsWith('/_error') && handlers.GET) {
      app.error(route.path, handlers.GET);
      continue;
    }

    const middlewares = route.middlewares
      .map((module) => module?.handler)
      .flat();

    for (const [method, handler] of Object.entries(handlers)) {
      app[method.toLocaleLowerCase() as Lowercase<Method>](
        route.path,
        ...middlewares,
        handler,
      );
    }
  }
}
