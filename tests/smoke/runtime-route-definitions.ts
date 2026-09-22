import { html, LitElement } from 'lit';
import {
  App,
  AppComponent,
  LayoutComponent,
  PageComponent,
} from '../../src/mod.ts';
import { registerRouteDefinitions } from '../../src/server/register-routes.ts';
import type { RuntimeRouteDefinition } from '../../src/server/route.ts';
import type { RouteModule } from '../../src/server/router.ts';
import type { Context } from '../../src/server/context.ts';
import type { MiddlewareModule } from '../../src/server/middlewares.ts';
import type { IslandsDefinition } from '../../src/mod.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function handlerRoute(
  path: string,
  response: (ctx: Context) => Response,
  middlewares: readonly MiddlewareModule[] = [],
): RuntimeRouteDefinition {
  return {
    id: path,
    path,
    file: `./routes${path}.ts`,
    tagName: `handler-${path.replace(/[^a-z]+/gi, '-')}`,
    routeModule: {
      handler: { GET: response },
    } as RouteModule,
    layouts: [],
    middlewares,
    islands: [],
    ssrIslands: [],
    assets: { scripts: [], styles: [], islandStyles: {} },
  };
}

class TestAppWrapper extends AppComponent {
  override render() {
    return html`
      <!DOCTYPE html>
      <html>
        <head>
          ${this.assets.styles}
        </head>
        <body>
          <p id="route-file">${this.route.file}</p>
          ${this.outlet} ${this.assets.scripts}
        </body>
      </html>
    `;
  }
}

const calls: string[] = [];
const firstMiddleware: MiddlewareModule = {
  handler: [
    async (ctx) => {
      calls.push('first-a');
      return await ctx.next();
    },
    async (ctx) => {
      calls.push('first-b');
      return await ctx.next();
    },
  ],
};
const secondMiddleware: MiddlewareModule = {
  handler: async (ctx) => {
    calls.push('second');
    return await ctx.next();
  },
};

const routeApp = new App();
registerRouteDefinitions(routeApp, {
  appWrapper: TestAppWrapper,
  routes: [
    handlerRoute(
      '/about',
      () => {
        calls.push('static');
        return new Response('static');
      },
      [firstMiddleware, secondMiddleware],
    ),
    handlerRoute('/:id', (ctx) => new Response(`dynamic:${ctx.params.id}`)),
  ],
});

const staticResponse = await routeApp.handler()(
  new Request('http://localhost/about'),
);
assert(await staticResponse.text() === 'static', 'Static route was shadowed.');
assert(
  calls.join(',') === 'first-a,first-b,second,static',
  `Unexpected middleware order: ${calls.join(',')}`,
);

let invalidMiddlewareError = '';
try {
  registerRouteDefinitions(new App(), {
    appWrapper: TestAppWrapper,
    routes: [
      handlerRoute(
        '/invalid-middleware',
        () => new Response('unreachable'),
        [{
          handler: [() => new Response('valid'), 'invalid'],
        } as unknown as MiddlewareModule],
      ),
    ],
  });
} catch (error) {
  invalidMiddlewareError = error instanceof Error
    ? error.message
    : String(error);
}
assert(
  invalidMiddlewareError.includes('Invalid filesystem middleware') &&
    invalidMiddlewareError.includes('./routes/invalid-middleware.ts') &&
    invalidMiddlewareError.includes('only functions'),
  `Invalid middleware did not fail clearly: ${invalidMiddlewareError}`,
);

const dynamicResponse = await routeApp.handler()(
  new Request('http://localhost/limette'),
);
assert(
  await dynamicResponse.text() === 'dynamic:limette',
  'Dynamic route did not receive its route parameter.',
);

const suppliedOrderApp = new App();
registerRouteDefinitions(suppliedOrderApp, {
  appWrapper: TestAppWrapper,
  routes: [
    handlerRoute('/:id', (ctx) => new Response(`first:${ctx.params.id}`)),
    handlerRoute('/about', () => new Response('second:static')),
  ],
});
const suppliedOrderResponse = await suppliedOrderApp.handler()(
  new Request('http://localhost/about'),
);
assert(
  await suppliedOrderResponse.text() === 'first:about',
  'Runtime definitions were not registered in their supplied order.',
);

const coexistenceCalls: string[] = [];
const coexistenceApp = new App().fsRoutes();
coexistenceApp.use(async (ctx) => {
  coexistenceCalls.push('global');
  return await ctx.next();
});
coexistenceApp.all('/wrapped/*', async (ctx) => {
  coexistenceCalls.push('all:before');
  const response = await ctx.next();
  coexistenceCalls.push('all:after');
  return response;
});
coexistenceApp.get(
  '/users/:id',
  (ctx) => new Response(`imperative:${ctx.params.id}`),
);
coexistenceApp.post('/health', () => new Response('imperative POST'));
registerRouteDefinitions(coexistenceApp, {
  appWrapper: TestAppWrapper,
  routes: [
    handlerRoute('/users/new', () => new Response('filesystem static')),
    handlerRoute('/filesystem-only', () => new Response('filesystem only')),
    handlerRoute('/health', () => new Response('filesystem GET')),
    handlerRoute(
      '/wrapped/item',
      () => {
        coexistenceCalls.push('filesystem-route');
        return new Response('wrapped filesystem');
      },
      [{
        handler: async (ctx) => {
          coexistenceCalls.push('filesystem-middleware');
          return await ctx.next();
        },
      }],
    ),
  ],
});

const coexistenceHandler = coexistenceApp.handler();
assert(
  await (await coexistenceHandler(
    new Request('http://localhost/users/new'),
  )).text() === 'imperative:new',
  'An overlapping filesystem route took precedence over an imperative route.',
);
assert(
  await (await coexistenceHandler(
    new Request('http://localhost/filesystem-only'),
  )).text() === 'filesystem only',
  'An imperative and filesystem route could not coexist in one App.',
);
assert(
  await (await coexistenceHandler(
        new Request('http://localhost/health'),
      )).text() === 'filesystem GET' &&
    await (await coexistenceHandler(
        new Request('http://localhost/health', { method: 'POST' }),
      )).text() === 'imperative POST',
  'Different imperative/filesystem methods could not share one pathname.',
);

coexistenceCalls.length = 0;
assert(
  await (await coexistenceHandler(
        new Request('http://localhost/wrapped/item'),
      )).text() === 'wrapped filesystem' &&
    coexistenceCalls.join(',') ===
      'global,all:before,filesystem-middleware,filesystem-route,all:after',
  `Imperative/global middleware order changed: ${coexistenceCalls.join(',')}`,
);

const duplicateApp = new App().fsRoutes();
duplicateApp.get('/health', () => new Response('imperative'));
let duplicateError = '';
try {
  registerRouteDefinitions(duplicateApp, {
    appWrapper: TestAppWrapper,
    routes: [handlerRoute('/health', () => new Response('filesystem'))],
  });
} catch (error) {
  duplicateError = error instanceof Error ? error.message : String(error);
}
assert(
  duplicateError.includes('Duplicate route registration for GET /health'),
  `An imperative/filesystem duplicate did not fail clearly: ${duplicateError}`,
);

class RuntimeBoundaryIsland extends LitElement {
  override render() {
    return html`<span>island content</span>`;
  }
}

if (!customElements.get('runtime-boundary-island')) {
  customElements.define('runtime-boundary-island', RuntimeBoundaryIsland);
}

class RuntimeBoundaryPage extends PageComponent {
  static override islands = {
    'runtime-boundary-island': {
      component: RuntimeBoundaryIsland,
      ssr: true,
    },
  } satisfies IslandsDefinition;

  override render() {
    return html`
      <main>
        <runtime-boundary-island></runtime-boundary-island>
      </main>
    `;
  }
}

class InnerLayout extends LayoutComponent {
  override render() {
    return html`<section data-layout="inner">${this.outlet}</section>`;
  }
}

class OuterLayout extends LayoutComponent {
  override render() {
    return html`<section data-layout="outer">${this.outlet}</section>`;
  }
}

function componentRoute(
  path: string,
  options: {
    islands?: readonly string[];
    ssrIslands?: readonly string[];
    scripts?: readonly string[];
    styles?: readonly string[];
    islandStyles?: Readonly<Record<string, readonly string[]>>;
  } = {},
): RuntimeRouteDefinition {
  return {
    id: path,
    path,
    file: `./routes${path}.ts`,
    tagName: 'runtime-boundary-page',
    routeModule: {
      config: { skipInheritedLayouts: false },
      handler: {},
      default: RuntimeBoundaryPage,
    },
    layouts: [
      {
        config: { skipInheritedLayouts: false },
        default: OuterLayout,
      },
      {
        config: { skipInheritedLayouts: false },
        default: InnerLayout,
      },
    ],
    middlewares: [],
    islands: options.islands ?? [],
    ssrIslands: options.ssrIslands ?? [],
    assets: {
      scripts: options.scripts ?? [],
      styles: options.styles ?? [],
      islandStyles: options.islandStyles ?? {},
    },
  };
}

const renderApp = new App();
registerRouteDefinitions(renderApp, {
  appWrapper: TestAppWrapper,
  routes: [
    componentRoute('/without-island', {
      styles: ['/assets/without-island.css'],
    }),
    componentRoute('/with-island', {
      islands: ['runtime-boundary-island'],
      ssrIslands: ['runtime-boundary-island'],
      scripts: ['/assets/with-island.js'],
      styles: ['/assets/with-island.css'],
      islandStyles: {
        'runtime-boundary-island': ['/assets/island-only.css'],
      },
    }),
  ],
});

const noIslandHtml = await (
  await renderApp.handler()(new Request('http://localhost/without-island'))
).text();
assert(
  !noIslandHtml.includes('<script type="module"'),
  'A no-island route received a client script.',
);
assert(
  noIslandHtml.includes('/assets/without-island.css'),
  'A no-island route lost its stylesheet.',
);

const islandHtml = await (
  await renderApp.handler()(new Request('http://localhost/with-island'))
).text();
assert(
  islandHtml.includes('<script type="module" src="/assets/with-island.js"'),
  'The island route lost its client entry.',
);
assert(
  islandHtml.includes('<link rel="stylesheet" href="/assets/with-island.css"'),
  'The island route lost its stylesheet.',
);
assert(
  islandHtml.includes('@import url(&quot;/assets/island-only.css&quot;)') ||
    islandHtml.includes('@import url("/assets/island-only.css")'),
  'The island stylesheet was not retained for shadow rendering.',
);
assert(
  !islandHtml.includes('@import url(&quot;/assets/with-island.css&quot;)') &&
    !islandHtml.includes('@import url("/assets/with-island.css")'),
  'The document stylesheet leaked into island shadow rendering.',
);
assert(
  islandHtml.indexOf('data-layout="outer"') >= 0 &&
    islandHtml.indexOf('data-layout="outer"') <
      islandHtml.indexOf('data-layout="inner"') &&
    islandHtml.indexOf('data-layout="inner"') < islandHtml.indexOf('<main>'),
  'App outlet did not preserve the outer → inner → page composition order.',
);
assert(
  islandHtml.includes('./routes/with-island.ts'),
  'The application-relative route filename was not exposed to the wrapper.',
);
assert(
  islandHtml.includes('shadowroot="open"') ||
    islandHtml.includes('shadowrootmode="open"'),
  'Precomputed island tag metadata was not used during rendering.',
);
