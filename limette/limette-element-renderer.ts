import { ElementRenderer } from "@lit-labs/ssr";
import { LitElementRenderer } from "@lit-labs/ssr/lib/lit-element-renderer.js";

import type { RenderInfo, RenderResult } from "@lit-labs/ssr";

export const LimetteElementRendererMixin = (ctx) =>
  class LimetteElementRenderer extends LitElementRenderer {
    constructor(...args) {
      super(...args);

      Object.defineProperty(this.element, "ctx", {
        get: () => {
          return this.element._ctx;
        },
      });

      this.setProperty("_ctx", ctx);
    }
    /**
     * Render the element's shadow root children.
     *
     * If `renderShadow()` returns undefined, no declarative shadow root is
     * emitted.
     */
    renderShadow(_renderInfo: RenderInfo): RenderResult | undefined {
      //   console.log("renderShadow", _renderInfo.customElementRendered);
      if (this.element.hasAttribute("no-ssr")) {
        return undefined;
      }
      return super.renderShadow(_renderInfo);
    }
  };
