import {
  App,
  type AppHandler,
  type Context,
  type Middleware,
  type RouteHandler,
  type RouteHandlers,
} from '../../src/mod.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface AppState {
  user?: string;
  locale?: string;
  product?: string;
}

interface AppPlatform {
  readonly marker: string;
}

const synchronousMiddleware = ((ctx) => {
  ctx.state.locale = 'en';
  const marker: string = ctx.platform.marker;
  return new Response(marker);
}) satisfies Middleware<AppState, AppPlatform>;

const asynchronousMiddleware = (async (ctx) => {
  ctx.state.user = 'authenticated';
  return await ctx.next();
}) satisfies Middleware<AppState, AppPlatform>;

const middlewareArray = [
  (ctx) => {
    ctx.state.locale = ctx.platform.marker;
    return ctx.next();
  },
  async (ctx) => {
    ctx.state.user = await Promise.resolve('array-user');
    return ctx.next();
  },
] satisfies Middleware<AppState, AppPlatform>[];

const standaloneRouteHandler = ((ctx) => {
  ctx.state.product = ctx.platform.marker;
  return ctx.redirect('/login');
}) satisfies RouteHandler<AppState, AppPlatform>;

const routeHandlers = {
  GET(ctx) {
    ctx.state.product = ctx.platform.marker;
    return ctx.redirect('/login');
  },
  POST() {
    return new Response('POST');
  },
  async PUT(ctx) {
    ctx.state.product = await Promise.resolve('PUT');
    return ctx.render();
  },
  PATCH(ctx) {
    return ctx.render();
  },
  DELETE() {
    return Promise.resolve(new Response('DELETE'));
  },
  OPTIONS() {
    return new Response('OPTIONS');
  },
  HEAD() {
    return new Response(null);
  },
} satisfies RouteHandlers<AppState, AppPlatform>;

function contextTypeSurface(ctx: Context<AppState, AppPlatform>) {
  ctx.state.product = ctx.platform.marker;
  // @ts-expect-error render() does not accept application state.
  void ctx.render({ product: 'replacement' });
}

const synchronousAppHandler =
  ((request, platform) =>
    new Response(`${request.method}:${platform?.marker}`)) satisfies AppHandler<
      AppPlatform
    >;
const asynchronousAppHandler =
  (async () => new Response('async')) satisfies AppHandler<AppPlatform>;
type NodeAdapterHandler = Parameters<
  typeof import('../../src/node.ts').serve
>[0];
type DenoAdapterHandler = Parameters<
  typeof import('../../src/deno.ts').serve
>[0];
const nodeAdapterHandler =
  ((request) => new Response(request.url)) satisfies NodeAdapterHandler;
const denoAdapterHandler =
  (async (request) => new Response(request.url)) satisfies DenoAdapterHandler;

// @ts-expect-error The old route-handler map name is no longer public.
type RemovedHandlers = import('../../src/mod.ts').Handlers;
// @ts-expect-error A generic Handler route type is not part of the public API.
type RemovedHandler = import('../../src/mod.ts').Handler;
// @ts-expect-error Middleware is the sole public middleware function name.
type RemovedMiddlewareFn = import('../../src/mod.ts').MiddlewareFn;

void synchronousMiddleware;
void asynchronousMiddleware;
void middlewareArray;
void standaloneRouteHandler;
void routeHandlers;
void contextTypeSurface;
void synchronousAppHandler;
void asynchronousAppHandler;
void nodeAdapterHandler;
void denoAdapterHandler;
void (undefined as unknown as RemovedHandlers);
void (undefined as unknown as RemovedHandler);
void (undefined as unknown as RemovedMiddlewareFn);

const platform: AppPlatform = { marker: 'options-platform' };
const app = new App<AppState, AppPlatform>().options('/probe', (ctx) => {
  ctx.state.product = ctx.platform.marker;
  return new Response(ctx.state.product);
});
const response = await app.handler()(
  new Request('https://example.test/probe', { method: 'OPTIONS' }),
  platform,
);
assert(
  response.status === 200 && await response.text() === platform.marker,
  'The existing OPTIONS route-handler type did not have a working route.',
);
