import {
  type AppHandler,
  type Context,
  type Middleware,
  type RouteHandler,
  type RouteHandlers,
} from '../../src/mod.ts';

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
