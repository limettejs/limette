import { App, type Context, type RenderContext } from '../../packages/limette/src/mod.ts';
import { describe, expect, it } from 'vitest';

function assert(condition: unknown, message: string): asserts condition {
  expect(condition, message).toBeTruthy();
}

async function request(app: App, path: string) {
  const response = await app.handler()(
    new Request(`https://example.test${path}`),
  );
  return { response, text: await response.text() };
}

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Assert<Value extends true> = Value;
type ContextParamsType = Assert<
  Equal<Context['params'], Readonly<Record<string, string>>>
>;
type RenderContextParamsType = Assert<
  Equal<RenderContext['params'], Readonly<Record<string, string>>>
>;
void (undefined as unknown as ContextParamsType);
void (undefined as unknown as RenderContextParamsType);

if (false) {
  const context = undefined as unknown as Context;
  const value: string = context.params.id;
  void value;
  // @ts-expect-error Public route params are readonly.
  context.params.id = 'replacement';
}

async function capturedParam(pattern: string, path: string, key: string) {
  const app = new App();
  app.get(pattern, (ctx) => new Response(ctx.params[key]));
  const result = await request(app, path);
  assert(result.response.status === 200, `${pattern} did not match ${path}.`);
  return result.text;
}

describe('route parameters', () => {
  it('captures required, optional, catch-all, and encoded values', async () => {
    assert(
      await capturedParam('/blog/:slug', '/blog/hello', 'slug') === 'hello',
      'Required route params were incorrect.',
    );
    assert(
      await capturedParam('/docs{/:version}?', '/docs/latest', 'version') ===
        'latest',
      'Present optional route params were incorrect.',
    );
    assert(
      await capturedParam('/docs{/:version}?', '/docs', 'version') === '',
      'Missing optional route params were not normalized to an empty string.',
    );
    assert(
      await capturedParam('/{:name}?', '/', 'name') === '' &&
        await capturedParam('/{:name}?', '/foo', 'name') === 'foo',
      'Root optional route params were incorrect.',
    );
    assert(
      await capturedParam('/old/:path*', '/old/foo/bar', 'path') ===
          'foo/bar' &&
        await capturedParam('/old/:path*', '/old', 'path') === '',
      'Catch-all route params did not preserve their slash-separated suffix.',
    );
    assert(
      await capturedParam('/user/:id', '/user/hello%20world', 'id') ===
        'hello world',
      'Percent-encoded spaces were not decoded.',
    );
    assert(
      await capturedParam('/user/:id', '/user/%E2%9C%93', 'id') === '✓',
      'Percent-encoded Unicode was not decoded.',
    );

    const encodedSlashApp = new App();
    encodedSlashApp.get('/file/:id', (ctx) => new Response(ctx.params.id));
    const encodedSlash = await request(encodedSlashApp, '/file/foo%2Fbar');
    const structuralSlash = await request(encodedSlashApp, '/file/foo/bar');
    assert(
      encodedSlash.text === 'foo%2Fbar' &&
        structuralSlash.response.status === 404,
      'Encoded slashes became indistinguishable from structural path separators.',
    );
  });

  it('handles malformed encoding and special parameter names safely', async () => {
    const malformedApp = new App();
    malformedApp.get('/user/:id', (ctx) => new Response(ctx.params.id));
    malformedApp.error(
      '/*',
      (ctx) =>
        new Response(`error:${ctx.error?.status}`, {
          status: ctx.error?.status ?? 500,
        }),
    );
    const malformed = await request(malformedApp, '/user/%ZZ');
    assert(
      malformed.response.status === 400 && malformed.text === 'error:400',
      'Malformed route encoding did not use the normal 400 error boundary.',
    );

    const specialNameApp = new App();
    specialNameApp.get('/:constructor/:__proto__', (ctx) => {
      assert(
        Object.getPrototypeOf(ctx.params) === null &&
          Object.hasOwn(ctx.params, 'constructor') &&
          Object.hasOwn(ctx.params, '__proto__'),
        'Route params are not stored in a null-prototype dictionary.',
      );
      return new Response(`${ctx.params.constructor}:${ctx.params.__proto__}`);
    });
    assert(
      (await request(specialNameApp, '/built-in/safe')).text ===
          'built-in:safe' &&
        ({} as { polluted?: unknown }).polluted === undefined,
      'A special parameter name changed object prototype semantics.',
    );
  });

  it('keeps parameter dictionaries request-local within a request chain', async () => {
    const staticParams: Readonly<Record<string, string>>[] = [];
    const staticApp = new App();
    staticApp.get('/about', (ctx) => {
      staticParams.push(ctx.params);
      assert(
        Object.getPrototypeOf(ctx.params) === null &&
          Object.keys(ctx.params).length === 0,
        'A static route did not receive an empty null-prototype dictionary.',
      );
      return new Response('about');
    });
    await request(staticApp, '/about');
    await request(staticApp, '/about');
    assert(
      staticParams.length === 2 && staticParams[0] !== staticParams[1],
      'Static requests shared one params object.',
    );

    const unmatchedParams: Readonly<Record<string, string>>[] = [];
    const globalParams: Readonly<Record<string, string>>[] = [];
    const globalApp = new App();
    globalApp.use((ctx) => {
      if (ctx.url.pathname === '/missing') unmatchedParams.push(ctx.params);
      else globalParams.push(ctx.params);
      return ctx.next();
    });
    globalApp.get('/users/:id', (ctx) => new Response(ctx.params.id));
    assert(
      (await request(globalApp, '/users/123')).text === '123' &&
        globalParams[0]?.id === '123',
      'Global middleware did not see final route params.',
    );
    await request(globalApp, '/missing');
    assert(
      Object.getPrototypeOf(unmatchedParams[0]) === null &&
        Object.keys(unmatchedParams[0]).length === 0,
      'Unmatched global middleware did not receive empty request-local params.',
    );

    const localParamObjects: Readonly<Record<string, string>>[] = [];
    const localHandlersApp = new App();
    localHandlersApp.get(
      '/local/:id',
      (ctx) => {
        localParamObjects.push(ctx.params);
        return ctx.next();
      },
      (ctx) => {
        localParamObjects.push(ctx.params);
        return new Response(ctx.params.id);
      },
    );
    assert(
      (await request(localHandlersApp, '/local/value')).text === 'value' &&
        localParamObjects[0] === localParamObjects[1],
      'Route-local handlers did not share the same params object.',
    );
  });

  it('accumulates route-chain and explicit URLPattern parameters', async () => {
    const chainObservations: Array<{
      owner: string;
      params: Readonly<Record<string, string>>;
      value: string;
      org: string;
      user: string;
    }> = [];
    const chainApp = new App();
    const observeChain = (owner: string, ctx: Context) => {
      chainObservations.push({
        owner,
        params: ctx.params,
        value: ctx.params.value,
        org: ctx.params.org,
        user: ctx.params.user,
      });
    };
    chainApp.use((ctx) => {
      observeChain('global', ctx);
      return ctx.next();
    });
    chainApp.all('/org/:value/*', (ctx) => {
      observeChain('all', ctx);
      return ctx.next();
    });
    chainApp.get('/org/:org/user/:value', (ctx) => {
      observeChain('exact', ctx);
      return new Response(`${ctx.params.org}:${ctx.params.value}`);
    });
    assert(
      (await request(chainApp, '/org/acme/user/42')).text === 'acme:42' &&
        chainObservations.length === 3 &&
        chainObservations.every((entry) =>
          entry.params === chainObservations[0].params &&
          entry.value === '42' && entry.org === 'acme'
        ),
      'ALL and exact route params did not accumulate with later values winning.',
    );

    const explicitPatternApp = new App();
    explicitPatternApp.get(
      new URLPattern({
        hostname: ':sub.example.test',
        pathname: '/items/:id',
        search: 'q=:query',
        hash: ':section',
      }),
      (ctx) => new Response(JSON.stringify(ctx.params)),
    );
    const explicitResult = await explicitPatternApp.handler()(
      new Request(
        'https://api.example.test/items/item-id?q=search-value#fragment',
      ),
    );
    assert(
      JSON.stringify(JSON.parse(await explicitResult.text())) ===
        JSON.stringify({ id: 'item-id' }),
      'Explicit URLPattern routes exposed non-pathname groups as route params.',
    );

    const unnamedPatternApp = new App();
    unnamedPatternApp.get(
      new URLPattern({ pathname: '/unnamed/(.*)' }),
      (ctx) => new Response(ctx.params['0']),
    );
    assert(
      (await request(unnamedPatternApp, '/unnamed/natural-key')).text ===
        'natural-key',
      'Unnamed pathname groups did not preserve their URLPattern key.',
    );
  });

  it('isolates parameters across concurrent requests', async () => {
    const concurrentApp = new App();
    concurrentApp.get('/concurrent/:id', async (ctx) => {
      const id = ctx.params.id;
      await new Promise((resolve) => setTimeout(resolve, id.charCodeAt(0) % 5));
      return new Response(`${id}:${ctx.params.id}`);
    });
    const concurrentIds = Array.from(
      { length: 100 },
      (_, index) => `id-${index}`,
    );
    const concurrentResults = await Promise.all(
      concurrentIds.map(async (id) =>
        (await request(concurrentApp, `/concurrent/${id}`)).text
      ),
    );
    assert(
      concurrentResults.every((value, index) =>
        value === `${concurrentIds[index]}:${concurrentIds[index]}`
      ),
      'Concurrent requests leaked route params.',
    );
  });
});
