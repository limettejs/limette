/**
 * Patch lit-element-hydrate-support.js to remove defer-hydration attribute
 * when skip-attribute is present.
 */

import type { RenderOptions } from "lit";

interface PatchableLitElement extends HTMLElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-misused-new
  new (...args: any[]): PatchableLitElement;
  enableUpdating(requestedUpdate?: boolean): void;
  createRenderRoot(): Element | ShadowRoot;
  renderRoot: HTMLElement | DocumentFragment;
  render(): unknown;
  renderOptions: RenderOptions;
  _$needsHydration: boolean;
}

// @ts-expect-error: This is a builtin property from Lit
const litElementHydrateSupport = globalThis.litElementHydrateSupport;
if (litElementHydrateSupport) {
  // @ts-expect-error: This is a builtin property from Lit
  globalThis.litElementHydrateSupport = ({
    LitElement,
  }: {
    LitElement: PatchableLitElement;
  }) => {
    // Apply the original support for hydration
    litElementHydrateSupport({ LitElement });

    // Override `connectedCallback` to capture whether we need hydration, and
    // defer `super.connectedCallback()` if the 'defer-hydration' attribute is set
    const connectedCallback = LitElement.prototype.connectedCallback;
    LitElement.prototype.connectedCallback = function (
      this: PatchableLitElement
    ) {
      // Hydrate component when is attached to DOM
      this.removeAttribute("defer-hydration");

      connectedCallback.call(this);
    };
  };
}
