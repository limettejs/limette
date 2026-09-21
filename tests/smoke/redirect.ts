import {
  App,
  type Context,
  type RedirectStatus,
  type RenderContext,
} from '../../src/mod.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function redirectResponse(
  location: string | URL,
  status?: RedirectStatus,
  options: { basePath?: string; method?: string } = {},
) {
  const app = new App({ basePath: options.basePath });
  app.all('/redirect', (ctx) => ctx.redirect(location, status));
  const pathname = options.basePath
    ? `${options.basePath.replace(/\/$/, '')}/redirect`
    : '/redirect';
  return await app.handler()(
    new Request(`https://app.example${pathname}`, {
      method: options.method ?? 'GET',
    }),
  );
}

const defaultResponse = await redirectResponse('/login');
assert(
  defaultResponse.status === 302 &&
    defaultResponse.headers.get('location') === '/login' &&
    await defaultResponse.text() === '',
  'The default redirect response was not an empty 302 response.',
);

for (const status of [301, 302, 303, 307, 308] as const) {
  const response = await redirectResponse(`/status-${status}`, status);
  assert(
    response.status === status &&
      response.headers.get('location') === `/status-${status}`,
    `Redirect status ${status} was not preserved.`,
  );
}

for (
  const [location, expected] of [
    ['/login', '/login'],
    ['login', 'login'],
    ['../login', '../login'],
    ['?tab=settings', '?tab=settings'],
    ['#section', '#section'],
    ['/foo?x=1#section', '/foo?x=1#section'],
    ['?x=1#section', '?x=1#section'],
    ['/foo//bar', '/foo//bar'],
    ['/foo///bar?x=1', '/foo///bar?x=1'],
    ['../foo//bar', '../foo//bar'],
    ['?next=/foo//bar', '?next=/foo//bar'],
    ['https://example.com/path', 'https://example.com/path'],
    ['', ''],
  ] as const
) {
  const response = await redirectResponse(location);
  assert(
    response.headers.get('location') === expected,
    `Redirect location ${JSON.stringify(location)} became ${
      JSON.stringify(response.headers.get('location'))
    }.`,
  );
}

const urlLocation = new URL('https://example.com/path?x=1#section');
assert(
  (await redirectResponse(urlLocation)).headers.get('location') ===
    urlLocation.href,
  'A URL redirect target was not serialized with URL.href.',
);

const basePathResponse = await redirectResponse('/login', undefined, {
  basePath: '/app',
});
assert(
  basePathResponse.headers.get('location') === '/login',
  'App basePath was incorrectly applied to an explicit redirect location.',
);

const postResponse = await redirectResponse('/success', undefined, {
  method: 'POST',
});
assert(
  postResponse.status === 302,
  'A POST redirect implicitly changed the default status.',
);

for (const location of ['//evil.example.com', '//evil.example.com/path']) {
  const app = new App();
  app.get('/redirect', (ctx) => {
    try {
      return ctx.redirect(location);
    } catch (error) {
      return new Response(
        error instanceof TypeError ? error.message : 'unexpected error',
      );
    }
  });
  const response = await app.handler()(
    new Request('https://app.example/redirect'),
  );
  const text = await response.text();
  assert(
    text.includes('Protocol-relative redirect locations are not allowed') &&
      text.includes(location),
    `Protocol-relative redirect ${location} was not rejected clearly.`,
  );
}

for (const status of [200, 201, 304, 400, 404, 500, 999]) {
  const app = new App();
  app.get('/redirect', (ctx) => {
    try {
      return ctx.redirect('/login', status as RedirectStatus);
    } catch (error) {
      return new Response(
        error instanceof TypeError ? error.message : 'unexpected error',
      );
    }
  });
  const text = await (
    await app.handler()(new Request('https://app.example/redirect'))
  ).text();
  assert(
    text.includes(`Invalid redirect status ${status}`),
    `Invalid redirect status ${status} was not rejected clearly.`,
  );
}

const directReturnApp = new App();
directReturnApp.use((ctx) => {
  if (ctx.url.pathname === '/middleware') {
    return ctx.redirect('/from-middleware', 307);
  }
  return ctx.next();
});
directReturnApp.get('/route', (ctx) => ctx.redirect('/from-route', 303));
const middlewareResponse = await directReturnApp.handler()(
  new Request('https://app.example/middleware'),
);
const routeResponse = await directReturnApp.handler()(
  new Request('https://app.example/route'),
);
assert(
  middlewareResponse.status === 307 &&
    middlewareResponse.headers.get('location') === '/from-middleware' &&
    routeResponse.status === 303 &&
    routeResponse.headers.get('location') === '/from-route',
  'Middleware or route handlers could not directly return redirects.',
);

if (false) {
  const context = undefined as unknown as Context;
  const renderContext = undefined as unknown as RenderContext;
  const status: RedirectStatus = 308;
  context.redirect('/typed', status);
  context.redirect(new URL('https://example.com'), 301);
  // @ts-expect-error Unsupported redirect status.
  context.redirect('/typed', 200);
  // @ts-expect-error RenderContext intentionally has no redirect method.
  renderContext.redirect('/not-available');
}
