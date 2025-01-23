// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import { unsafeCSS } from "lit";
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from "lit";
import { LitElementRenderer } from "@lit-labs/ssr/lib/lit-element-renderer.js";
import type { RenderInfo, RenderResult } from "@lit-labs/ssr";
import type { BuildRoute } from "../../dev/build.ts";
import type { Context } from "../context.ts";

type LmtShadowRootMode = "open" | "closed" | "disabled";
interface ContextLitElement extends LitElement {
  ctx: Context;
}

export const LimetteElementRenderer = (route: BuildRoute, ctx: Context) =>
  class LimetteElementRenderer extends LitElementRenderer {
    override connectedCallback(): void {
      if (!this.element.hasAttribute("ssr")) {
        this.element.setAttribute("skip-hydration", "");
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
      const ctor = this.element.constructor as typeof LitElement & {
        __requiresTailwind: boolean;
      };

      // A component is an island if it's included in route.islands.
      const isIsland =
        route.islands?.includes(this.tagName) ||
        this.element.hasAttribute("island");

      // Islands are CSR'ed, so we can't render them in light DOM
      if (!isIsland) {
        (this.shadowRootOptions.mode as LmtShadowRootMode) = "disabled";
      } else {
        this.shadowRootOptions.mode = "open";
      }

      // Partial SSR islands with only Tailwind style (if not skipped)
      if (isIsland && !this.element.hasAttribute("ssr")) {
        if (this.element.hasAttribute("skip-tailwind") || !route.cssAssetPath) {
          // @ts-expect-error: LitElementRenderer actually accepts undefined as a returned value
          return;
        }

        return `<style>@import url("${route.cssAssetPath}");</style>`;
      }

      // Inject context for SSR'ed components that use the ContextMixin
      if (
        (!isIsland || (isIsland && this.element.hasAttribute("ssr"))) &&
        Object.hasOwn(Object.getPrototypeOf(ctor), "__requiresContext")
      ) {
        (this.element as ContextLitElement).ctx = ctx;
      }

      /**
       * Inject Tailwind CSS for
       *    - is island
       *    - is ssr'ed
       *    - no skip-tailwind attribute
       *    - route has css
       */
      if (
        isIsland &&
        route.cssAssetPath &&
        this.element.hasAttribute("ssr") &&
        !this.element.hasAttribute("skip-tailwind") &&
        ctor.__requiresTailwind !== true
      ) {
        // Inject Tailwind CSS import
        ctor.elementStyles?.unshift?.(
          unsafeCSS(`@import url("${route.cssAssetPath}");`)
        );

        // Mark component that was already injected
        ctor.__requiresTailwind = true;
      }

      return super.renderShadow(renderInfo);
    }
  };
