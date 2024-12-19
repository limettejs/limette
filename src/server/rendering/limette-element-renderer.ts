// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import { unsafeCSS } from "lit";
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from "lit";
import { LitElementRenderer } from "../../deps.ts";
import type { RenderInfo, RenderResult } from "../../deps.ts";
import type { BuildRoute } from "../../dev/build.ts";
import type { ComponentContext } from "../router.ts";

interface LimetteElement extends LitElement {
  __ctx?: ComponentContext; // Define the custom property here }
}

type LmtShadowRootMode = "open" | "closed" | "disabled";

export const LimetteElementRenderer = (
  route: BuildRoute,
  componentContext: ComponentContext
) =>
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
        __tailwind: boolean;
        disableLightDom: boolean;
      };

      // We check if the element is inside of an is-land element
      const isIsland =
        route.islands?.includes(this.tagName) ||
        renderInfo.customElementInstanceStack.at(-2)?.tagName === "is-land" ||
        this.element.hasAttribute("island");

      // Islands are CSR'ed, so we can't render them in light DOM
      if (ctor?.disableLightDom !== true && !isIsland) {
        (this.shadowRootOptions.mode as LmtShadowRootMode) = "disabled";
      } else {
        this.shadowRootOptions.mode = "open";
      }

      if (isIsland && !this.element.hasAttribute("ssr")) {
        // @ts-expect-error: LitElementRenderer actually accepts undefined as a returned value
        if (this.element.hasAttribute("no-tailwind")) return;

        return `<style>@import url("${route.cssAssetPath}");</style>`;
      }

      // Inject component context
      if (this.tagName.startsWith("lmt-route-")) {
        (this.element as LimetteElement).__ctx = componentContext;
      }

      /**
       * Don't inject Tailwind CSS for
       *    - <is-land>,
       *    - no-tailwind attribute
       *    - there is no CSS
       *    - <lmt-route-...> + light DOM
       */
      if (
        (this.tagName !== "is-land" &&
          !this.element.hasAttribute("no-tailwind") &&
          ctor.__tailwind !== true &&
          route.cssAssetPath &&
          !this.tagName.startsWith("lmt-route-")) ||
        (this.tagName.startsWith("lmt-route-") &&
          ctor?.disableLightDom === true)
      ) {
        // Inject Tailwind CSS import
        ctor.elementStyles?.unshift?.(
          unsafeCSS(`@import url("${route.cssAssetPath}");`)
        );

        // Mark component that was already injected
        ctor.__tailwind = true;
      }

      return super.renderShadow(renderInfo);
    }
  };
