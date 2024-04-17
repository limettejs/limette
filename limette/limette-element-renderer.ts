import { ElementRenderer } from "@lit-labs/ssr";
import { LitElementRenderer } from "@lit-labs/ssr/lib/lit-element-renderer.js";

import type { RenderInfo, RenderResult } from "@lit-labs/ssr";

export const LimetteElementRendererMixin = (ctx) =>
  class LimetteElementRenderer extends LitElementRenderer {
    constructor(...args) {
      super(...args, ctx);

      console.log("LimetteElementRenderer constructor", args);

      //   Object.defineProperty(this.element, "ctx", {
      //     get: () => {
      //       return this.element._ctx;
      //     },
      //   });
      //   console.log("limetteElRen", this.element);

      this.setProperty("ctx", ctx);
    }
    /**
     * Handles setting a property on the element.
     *
     * The default implementation sets the property on the renderer's element
     * instance.
     *
     * @param name Name of the property
     * @param value Value of the property
     */
    setProperty(name: string, value: unknown) {
      console.log("setProperty", name, value);
      super.setProperty(name, value);
    }

    setAttribute(name: string, value: string): void {
      console.log("setAttribute", name, value);
      super.setAttribute(name, value);
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
