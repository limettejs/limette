import type { RuntimeRouteDefinition } from './route.ts';
import type { Context, ContextImpl, DefaultState } from './context.ts';
import { HttpError } from './error.ts';
import { type AppWrapperComponentClass, renderContent } from './ssr.ts';

export type RouteHandler<State = DefaultState, Platform = unknown> = (
  ctx: Context<State, Platform>,
) => Response | Promise<Response>;

export interface RouteHandlers<State = DefaultState, Platform = unknown> {
  GET?: RouteHandler<State, Platform>;
  POST?: RouteHandler<State, Platform>;
  PUT?: RouteHandler<State, Platform>;
  DELETE?: RouteHandler<State, Platform>;
  PATCH?: RouteHandler<State, Platform>;
  OPTIONS?: RouteHandler<State, Platform>;
  HEAD?: RouteHandler<State, Platform>;
}

export function handlersForRoute<State = DefaultState, Platform = unknown>(
  route: RuntimeRouteDefinition<State, Platform>,
  AppWrapper: AppWrapperComponentClass<State, Platform>,
) {
  const handlers: RouteHandlers<State, Platform> = {};

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
      const handler: RouteHandler<State, Platform> = async (ctx) => {
        const internal = ctx as ContextImpl<State, Platform>;
        internal._setRender(() => renderRoute(internal));
        return await (fn as RouteHandler<State, Platform>)(internal);
      };
      handlers[method as keyof RouteHandlers<State, Platform>] = handler;
    }
  }

  // Default behaviour if no GET handler is provided
  if (route.routeModule?.default && !route.routeModule?.handler?.GET) {
    const handler: RouteHandler<State, Platform> = async (ctx) => {
      const internal = ctx as ContextImpl<State, Platform>;
      internal._setRender(() => renderRoute(internal));
      return await internal.render();
    };

    handlers['GET'] = handler;
  }

  return handlers;
}
