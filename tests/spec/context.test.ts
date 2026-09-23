import { html, LitElement } from 'lit';
import {
  App,
  AppComponent,
  type Context,
  HttpError,
  LayoutComponent,
  PageComponent,
  type RenderContext,
} from '../../packages/limette/src/mod.ts';
import { registerRouteDefinitions } from '../../packages/limette/src/server/register-routes.ts';
import type { RuntimeRouteDefinition } from '../../packages/limette/src/server/route.ts';
import { describe, expect, it } from 'vitest';

function assert(condition: unknown, message: string): asserts condition {
  expect(condition, message).toBeTruthy();
}

interface RequestState {
  user?: string;
  product?: string;
  requestId?: string;
}

interface TestPlatform {
  readonly marker: string;
}

type StructuralOwner = 'app' | 'outer' | 'inner' | 'page' | 'error';
interface Observation {
  owner: StructuralOwner;
  phase: 'head' | 'render';
  instance: number;
  ctx: RenderContext<RequestState, TestPlatform>;
}

let instanceSequence = 0;
const observations: Observation[] = [];
const middlewareStates: RequestState[] = [];
const handlerStates: RequestState[] = [];
const globalMiddlewareParams: Readonly<Record<string, string>>[] = [];
const inheritedMiddlewareParams: Readonly<Record<string, string>>[] = [];
const handlerParams: Readonly<Record<string, string>>[] = [];
let failingLayoutRenders = 0;
let errorRouteLayoutRenders = 0;

function observe(
  owner: StructuralOwner,
  phase: Observation['phase'],
  instance: number,
  ctx: RenderContext<RequestState, TestPlatform>
) {
  observations.push({ owner, phase, instance, ctx });
}

class ContextApp extends AppComponent<RequestState, TestPlatform> {
  readonly instance = ++instanceSequence;

  override head() {
    observe('app', 'head', this.instance, this.ctx);
    return html`<meta name="app-state" content="${this.ctx.state.user}" />`;
  }

  override render() {
    observe('app', 'render', this.instance, this.ctx);
    return html`
      <!DOCTYPE html>
      <html>
        <head>
          ${this.assets.styles}
        </head>
        <body data-app>
          <div data-app-outlet data-base-path="${this.ctx.config.basePath ?? ''}">
            ${this.outlet}
          </div>
          ${this.assets.scripts}
        </body>
      </html>
    `;
  }
}

class OuterLayout extends LayoutComponent<RequestState, TestPlatform> {
  readonly instance = ++instanceSequence;

  override head() {
    observe('outer', 'head', this.instance, this.ctx);
    return html`<meta name="outer-user" content="${this.ctx.state.user}" />`;
  }

  override render() {
    observe('outer', 'render', this.instance, this.ctx);
    return html`<section data-outer>${this.outlet}</section>`;
  }
}

class InnerLayout extends LayoutComponent<RequestState, TestPlatform> {
  readonly instance = ++instanceSequence;

  override head() {
    observe('inner', 'head', this.instance, this.ctx);
    return html` <meta name="inner-product" content="${this.ctx.state.product}" /> `;
  }

  override render() {
    observe('inner', 'render', this.instance, this.ctx);
    return html`<section data-inner>${this.outlet}</section>`;
  }
}

class ContextIsland extends LitElement {
  override render() {
    return html`<span data-island-context="${'ctx' in this}">island</span>`;
  }
}

class ContextPage extends PageComponent<RequestState, TestPlatform> {
  static override islands = {
    'context-island': { component: ContextIsland, ssr: true },
  };

  readonly instance = ++instanceSequence;

  override head() {
    observe('page', 'head', this.instance, this.ctx);
    return html`<title>Context page</title>`;
  }

  override render() {
    observe('page', 'render', this.instance, this.ctx);
    return html`
      <main
        data-page
        data-request-id="${this.ctx.state.requestId}"
        data-product="${this.ctx.state.product}"
        data-param="${this.ctx.params.id}"
        data-platform="${this.ctx.platform.marker}"
      >
        <context-island></context-island>
      </main>
    `;
  }
}

class FailureTargetPage extends PageComponent<RequestState, TestPlatform> {
  override render() {
    return html`<main>failure target</main>`;
  }
}

class TeapotPage extends FailureTargetPage {}
class OrdinaryErrorPage extends FailureTargetPage {}
class ErrorPageFailureTarget extends FailureTargetPage {}

class FailingLayout extends LayoutComponent<RequestState, TestPlatform> {
  override render() {
    failingLayoutRenders++;
    throw new HttpError(503, 'Layout failed');
  }
}

class ErrorRouteLayout extends LayoutComponent<RequestState, TestPlatform> {
  override render() {
    errorRouteLayoutRenders++;
    return html`${this.outlet}`;
  }
}

class ErrorPage extends PageComponent<RequestState, TestPlatform> {
  readonly instance = ++instanceSequence;

  override head() {
    observe('error', 'head', this.instance, this.ctx);
    return html`
      <title>Error page</title>
      <meta name="error-status" content="${this.ctx.error?.status}" />
    `;
  }

  override render() {
    observe('error', 'render', this.instance, this.ctx);
    if (this.ctx.url.pathname.endsWith('/error-page-fails')) {
      throw new Error('The custom error page failed.');
    }
    return html`
      <main
        data-error
        data-boundary="root"
        data-status="${this.ctx.error?.status}"
        data-state="${this.ctx.state.user}"
        data-param="${this.ctx.params.id ?? ''}"
        data-platform="${this.ctx.platform.marker}"
      >
        ${this.ctx.error?.message}
      </main>
    `;
  }
}

class AdminErrorPage extends FailureTargetPage {
  override render() {
    return html`
      <main
        data-error
        data-boundary="admin"
        data-status="${this.ctx.error?.status}"
        data-state="${this.ctx.state.user}"
        data-param="${this.ctx.params.id ?? ''}"
        data-platform="${this.ctx.platform.marker}"
      ></main>
    `;
  }
}

class TypeSurfacePage extends PageComponent<RequestState, TestPlatform> {
  override render() {
    if (false) {
      // @ts-expect-error Structural context cannot advance middleware.
      void this.ctx.next();
      // @ts-expect-error Structural context cannot initiate rendering.
      void this.ctx.render();
      // @ts-expect-error Structural context cannot redirect responses.
      void this.ctx.redirect('/');
      // @ts-expect-error Structural state is a readonly view.
      this.ctx.state.user = 'replacement';
    }
    return html`${this.ctx.state.user}`;
  }
}

function handlerTypeSurface(ctx: Context<RequestState, TestPlatform>) {
  ctx.state.user = 'mutable';
  // @ts-expect-error The state property itself cannot be replaced.
  ctx.state = {};
  // @ts-expect-error render() no longer accepts an application-data argument.
  void ctx.render({ user: 'replacement' });
  // @ts-expect-error Public application config is readonly.
  ctx.config.basePath = '/replacement';
  // @ts-expect-error Error state is framework-controlled.
  ctx.error = new HttpError(500);
}
void TypeSurfacePage;
void handlerTypeSurface;

function componentRoute(
  id: string,
  path: string,
  Page: RuntimeRouteDefinition<RequestState, TestPlatform>['routeModule']['default'],
  options: {
    layouts?: RuntimeRouteDefinition<RequestState, TestPlatform>['layouts'];
    handler?: RuntimeRouteDefinition<RequestState, TestPlatform>['routeModule']['handler'];
    middlewares?: RuntimeRouteDefinition<RequestState, TestPlatform>['middlewares'];
    islands?: readonly string[];
    ssrIslands?: readonly string[];
  } = {}
): RuntimeRouteDefinition<RequestState, TestPlatform> {
  return {
    id,
    path,
    file: `./routes/${id}.ts`,
    tagName: `context-${id.replaceAll(/[^a-z0-9]+/g, '-')}`,
    routeModule: {
      config: { skipInheritedLayouts: false },
      handler: options.handler ?? {},
      default: Page,
    },
    layouts: options.layouts ?? [],
    middlewares: options.middlewares ?? [],
    islands: options.islands ?? [],
    ssrIslands: options.ssrIslands ?? [],
    assets: {
      scripts: ['/assets/context-client.js'],
      styles: ['/assets/context.css'],
      islandStyles: {},
    },
  };
}

describe('request and render context', () => {
  it('shares request-local state through rendering and selects error boundaries', async () => {
    const stateMiddleware = {
      handler: async (ctx: Context<RequestState, TestPlatform>) => {
        middlewareStates.push(ctx.state);
        globalMiddlewareParams.push(ctx.params);
        ctx.state.user = `user:${ctx.url.pathname}`;
        ctx.state.requestId = ctx.params.id ?? ctx.url.pathname;
        return await ctx.next();
      },
    };

    const normalRoute = componentRoute('item', '/items/:id', ContextPage, {
      layouts: [
        { config: { skipInheritedLayouts: false }, default: OuterLayout },
        { config: { skipInheritedLayouts: false }, default: InnerLayout },
      ],
      islands: ['context-island'],
      ssrIslands: ['context-island'],
      middlewares: [
        {
          handler: async (ctx) => {
            inheritedMiddlewareParams.push(ctx.params);
            return await ctx.next();
          },
        },
      ],
      handler: {
        GET(ctx) {
          handlerStates.push(ctx.state);
          handlerParams.push(ctx.params);
          ctx.state.product = `product:${ctx.params.id}`;
          return ctx.render();
        },
      },
    });

    const failingRoute = componentRoute('fail', '/fail/:id', FailureTargetPage, {
      layouts: [{ config: { skipInheritedLayouts: false }, default: FailingLayout }],
    });

    const throwingHandler = (message: string | HttpError) => ({
      GET() {
        throw typeof message === 'string' ? new Error(message) : message;
      },
    });

    const errorRoute = componentRoute('error', '/_error', ErrorPage, {
      layouts: [{ config: { skipInheritedLayouts: false }, default: ErrorRouteLayout }],
    });

    const app = new App<RequestState, TestPlatform>({ basePath: '/base' });
    app.use(stateMiddleware.handler);
    registerRouteDefinitions(app, {
      appWrapper: ContextApp,
      routes: [
        normalRoute,
        failingRoute,
        componentRoute('teapot', '/teapot', TeapotPage, {
          handler: throwingHandler(new HttpError(418)),
        }),
        componentRoute('ordinary-error', '/ordinary-error', OrdinaryErrorPage, {
          handler: throwingHandler('ordinary failure'),
        }),
        componentRoute('error-page-fails', '/error-page-fails', ErrorPageFailureTarget, {
          handler: throwingHandler('trigger failing error page'),
        }),
        componentRoute('admin-root-failure', '/admin', FailureTargetPage, {
          handler: throwingHandler(new HttpError(418)),
        }),
        componentRoute('admin-user-failure', '/admin/users/:id', FailureTargetPage, {
          handler: throwingHandler(new HttpError(418)),
        }),
        componentRoute('other-failure', '/other', FailureTargetPage, {
          handler: throwingHandler(new HttpError(418)),
        }),
        errorRoute,
        componentRoute('admin/_error', '/admin/_error', AdminErrorPage, {
          layouts: [
            {
              config: { skipInheritedLayouts: false },
              default: ErrorRouteLayout,
            },
          ],
        }),
      ],
    });

    const platform: TestPlatform = { marker: 'opaque-platform' };
    const handler = app.handler();
    const normalResponse = await handler(
      new Request('https://example.test/base/items/alpha'),
      platform
    );
    const normalHtml = await normalResponse.text();
    assert(normalResponse.status === 200, 'Normal context route did not render.');
    for (const expected of [
      'data-app',
      'data-outer',
      'data-inner',
      'data-page',
      'data-request-id="alpha"',
      'data-product="product:alpha"',
      'data-param="alpha"',
      'data-platform="opaque-platform"',
      'data-base-path="/base"',
      '/assets/context.css',
      '/assets/context-client.js',
    ]) {
      assert(normalHtml.includes(expected), `Normal SSR lost ${expected}.`);
    }
    assert(
      normalHtml.indexOf('data-app') < normalHtml.indexOf('data-outer') &&
        normalHtml.indexOf('data-outer') < normalHtml.indexOf('data-inner') &&
        normalHtml.indexOf('data-inner') < normalHtml.indexOf('data-page'),
      'Structural context fixture rendered in the wrong order.'
    );
    assert(
      middlewareStates[0] === handlerStates[0],
      'Middleware and route handler received different state objects.'
    );
    assert(
      globalMiddlewareParams[0] === inheritedMiddlewareParams[0] &&
        inheritedMiddlewareParams[0] === handlerParams[0] &&
        handlerParams[0].id === 'alpha',
      'Global/inherited middleware and the route handler did not share route params.'
    );
    const normalObservations = observations.filter((entry) =>
      entry.ctx.url.pathname.endsWith('/items/alpha')
    );
    for (const owner of ['app', 'outer', 'inner', 'page'] as const) {
      const entries = normalObservations.filter((entry) => entry.owner === owner);
      assert(entries.length === 2, `${owner} did not run head() and render().`);
      assert(
        entries[0].instance === entries[1].instance &&
          entries[0].ctx === entries[1].ctx &&
          entries[0].ctx.state === handlerStates[0] &&
          entries[0].ctx.params === handlerParams[0] &&
          entries[0].ctx.params.id === 'alpha' &&
          entries[0].ctx.request === normalObservations[0].ctx.request &&
          entries[0].ctx.platform === platform,
        `${owner} did not receive the same request-local instance/context/state.`
      );
    }
    assert(
      normalHtml.includes('data-island-context="false"'),
      'An SSR island received an implicit server context.'
    );

    const concurrentPlatforms = Array.from({ length: 20 }, (_, index): TestPlatform => ({
      marker: `platform-${index}`,
    }));
    const concurrentBodies = await Promise.all(
      concurrentPlatforms.map(async (requestPlatform, index) => {
        const response = await handler(
          new Request(`https://example.test/base/items/request-${index}`),
          requestPlatform
        );
        return await response.text();
      })
    );
    for (let index = 0; index < concurrentBodies.length; index++) {
      const body = concurrentBodies[index];
      assert(
        body.includes(`data-request-id="request-${index}"`) &&
          body.includes(`data-product="product:request-${index}"`) &&
          body.includes(`data-platform="platform-${index}"`),
        `Concurrent request ${index} received another request's context/state.`
      );
    }
    assert(
      new Set(middlewareStates).size === middlewareStates.length,
      'Requests reused a state object.'
    );

    const failedLayoutResponse = await handler(
      new Request('https://example.test/base/fail/layout-id'),
      platform
    );
    const failedLayoutHtml = await failedLayoutResponse.text();
    assert(failedLayoutResponse.status === 503, 'Error status was not preserved.');
    for (const expected of [
      'data-app',
      'data-error',
      'data-status="503"',
      'data-state="user:/base/fail/layout-id"',
      'data-param="layout-id"',
      'data-platform="opaque-platform"',
      '<title>Error page</title>',
      'content="503"',
    ]) {
      assert(failedLayoutHtml.includes(expected), `Error SSR lost ${expected}.`);
    }
    assert(
      failingLayoutRenders === 1 && errorRouteLayoutRenders === 0,
      'Error rendering reran a matched/error-route layout.'
    );

    const notFoundResponse = await handler(
      new Request('https://example.test/base/not-found'),
      platform
    );
    assert(
      notFoundResponse.status === 404 &&
        (await notFoundResponse.text()).includes('data-status="404"'),
      '404 did not use the shared error page.'
    );

    const adminChildResponse = await handler(
      new Request('https://example.test/base/admin/users/alice'),
      platform
    );
    const adminChildHtml = await adminChildResponse.text();
    assert(
      adminChildResponse.status === 418 &&
        adminChildHtml.includes('data-boundary="admin"') &&
        adminChildHtml.includes('data-param="alice"') &&
        adminChildHtml.includes('data-state="user:/base/admin/users/alice"') &&
        adminChildHtml.includes('data-platform="opaque-platform"'),
      'A nested error did not use its nearest boundary with original context.'
    );

    const adminRootResponse = await handler(
      new Request('https://example.test/base/admin'),
      platform
    );
    assert(
      adminRootResponse.status === 418 &&
        (await adminRootResponse.text()).includes('data-boundary="admin"'),
      'A nested error boundary did not include its directory root.'
    );

    const siblingResponse = await handler(new Request('https://example.test/base/other'), platform);
    const siblingHtml = await siblingResponse.text();
    assert(
      siblingResponse.status === 418 &&
        siblingHtml.includes('data-boundary="root"') &&
        !siblingHtml.includes('data-boundary="admin"'),
      'A sibling route did not fall back to the root error boundary.'
    );

    const prefixCollisionResponse = await handler(
      new Request('https://example.test/base/administrator'),
      platform
    );
    assert(
      prefixCollisionResponse.status === 404 &&
        (await prefixCollisionResponse.text()).includes('data-boundary="root"'),
      'The /admin error boundary incorrectly matched /administrator.'
    );

    const ordinaryResponse = await handler(
      new Request('https://example.test/base/ordinary-error'),
      platform
    );
    assert(
      ordinaryResponse.status === 500 &&
        (await ordinaryResponse.text()).includes('data-status="500"'),
      'An ordinary error was not normalized for the error page.'
    );

    const teapotResponse = await handler(new Request('https://example.test/base/teapot'), platform);
    assert(
      teapotResponse.status === 418 && (await teapotResponse.text()).includes('data-status="418"'),
      'HttpError status did not reach the error page.'
    );

    const fallbackResponse = await handler(
      new Request('https://example.test/base/error-page-fails'),
      platform
    );
    assert(
      fallbackResponse.status === 500 &&
        (await fallbackResponse.text()) === 'Internal server error',
      'A failing custom error page did not use the non-recursive fallback.'
    );
  });
});
