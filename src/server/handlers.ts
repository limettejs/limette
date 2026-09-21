import type { RuntimeRouteDefinition } from './route.ts';
import type { ContextImpl, DefaultState } from './context.ts';
import { HttpError } from './error.ts';
import type { MiddlewareFn } from './middlewares.ts';
import { type AppWrapperComponentClass, renderContent } from './ssr.ts';

export interface Handlers<State = DefaultState, Platform = unknown> {
  GET?: MiddlewareFn<State, Platform>;
  POST?: MiddlewareFn<State, Platform>;
  PUT?: MiddlewareFn<State, Platform>;
  DELETE?: MiddlewareFn<State, Platform>;
  PATCH?: MiddlewareFn<State, Platform>;
  OPTIONS?: MiddlewareFn<State, Platform>;
  HEAD?: MiddlewareFn<State, Platform>;
}

export function handlersForRoute<State = DefaultState, Platform = unknown>(
  route: RuntimeRouteDefinition<State, Platform>,
  AppWrapper: AppWrapperComponentClass<State, Platform>,
) {
  const handlers: Handlers<State, Platform> = {};

  const renderRoute = async (ctx: ContextImpl<State, Platform>) => {
    if (!route.routeModule?.default) {
      throw new Error(
        'No component was provided. Make sure you export a component as default to be rendered.',
      );
    }

    const content = await renderContent(AppWrapper, route, ctx);
    const status = ctx.error instanceof HttpError ? ctx.error.status : 200;

    return new Response(content, {
      status,
      statusText: status === 200 ? 'OK' : undefined,
      headers: new Headers({ 'Content-Type': 'text/html' }),
    });
  };

  // Register custom handlers
  if (route.routeModule?.handler) {
    for (const [method, fn] of Object.entries(route.routeModule.handler)) {
      const handler: MiddlewareFn<State, Platform> = async (ctx) => {
        const internal = ctx as ContextImpl<State, Platform>;
        internal._setRender(() => renderRoute(internal));
        return await (fn as MiddlewareFn<State, Platform>)(internal);
      };
      handlers[method as keyof Handlers<State, Platform>] = handler;
    }
  }

  // Default behaviour if no GET handler is provided
  if (route.routeModule?.default && !route.routeModule?.handler?.GET) {
    const handler: MiddlewareFn<State, Platform> = async (ctx) => {
      const internal = ctx as ContextImpl<State, Platform>;
      internal._setRender(() => renderRoute(internal));
      return await internal.render();
    };

    handlers['GET'] = handler;
  }

  return handlers;
}
