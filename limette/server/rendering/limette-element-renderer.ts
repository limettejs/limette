import { LitElementRenderer } from "@lit-labs/ssr/lib/lit-element-renderer.js";
import type { RenderInfo, RenderResult } from "@lit-labs/ssr";

export class LimetteElementRenderer extends LitElementRenderer {
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
    return super.renderShadow(_renderInfo);
  }
}
