// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from 'lit';
import { LitElementRenderer } from '@lit-labs/ssr/lib/lit-element-renderer.js';
import type { RenderInfo, RenderResult } from '@lit-labs/ssr';
import type { RuntimeRouteDefinition } from '../route.ts';
import type { Context } from '../context.ts';

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
) =>
  class LimetteElementRenderer extends LitElementRenderer {
    override connectedCallback(): void {
      if (!this.element.hasAttribute('ssr')) {
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
      const isIsland = route.islands.includes(this.tagName) ||
        this.element.hasAttribute('island');
      const islandStyles = route.assets.islandStyles[this.tagName] ?? [];

      // Islands are CSR'ed, so we can't render them in light DOM
      if (!isIsland) {
        (this.shadowRootOptions.mode as LmtShadowRootMode) = 'disabled';
      } else {
        this.shadowRootOptions.mode = 'open';
      }

      // Partial SSR islands with only Tailwind style (if not skipped)
      if (isIsland && !this.element.hasAttribute('ssr')) {
        if (
          this.element.hasAttribute('skip-tailwind') ||
          islandStyles.length === 0
        ) {
          // @ts-expect-error: LitElementRenderer actually accepts undefined as a returned value
          return;
        }

        return renderRouteStyle(islandStyles, []);
      }

      // Inject context for every server-rendered component instance.
      if (!isIsland || (isIsland && this.element.hasAttribute('ssr'))) {
        (this.element as ContextLitElement).ctx = ctx;
      }

      const shadow = super.renderShadow(renderInfo);
      return isIsland &&
          islandStyles.length > 0 &&
          this.element.hasAttribute('ssr') &&
          !this.element.hasAttribute('skip-tailwind')
        ? renderRouteStyle(islandStyles, shadow)
        : shadow;
    }
  };
