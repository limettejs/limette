// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from 'lit';
import { LitElementRenderer } from '@lit-labs/ssr/lib/lit-element-renderer.js';
import type { RenderInfo, RenderResult } from '@lit-labs/ssr';
import type { RuntimeRouteDefinition } from '../route.ts';
import type { Context } from '../context.ts';
import type { HeadRenderResult } from '../components.ts';

type LmtShadowRootMode = 'open' | 'closed' | 'disabled';
interface ContextLitElement extends LitElement {
  ctx: Context;
}

function* renderRouteStyle(
  stylesheets: readonly string[],
  shadow: RenderResult,
): RenderResult {
  yield `<style>${
    stylesheets.map((stylesheet) => `@import url("${stylesheet}");`).join('')
  }</style>`;
  yield* shadow;
}

export const LimetteElementRenderer = (
  route: RuntimeRouteDefinition,
  ctx: Context,
  onRouteHead?: (
    result: HeadRenderResult | Promise<HeadRenderResult>,
  ) => void,
) =>
  class LimetteElementRenderer extends LitElementRenderer {
    static routeHeadCollected = false;

    constructor(tagName: string) {
      super(tagName);

      const RenderComponent = !route.islands.includes(tagName) ||
          route.ssrIslands.includes(tagName)
        ? route.renderComponents?.[tagName]
        : undefined;
      if (RenderComponent) {
        // CustomElementRegistry#define reads this during registration, which
        // finalizes Lit's reactive property metadata. Development constructors
        // deliberately bypass registration, so perform the same read locally.
        void (RenderComponent as typeof LitElement).observedAttributes;
        this.element = new RenderComponent() as LitElement;
      }
    }

    override connectedCallback(): void {
      if (
        route.islands.includes(this.tagName) &&
        !route.ssrIslands.includes(this.tagName)
      ) {
        this.element.setAttribute('skip-hydration', '');
      }

      super.connectedCallback();
    }
    /**
     * Render the element's shadow root children.
     *
     * If `renderShadow()` returns undefined, no declarative shadow root is
     * emitted.
     */
    override renderShadow(renderInfo: RenderInfo): RenderResult {
      // A component is an island if it's included in route.islands.
      const isIsland = route.islands.includes(this.tagName);
      const ssrIsland = route.ssrIslands.includes(this.tagName);
      const islandStyles = route.assets.islandStyles[this.tagName] ?? [];
      const shadowStyles = [
        ...(route.assets.tailwindStyle ? [route.assets.tailwindStyle] : []),
        ...(isIsland ? islandStyles : []),
      ];

      // Island shadow roots stay encapsulated whether they are CSR-only or
      // explicitly opted into SSR. Structural components render in light DOM.
      if (!isIsland) {
        (this.shadowRootOptions.mode as LmtShadowRootMode) = 'disabled';
      } else {
        this.shadowRootOptions.mode = 'open';
      }

      // CSR-only islands expose their host and external styles without
      // invoking the application component implementation on the server.
      if (isIsland && !ssrIsland) {
        if (shadowStyles.length === 0) {
          // @ts-expect-error: LitElementRenderer actually accepts undefined as a returned value
          return;
        }

        return renderRouteStyle(shadowStyles, []);
      }

      // Inject context for every server-rendered component instance.
      if (!isIsland || ssrIsland) {
        (this.element as ContextLitElement).ctx = ctx;
      }

      if (
        this.tagName === `lmt-route-${route.tagName}` &&
        !LimetteElementRenderer.routeHeadCollected
      ) {
        LimetteElementRenderer.routeHeadCollected = true;
        const structuralElement = this.element as ContextLitElement & {
          head?: () => HeadRenderResult | Promise<HeadRenderResult>;
        };
        if (structuralElement.head) {
          onRouteHead?.(structuralElement.head());
        }
      }

      const shadow = super.renderShadow(renderInfo);
      return shadowStyles.length > 0 && (!isIsland || ssrIsland)
        ? renderRouteStyle(shadowStyles, shadow)
        : shadow;
    }
  };
