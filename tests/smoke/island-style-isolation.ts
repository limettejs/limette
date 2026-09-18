import { css, html, LitElement } from 'lit';
import { AppComponent, PageComponent } from '../../src/server/components.ts';
import { Context } from '../../src/server/context.ts';
import type { RuntimeRouteDefinition } from '../../src/server/route.ts';
import {
  type AppWrapperComponentClass,
  renderContent,
} from '../../src/server/ssr.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class SharedStyleIsland extends LitElement {
  static override styles = css`
    :host {
      color: rebeccapurple;
    }
  `;

  override render() {
    return html`<span>shared island</span>`;
  }
}

if (!customElements.get('shared-style-island')) {
  customElements.define('shared-style-island', SharedStyleIsland);
}

class RouteA extends PageComponent {
  override render() {
    return html`<shared-style-island ssr></shared-style-island>`;
  }
}

class RouteB extends PageComponent {
  override render() {
    return html`<shared-style-island ssr></shared-style-island>`;
  }
}

class TestApp extends AppComponent {
  override render() {
    return html`
      <!DOCTYPE html>
      <html>
        <head>${this.assets.styles}</head>
        <body>${this.page}</body>
      </html>
    `;
  }
}

function route(
  id: 'a' | 'b',
  component: typeof RouteA | typeof RouteB,
): RuntimeRouteDefinition {
  return {
    id,
    path: `/${id}`,
    file: `./routes/${id}.ts`,
    tagName: `style-isolation-${id}`,
    routeModule: {
      config: { skipInheritedLayouts: false },
      handler: {},
      default: component,
    },
    layouts: [],
    middlewares: [],
    islands: ['shared-style-island'],
    assets: {
      scripts: [],
      styles: [`/assets/page-${id}.css`],
      islandStyles: {
        'shared-style-island': [
          `/assets/island-${id}-one.css`,
          `/assets/island-${id}-two.css`,
        ],
      },
    },
  };
}

const routeA = route('a', RouteA);
const routeB = route('b', RouteB);

function context(id: 'a' | 'b') {
  const url = new URL(`https://example.test/${id}`);
  return new Context({
    request: new Request(url),
    url,
    info: {},
    params: {},
    config: {},
    next: async () => new Response('next'),
  });
}

async function renderRoute(definition: RuntimeRouteDefinition, id: 'a' | 'b') {
  return await renderContent(
    TestApp as unknown as AppWrapperComponentClass,
    definition,
    context(id),
  );
}

function islandShadow(html: string) {
  const match = html.match(
    /<shared-style-island[^>]*>([\s\S]*?)<\/shared-style-island>/,
  );
  assert(match, 'The shared island was not rendered.');
  return match[1];
}

function assertRouteStyle(html: string, own: 'a' | 'b', other: 'a' | 'b') {
  const shadow = islandShadow(html);
  assert(
    shadow.includes(`/assets/island-${own}-one.css`) &&
      shadow.includes(`/assets/island-${own}-two.css`),
    `Route ${own} island lost one of its stylesheets.`,
  );
  assert(
    !shadow.includes(`/assets/island-${other}-one.css`) &&
      !shadow.includes(`/assets/island-${other}-two.css`),
    `Route ${own} island received route ${other}'s stylesheet.`,
  );
  assert(
    !shadow.includes(`/assets/page-${own}.css`),
    `Route ${own} island received the document stylesheet.`,
  );
  assert(
    shadow.includes('color: rebeccapurple'),
    `Route ${own} island lost its application-defined styles.`,
  );
}

const elementStyles = SharedStyleIsland.elementStyles;
const styleText = (style: unknown) => (style as { cssText: string }).cssText;
const applicationStyles = elementStyles.map(styleText);
const classProperties = Object.getOwnPropertyNames(SharedStyleIsland);
assert(
  !('__requiresTailwind' in SharedStyleIsland),
  'The island class unexpectedly starts with route stylesheet state.',
);

assertRouteStyle(await renderRoute(routeA, 'a'), 'a', 'b');
assertRouteStyle(await renderRoute(routeB, 'b'), 'b', 'a');
assertRouteStyle(await renderRoute(routeA, 'a'), 'a', 'b');

const concurrent = Array.from({ length: 100 }, (_, index) => {
  const id = index % 2 === 0 ? 'a' : 'b';
  const definition = id === 'a' ? routeA : routeB;
  return renderRoute(definition, id).then((result) =>
    assertRouteStyle(result, id, id === 'a' ? 'b' : 'a')
  );
});
await Promise.all(concurrent);

assert(
  SharedStyleIsland.elementStyles === elementStyles,
  'Rendering replaced the island class elementStyles array.',
);
assert(
  JSON.stringify(SharedStyleIsland.elementStyles.map(styleText)) ===
    JSON.stringify(applicationStyles),
  'Rendering changed the island class application-defined styles.',
);
assert(
  !('__requiresTailwind' in SharedStyleIsland),
  'Rendering added route stylesheet state to the island class.',
);
assert(
  JSON.stringify(Object.getOwnPropertyNames(SharedStyleIsland)) ===
    JSON.stringify(classProperties),
  'Rendering added state to the island class.',
);
