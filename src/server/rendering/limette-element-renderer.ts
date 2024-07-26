import { unsafeCSS, LitElement } from "lit";
import { LitElementRenderer } from "../../deps.ts";
import type { RenderInfo, RenderResult } from "../../deps.ts";

export const LimetteElementRenderer = (route) =>
  class LimetteElementRenderer extends LitElementRenderer {
    /**
     * Render the element's shadow root children.
     *
     * If `renderShadow()` returns undefined, no declarative shadow root is
     * emitted.
     */
    renderShadow(_renderInfo: RenderInfo): RenderResult | undefined {
      if (this.element.hasAttribute("no-ssr")) {
        return undefined;
      }

      const ctor = this.element.constructor as typeof LitElement;

      // Don't inject Tailwind CSS for <is-land>, no-tailwind attribute or if there is no CSS
      if (
        this.tagName !== "is-land" &&
        !this.element.hasAttribute("no-tailwind") &&
        ctor.__tailwind !== true &&
        route.cssPath
      ) {
        // Inject Tailwind CSS import
        ctor.elementStyles?.unshift?.(
          unsafeCSS(`@import url("${route.cssPath}");`)
        );

        // Mark component that was already injected
        ctor.__tailwind = true;
      }

      return super.renderShadow(_renderInfo);
    }
  };
