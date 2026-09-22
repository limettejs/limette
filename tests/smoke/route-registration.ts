import {
  App,
  type RouteHandler,
  type RouteHandlers,
  type TrailingSlash,
} from '../../src/mod.ts';
import type { Method } from '../../src/server/methods.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface TestState {
  value?: string;
}

interface TestPlatform {
  marker: string;
}

const platform: TestPlatform = { marker: 'platform' };

async function request(
  app: App<TestState, TestPlatform>,
  path: string,
  method = 'GET',
) {
  const response = await app.handler()(
    new Request(`https://example.test${path}`, { method }),
    platform,
  );
  return { response, text: await response.text() };
}

type AssertNever<Value extends never> = Value;
type MissingRouteHandlerMethod = AssertNever<
  Exclude<Method, keyof RouteHandlers>
>;
type ExtraRouteHandlerMethod = AssertNever<
  Exclude<keyof RouteHandlers, Method>
>;
type MissingAppMethod = AssertNever<
  Exclude<Lowercase<Method>, keyof App>
>;
void (undefined as unknown as MissingRouteHandlerMethod);
void (undefined as unknown as ExtraRouteHandlerMethod);
void (undefined as unknown as MissingAppMethod);
const typedTrailingSlash: TrailingSlash = 'always';
void typedTrailingSlash;

if (false) {
  const app = new App<TestState, TestPlatform>();
  const pattern = new URLPattern({ pathname: '/typed' });
  const handler: RouteHandler<TestState, TestPlatform> = (ctx) => {
    ctx.state.value = ctx.platform.marker;
    return new Response(ctx.state.value);
  };
  app.get(pattern, handler);
  app.post(pattern, async (ctx) => new Response(ctx.platform.marker));
  app.put(pattern, handler);
  app.patch(pattern, handler);
  app.delete(pattern, handler);
  app.head(pattern, handler);
  app.options(pattern, handler);
  app.all(pattern, handler);

  // @ts-expect-error Every route registration requires a RouteHandler.
  app.get('/missing-handler');
  // @ts-expect-error Every route registration requires a RouteHandler.
  app.post('/missing-handler');
  // @ts-expect-error Every route registration requires a RouteHandler.
  app.put('/missing-handler');
  // @ts-expect-error Every route registration requires a RouteHandler.
  app.patch('/missing-handler');
  // @ts-expect-error Every route registration requires a RouteHandler.
  app.delete('/missing-handler');
  // @ts-expect-error Every route registration requires a RouteHandler.
  app.head('/missing-handler');
  // @ts-expect-error Every route registration requires a RouteHandler.
  app.options('/missing-handler');
  // @ts-expect-error Every route registration requires a RouteHandler.
  app.all('/missing-handler');
}

const methodApp = new App<TestState, TestPlatform>();
methodApp
  .get('/get', () => new Response('GET'))
  .post('/post', async () => new Response('POST'))
  .put('/put', () => new Response('PUT'))
  .patch('/patch', async () => new Response('PATCH'))
  .delete('/delete', () => new Response('DELETE'))
  .head(
    '/head',
    () => new Response(null, { headers: { 'x-method': 'HEAD' } }),
  )
  .options('/options', () => new Response('OPTIONS'))
  .all('/all', (ctx) => new Response(`ALL:${ctx.request.method}`));

for (
  const [method, path] of [
    ['GET', '/get'],
    ['POST', '/post'],
    ['PUT', '/put'],
    ['PATCH', '/patch'],
    ['DELETE', '/delete'],
    ['OPTIONS', '/options'],
  ] as const
) {
  const result = await request(methodApp, path, method);
  assert(result.text === method, `${method} imperative registration failed.`);
}
const headResult = await request(methodApp, '/head', 'HEAD');
assert(
  headResult.response.headers.get('x-method') === 'HEAD',
  'HEAD imperative registration failed.',
);
const allResult = await request(methodApp, '/all', 'CUSTOM');
assert(
  allResult.text === 'ALL:CUSTOM',
  'ALL did not accept an unsupported incoming request method.',
);

const methodFirstApp = new App<TestState, TestPlatform>();
methodFirstApp.error('/*', (ctx) =>
  new Response(`error:${ctx.error?.status}`, {
    status: ctx.error?.status,
  }));
methodFirstApp.get('/users/new', () => new Response('GET static'));
methodFirstApp.post(
  '/users/:id',
  (ctx) => new Response(`POST dynamic:${ctx.params.id}`),
);
assert(
  (await request(methodFirstApp, '/users/new', 'POST')).text ===
    'POST dynamic:new',
  'An incompatible static route claimed a method-first match.',
);
const notAllowed = await request(methodFirstApp, '/users/new', 'DELETE');
assert(
  notAllowed.response.status === 405 &&
    notAllowed.response.headers.get('allow') ===
      'GET, HEAD, POST, OPTIONS' &&
    notAllowed.text === 'error:405',
  'A path match did not produce 405 with the complete Allow header.',
);
assert(
  (await request(methodFirstApp, '/missing', 'DELETE')).response.status === 404,
  'A missing pathname did not produce 404.',
);

const headApp = new App<TestState, TestPlatform>();
headApp.get(
  '/explicit',
  () => new Response('GET body', { headers: { 'x-method': 'GET' } }),
);
headApp.head(
  '/explicit',
  () => new Response('HEAD body', { headers: { 'x-method': 'HEAD' } }),
);
headApp.get('/fallback', (ctx) =>
  new Response('GET body', {
    headers: { 'x-request-method': ctx.request.method },
  }));
const explicitHead = await request(headApp, '/explicit', 'HEAD');
assert(
  explicitHead.response.headers.get('x-method') === 'HEAD' &&
    explicitHead.text === '',
  'An explicit HEAD route did not win over GET with an empty final body.',
);
const fallbackHead = await request(headApp, '/fallback', 'HEAD');
assert(
  fallbackHead.response.headers.get('x-request-method') === 'HEAD' &&
    fallbackHead.text === '',
  'GET fallback did not receive the original HEAD request with an empty body.',
);
const missingHead = await request(headApp, '/missing', 'HEAD');
assert(
  missingHead.response.status === 404 && missingHead.text === '',
  'A final HEAD error response retained a body.',
);

const optionsCalls: string[] = [];
const optionsApp = new App<TestState, TestPlatform>();
optionsApp.get('/explicit', () => new Response('GET'));
optionsApp.options(
  '/explicit',
  () =>
    new Response('explicit OPTIONS', { headers: { 'x-options': 'explicit' } }),
);
optionsApp.all('/automatic', async (ctx) => {
  optionsCalls.push('all:before');
  const response = await ctx.next();
  optionsCalls.push('all:after');
  return response;
});
optionsApp.get('/automatic', () => new Response('GET'));
optionsApp.post('/automatic', () => new Response('POST'));
const explicitOptions = await request(optionsApp, '/explicit', 'OPTIONS');
assert(
  explicitOptions.text === 'explicit OPTIONS' &&
    explicitOptions.response.headers.get('x-options') === 'explicit',
  'An explicit OPTIONS route was replaced by automatic handling.',
);
const automaticOptions = await request(optionsApp, '/automatic', 'OPTIONS');
assert(
  automaticOptions.response.status === 204 &&
    automaticOptions.response.headers.get('allow') ===
      'GET, HEAD, POST, OPTIONS' &&
    optionsCalls.join(',') === 'all:before,all:after',
  'Automatic OPTIONS did not run through ALL or produce the expected Allow.',
);

const chainCalls: string[] = [];
const chainApp = new App<TestState, TestPlatform>();
chainApp.get(
  '/chain',
  (ctx) => {
    chainCalls.push('first:before');
    return ctx.next().then((response) => {
      chainCalls.push('first:after');
      return response;
    });
  },
  async (ctx) => {
    chainCalls.push('second:before');
    const response = await ctx.next();
    chainCalls.push('second:after');
    return response;
  },
  () => {
    chainCalls.push('terminal');
    return new Response('chain');
  },
);
assert(
  (await request(chainApp, '/chain')).text === 'chain' &&
    chainCalls.join(',') ===
      'first:before,second:before,terminal,second:after,first:after',
  `Route-local handlers ran out of order: ${chainCalls.join(',')}`,
);

const globalCalls: string[] = [];
const globalApp = new App<TestState, TestPlatform>();
globalApp.use(async (ctx) => {
  globalCalls.push('global-before-route');
  return ctx.next();
});
globalApp.get('/global', () => {
  globalCalls.push('route');
  return new Response('global');
});
globalApp.use(async (ctx) => {
  globalCalls.push('global-after-route:before');
  const response = await ctx.next();
  globalCalls.push('global-after-route:after');
  return response;
});
assert(
  (await request(globalApp, '/global')).text === 'global' &&
    globalCalls.join(',') ===
      'global-before-route,global-after-route:before,route,global-after-route:after',
  'Global middleware did not remain independent of registration order.',
);

const singleNextApp = new App<TestState, TestPlatform>();
singleNextApp.get('/single-next', (ctx) => ctx.next());
assert(
  (await request(singleNextApp, '/single-next')).response.status === 404,
  'A single route handler did not use the common middleware execution path.',
);

const orderedAllCalls: string[] = [];
const orderedAllApp = new App<TestState, TestPlatform>();
orderedAllApp.all('/ordered', async (ctx) => {
  orderedAllCalls.push('all:before');
  const response = await ctx.next();
  orderedAllCalls.push('all:after');
  return response;
});
orderedAllApp.get('/ordered', () => {
  orderedAllCalls.push('get');
  return new Response('ordered');
});
assert(
  (await request(orderedAllApp, '/ordered')).text === 'ordered' &&
    orderedAllCalls.join(',') === 'all:before,get,all:after',
  'An ALL route registered before GET did not wrap it.',
);

const terminatingAllApp = new App<TestState, TestPlatform>();
let terminatedGetRan = false;
terminatingAllApp.all('/terminated', () => new Response('terminated'));
terminatingAllApp.get('/terminated', () => {
  terminatedGetRan = true;
  return new Response('get');
});
assert(
  (await request(terminatingAllApp, '/terminated')).text === 'terminated' &&
    !terminatedGetRan,
  'A terminating ALL route continued into the exact route.',
);

const laterAllCalls: string[] = [];
const laterAllApp = new App<TestState, TestPlatform>();
laterAllApp.get('/later-all', () => {
  laterAllCalls.push('get');
  return new Response('get');
});
laterAllApp.all('/later-all', () => {
  laterAllCalls.push('all');
  return new Response('all');
});
assert(
  (await request(laterAllApp, '/later-all')).text === 'get' &&
    laterAllCalls.join(',') === 'get',
  'A later ALL route was retroactively inserted before an exact route.',
);

const exhaustedAllApp = new App<TestState, TestPlatform>();
exhaustedAllApp.all('/exhausted', (ctx) => ctx.next());
assert(
  (await request(exhaustedAllApp, '/exhausted', 'CUSTOM')).response.status ===
    404,
  'An exhausted ALL chain incorrectly changed the fallback to 405.',
);

function expectDuplicate(
  register: (app: App) => void,
  trailingSlash?: TrailingSlash,
) {
  const app = new App({ trailingSlash });
  let message = '';
  try {
    register(app);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(
    message.includes('Duplicate route registration'),
    'Equivalent route registration did not fail clearly.',
  );
}

expectDuplicate((app) => {
  app.get('/duplicate', () => new Response('first'));
  app.get('/duplicate', () => new Response('second'));
});
expectDuplicate((app) => {
  app.get('/canonical-duplicate', () => new Response('first'));
  app.get('/canonical-duplicate/', () => new Response('second'));
});
expectDuplicate((app) => {
  app.get('/canonical-duplicate', () => new Response('first'));
  app.get('/canonical-duplicate/', () => new Response('second'));
}, 'always');
expectDuplicate((app) => {
  app.all('/duplicate', () => new Response('first'));
  app.all('/duplicate', () => new Response('second'));
});
expectDuplicate((app) => {
  app.get(
    new URLPattern({ hostname: 'example.test', pathname: '/duplicate' }),
    () => new Response('first'),
  );
  app.get(
    new URLPattern({ hostname: 'example.test', pathname: '/duplicate' }),
    () => new Response('second'),
  );
});

const distinctRegistrations = new App();
distinctRegistrations.get('/shared', () => new Response('GET'));
distinctRegistrations.post('/shared', () => new Response('POST'));
distinctRegistrations.all('/shared', (ctx) => ctx.next());

const precedenceApp = new App<TestState, TestPlatform>();
precedenceApp.get(
  '/users/:id',
  (ctx) => new Response(`dynamic:${ctx.params.id}`),
);
precedenceApp.get('/users/new', () => new Response('static'));
assert(
  (await request(precedenceApp, '/users/new')).text === 'dynamic:new',
  'Imperative route precedence stopped following registration order.',
);

for (
  const test of [
    { basePath: undefined, route: '/users', expectedBase: '', url: '/users' },
    { basePath: '/', route: 'users', expectedBase: '', url: '/users' },
    {
      basePath: 'api',
      route: 'users',
      expectedBase: '/api',
      url: '/api/users',
    },
    {
      basePath: '/api',
      route: '/users',
      expectedBase: '/api',
      url: '/api/users',
    },
    {
      basePath: '/api/',
      route: '/users',
      expectedBase: '/api',
      url: '/api/users',
    },
    { basePath: '/api/', route: '/', expectedBase: '/api', url: '/api' },
  ]
) {
  const app = new App<TestState, TestPlatform>({ basePath: test.basePath });
  app.get(test.route, () => new Response('base'));
  assert(
    app.config.basePath === test.expectedBase &&
      (await request(app, test.url)).text === 'base',
    `basePath ${String(test.basePath)} did not join ${test.route} correctly.`,
  );
}

const patternApp = new App<TestState, TestPlatform>({ basePath: '/api' });
patternApp.get(
  new URLPattern({ hostname: 'example.test', pathname: '/advanced' }),
  () => new Response('advanced'),
);
assert(
  (await request(patternApp, '/advanced')).text === 'advanced' &&
    (await request(patternApp, '/api/advanced')).response.status === 404,
  'An explicit URLPattern was incorrectly rewritten with basePath.',
);

let canonicalHandlerCalls = 0;
const canonicalApp = new App<TestState, TestPlatform>();
canonicalApp.get('/foo/', () => {
  canonicalHandlerCalls++;
  return new Response('foo');
});
canonicalApp.get('/', () => new Response('root'));
canonicalApp.get('/foo/bar', () => new Response('collapsed'));
canonicalApp.get('/faithful', (ctx) =>
  new Response(
    String(
      ctx.url.href === ctx.request.url &&
        ctx.url.pathname === '/faithful' &&
        ctx.url.search === '?value=a%2Fb',
    ),
  ));

const defaultRedirect = await request(canonicalApp, '/foo/?page=2');
assert(
  defaultRedirect.response.status === 308 &&
    defaultRedirect.response.headers.get('location') === '/foo?page=2' &&
    canonicalHandlerCalls === 0,
  'The default trailing-slash redirect did not preserve its query.',
);
assert(
  canonicalApp.config.trailingSlash === 'never' &&
    (await request(canonicalApp, '/')).text === 'root',
  'The root pathname was redirected.',
);
assert(
  (await request(canonicalApp, '/foo')).text === 'foo',
  'A string route was not registered in its default canonical form.',
);
assert(
  (await request(canonicalApp, '/foo//bar')).response.status === 404,
  'Internal duplicate slashes were silently collapsed before routing.',
);
const duplicateSlashRedirect = await request(canonicalApp, '/foo//bar/');
assert(
  duplicateSlashRedirect.response.status === 308 &&
    duplicateSlashRedirect.response.headers.get('location') ===
      '/foo//bar',
  'Trailing-slash removal also collapsed internal duplicate slashes.',
);
assert(
  (await request(canonicalApp, '/faithful?value=a%2Fb')).text === 'true',
  'ctx.url did not remain faithful to the request URL.',
);

const alwaysApp = new App<TestState, TestPlatform>({
  basePath: '/api',
  trailingSlash: 'always',
});
alwaysApp.get('/', () => new Response('base root'));
alwaysApp.get('/users', () => new Response('users'));
const alwaysRedirect = await request(alwaysApp, '/api/users?page=2');
assert(
  alwaysRedirect.response.status === 308 &&
    alwaysRedirect.response.headers.get('location') === '/api/users/?page=2',
  'The always policy did not append a slash while preserving its query.',
);
assert(
  alwaysApp.config.trailingSlash === 'always' &&
    (await request(alwaysApp, '/api/')).text === 'base root' &&
    (await request(alwaysApp, '/api/users/')).text === 'users',
  'Always-policy string registration did not align with basePath routes.',
);
