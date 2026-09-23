/**
 * Limette integration for Lit's official hydration support.
 *
 * Limette does not hydrate the surrounding route light DOM, so top-level
 * islands cannot wait for a parent Lit hydration pass to remove
 * `defer-hydration`. CSR-only islands also carry a server-created style shadow
 * root which must be client-rendered instead of hydrated.
 */

interface PatchableLitElement extends HTMLElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-misused-new
  new (...args: any[]): PatchableLitElement;
  createRenderRoot(): Element | ShadowRoot;
}

type LitElementHydrateSupport = (options: {
  LitElement: PatchableLitElement;
}) => void;

const globalWithHydration = globalThis as typeof globalThis & {
  litElementHydrateSupport?: LitElementHydrateSupport;
};
const officialHydrateSupport = globalWithHydration.litElementHydrateSupport;

if (officialHydrateSupport) {
  globalWithHydration.litElementHydrateSupport = ({ LitElement }) => {
    const clientRenderRoot = LitElement.prototype.createRenderRoot;
    officialHydrateSupport({ LitElement });

    const hydrateRenderRoot = LitElement.prototype.createRenderRoot;
    LitElement.prototype.createRenderRoot = function () {
      if (this.hasAttribute('skip-hydration')) {
        this.removeAttribute('skip-hydration');
        return clientRenderRoot.call(this);
      }
      return hydrateRenderRoot.call(this);
    };

    const connectedCallback = LitElement.prototype.connectedCallback;
    LitElement.prototype.connectedCallback = function () {
      if (this.hasAttribute('defer-hydration')) {
        // Lit's official attribute callback enables the element when this is
        // removed. Returning avoids invoking connectedCallback a second time.
        this.removeAttribute('defer-hydration');
        return;
      }
      connectedCallback.call(this);
    };
  };
}
