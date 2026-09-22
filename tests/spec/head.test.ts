import { html } from 'lit';
import { DOMParser } from 'linkedom';
import {
  AppComponent,
  LayoutComponent,
  PageComponent,
} from '../../src/server/components.ts';
import { ContextImpl } from '../../src/server/context.ts';
import type { RuntimeRouteDefinition } from '../../src/server/route.ts';
import { renderContent } from '../../src/server/ssr.ts';
import { describe, expect, it } from 'vitest';

function assert(condition: unknown, message: string): asserts condition {
  expect(condition, message).toBeTruthy();
}

let instanceSequence = 0;
const lifecycle: string[] = [];

class TestApp extends AppComponent {
  readonly instance = ++instanceSequence;

  override head() {
    lifecycle.push('app');
    return html`
      <title>App title</title>
      <base href="/app/" />
      <meta charset="utf-8" />
      <meta name="description" content="App description" />
      <meta name="robots" content="index,follow" />
      <meta property="og:title" content="App OG title" />
      <meta key="primary-og-image" property="og:image" content="/app.jpg" />
      <meta key="secondary-og-image" property="og:image" content="/two.jpg" />
      <link rel="canonical" href="https://example.test/app" />
      <link rel="stylesheet" href="/application.css" />
      <link rel="preload" href="/chunk.js" as="script" />
      <script>globalThis.appHead = true;</script>
      <script key="structured-data" type="application/ld+json">
        {"owner":"app"}
      </script>
      <style>.app-head { color: red; }</style>
      <meta name="app-instance" content="${this.instance}" />
    `;
  }

  override render() {
    return html`
      <!DOCTYPE html>
      <html>
        <head>
                <meta charset="windows-1252" />
                <meta name="viewport" content="width=device-width" />
                ${this.assets.styles}
              </head>
        <body>
          <span data-app-instance="${this.instance}"></span>
          ${this.outlet} ${this.assets.scripts}
              </body>
      </html>
    `;
  }
}

class OuterLayout extends LayoutComponent {
  readonly instance = ++instanceSequence;

  override head() {
    lifecycle.push('outer');
    return html`
      <title>Outer title</title>
      <meta property="og:title" content="Outer OG title" />
      <link rel="canonical" href="https://example.test/outer" />
      <link rel="stylesheet" href="/application.css" />
      <script>globalThis.outerHead = true;</script>
      <style>.outer-head { color: green; }</style>
      <meta name="outer-instance" content="${this.instance}" />
    `;
  }

  override render() {
    return html`<section data-outer-instance="${this.instance}">
      ${this.outlet}
    </section>`;
  }
}

class InnerLayout extends LayoutComponent {
  readonly instance = ++instanceSequence;

  override async head() {
    lifecycle.push('inner');
    await Promise.resolve();
    return html`
      <title>Inner title</title>
      <base href="/inner/" />
      <meta name="description" content="Inner description" />
      <script>globalThis.innerHead = true;</script>
      <style>.inner-head { color: blue; }</style>
      <meta name="inner-instance" content="${this.instance}" />
    `;
  }

  override render() {
    return html`<section data-inner-instance="${this.instance}">
      ${this.outlet}
    </section>`;
  }
}

class RouteA extends PageComponent {
  readonly instance = ++instanceSequence;

  override head() {
    lifecycle.push('route');
    return html`
      <title>Route A title</title>
      <meta charset="utf-16" />
      <meta name="description" content="Route A description" />
      <meta property="og:title" content="Route A OG title" />
      <meta name="route-a-only" content="present" />
      <meta key="primary-og-image" property="og:image" content="/route-a.jpg" />
      <link rel="canonical" href="https://example.test/a" />
      <script>globalThis.routeHead = true;</script>
      <script key="structured-data" type="application/ld+json">
        {"owner":"route-a"}
      </script>
      <style>.route-head { color: purple; }</style>
      <meta name="route-instance" content="${this.instance}" />
    `;
  }

  override render() {
    return html`<main data-route-instance="${this.instance}">Route A</main>`;
  }
}

class RouteB extends PageComponent {
  override head() {
    return html`<title>Route B title</title>`;
  }

  override render() {
    return html`<main>Route B</main>`;
  }
}

function route(
  id: 'a' | 'b',
  component: typeof RouteA | typeof RouteB,
): RuntimeRouteDefinition {
  const tagName = `head-test-${id}`;
  return {
    id,
    path: `/${id}`,
    file: `./routes/${id}.ts`,
    tagName,
    routeModule: {
      config: { skipInheritedLayouts: false },
      handler: {},
      default: component,
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
    islands: [],
    ssrIslands: [],
    renderComponents: {
      [`lmt-route-${tagName}`]: component,
    },
    assets: {
      scripts: [],
      styles: ['/assets/framework.css'],
      islandStyles: {},
      tailwindStyle: '/assets/tailwind.css',
    },
  };
}

function context(id: 'a' | 'b') {
  const url = new URL(`https://example.test/${id}`);
  return new ContextImpl({
    request: new Request(url),
    url,
    platform: {},
    params: {},
    config: {},
    next: async () => new Response('next'),
  });
}

async function renderRoute(id: 'a' | 'b') {
  const component = id === 'a' ? RouteA : RouteB;
  return await renderContent(
    TestApp,
    route(id, component),
    context(id),
  );
}

function parseDocument(source: string) {
  return new DOMParser().parseFromString(source, 'text/html')!;
}

function one(document: Document, selector: string) {
  const elements = document.querySelectorAll(selector);
  assert(
    elements.length === 1,
    `Expected one ${selector}, got ${elements.length}.`,
  );
  return elements[0];
}

describe('head composition', () => {
  it('merges app, layout, and route head content per render', async () => {
    lifecycle.length = 0;
    const htmlA = await renderRoute('a');
    const documentA = parseDocument(htmlA) as unknown as Document;

    assert(
      lifecycle.join(',') === 'app,outer,inner,route',
      `Head lifecycle order was ${lifecycle.join(',')}.`,
    );
    assert(
      one(documentA, 'title').textContent === 'Route A title',
      'Route title did not win.',
    );
    assert(
      one(documentA, 'base').getAttribute('href') === '/inner/',
      'Inner base did not win.',
    );
    assert(
      one(documentA, 'meta[charset]').getAttribute('charset') === 'utf-16',
      'Route charset did not win.',
    );
    assert(
      one(documentA, 'meta[name="description"]').getAttribute('content') ===
        'Route A description',
      'Route description did not win.',
    );
    assert(
      one(documentA, 'meta[name="robots"]').getAttribute('content') ===
        'index,follow',
      'Unrelated app metadata was lost.',
    );
    assert(
      one(documentA, 'meta[property="og:title"]').getAttribute('content') ===
        'Route A OG title',
      'Route Open Graph title did not win.',
    );

    const images = Array.from(
      documentA.querySelectorAll('meta[property="og:image"]'),
    );
    assert(
      images.length === 2,
      `Expected two keyed OG images, got ${images.length}.`,
    );
    assert(
      images.some((image) => image.getAttribute('content') === '/route-a.jpg'),
      'Same-key route image did not replace the app image.',
    );
    assert(
      images.some((image) => image.getAttribute('content') === '/two.jpg'),
      'Differently keyed image was lost.',
    );
    assert(
      one(documentA, 'link[rel="canonical"]').getAttribute('href') ===
        'https://example.test/a',
      'Route canonical did not win.',
    );
    assert(
      documentA.querySelectorAll('link[href="/application.css"]').length === 1,
      'Duplicate logical stylesheet accumulated.',
    );
    assert(
      documentA.querySelectorAll('link[rel="preload"][href="/chunk.js"]')
        .length ===
        1,
      'Preload link was lost.',
    );
    assert(
      documentA.querySelectorAll('link[href="/assets/framework.css"]')
        .length === 1,
      'Framework route CSS was lost.',
    );
    assert(
      documentA.querySelectorAll('link[href="/assets/tailwind.css"]').length ===
        1,
      'Framework Tailwind CSS was lost.',
    );
    assert(
      documentA.querySelectorAll('head > script:not([src])').length === 5,
      'Unkeyed inline scripts did not coexist with keyed JSON-LD.',
    );
    assert(
      documentA.querySelectorAll('head > style').length === 4,
      'Unkeyed inline styles did not coexist.',
    );
    assert(
      one(documentA, 'script[type="application/ld+json"]').textContent
        ?.includes(
          'route-a',
        ),
      'Keyed JSON-LD was not replaced.',
    );
    assert(
      !documentA.head.innerHTML.includes(' key='),
      'A Limette head key leaked into final HTML.',
    );
    assert(
      !htmlA.includes('data-limette-head-asset'),
      'An internal framework asset marker leaked into final HTML.',
    );

    for (const owner of ['app', 'outer', 'inner', 'route']) {
      const headInstance = one(documentA, `meta[name="${owner}-instance"]`)
        .getAttribute('content');
      const renderedInstance = one(documentA, `[data-${owner}-instance]`)
        .getAttribute(`data-${owner}-instance`);
      assert(
        headInstance === renderedInstance,
        `${owner} head() did not use its rendering instance.`,
      );
    }

    const htmlB = await renderRoute('b');
    const documentB = parseDocument(htmlB) as unknown as Document;
    assert(
      one(documentB, 'title').textContent === 'Route B title',
      'Route B title did not render.',
    );
    assert(
      !documentB.querySelector('meta[name="route-a-only"]'),
      'Route A-only metadata survived Route B rendering.',
    );
    assert(
      !documentB.head.textContent?.includes('route-a'),
      'Route A-only JSON-LD survived Route B rendering.',
    );
    assert(
      documentB.body.textContent?.includes('Route B') &&
        !documentB.body.textContent?.includes('Route A'),
      'Route B received a stale structural outlet from Route A.',
    );

    const isolatedRenders = await Promise.all(
      Array.from(
        { length: 20 },
        (_, index) => renderRoute(index % 2 ? 'a' : 'b'),
      ),
    );
    for (let index = 0; index < isolatedRenders.length; index++) {
      const expected = index % 2 ? 'Route A' : 'Route B';
      const unexpected = index % 2 ? 'Route B' : 'Route A';
      const body =
        (parseDocument(isolatedRenders[index]) as unknown as Document)
          .body.textContent ?? '';
      assert(
        body.includes(expected) && !body.includes(unexpected),
        `Concurrent ${expected} render received another request's outlet.`,
      );
    }
  });
});
