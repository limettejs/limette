// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import { unsafeCSS } from "lit";
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from "lit";
import { LitElementRenderer } from "../../deps.ts";
import type { RenderInfo, RenderResult } from "../../deps.ts";
import type { BuildRoute } from "../../dev/build.ts";
import type { ComponentContext } from "../router.ts";

interface LimetteElement extends LitElement {
  __ctx?: any; // Define the custom property here }
}

export const LimetteElementRenderer = (
  route: BuildRoute,
  componentContext: ComponentContext
) =>
  class LimetteElementRenderer extends LitElementRenderer {
    /**
     * Render the element's shadow root children.
     *
     * If `renderShadow()` returns undefined, no declarative shadow root is
     * emitted.
     */
    override renderShadow(_renderInfo: RenderInfo): RenderResult {
      if (this.element.hasAttribute("no-ssr")) {
        return "";
      }

      const ctor = this.element.constructor as typeof LitElement & {
        __tailwind: boolean;
      };

      // Inject component context
      if (this.tagName.startsWith("lmt-route-")) {
        (this.element as LimetteElement).__ctx = componentContext;
      }

      // Don't inject Tailwind CSS for <is-land>, no-tailwind attribute or if there is no CSS
      if (
        this.tagName !== "is-land" &&
        !this.element.hasAttribute("no-tailwind") &&
        ctor.__tailwind !== true &&
        route.cssAssetPath
      ) {
        // Inject Tailwind CSS import
        ctor.elementStyles?.unshift?.(
          unsafeCSS(`@import url("${route.cssAssetPath}");`)
        );

        // Mark component that was already injected
        ctor.__tailwind = true;
      }

      return super.renderShadow(_renderInfo);
    }
  };
