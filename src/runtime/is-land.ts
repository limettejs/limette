// Islands architecture element that has event listeners and hydrates an element
// upon those listeners being triggered. e.g.
// <is-land on="pointerenter,click,idle" import="./my-component.js"><my-component></my-component></is-land>

// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import { LitElement, html, css } from "lit";
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { TemplateResult, CSSResultOrNative } from "lit";

function hasCtx(el: Element): el is Element & { ctx: unknown } {
  return "ctx" in el;
}

export class Island extends LitElement {
  static styles: CSSResultOrNative = css`
    :host {
      display: contents;
    }
  `;

  connectedCallback() {
    // make sure this element is never affected by defer-hydration
    (this as unknown as HTMLElement).removeAttribute("defer-hydration");
    super.connectedCallback();
  }

  async update(changed: Map<string, unknown>) {
    // await this.#setContext();
    this.#removeDefer();
    super.update(changed);
  }

  async #setContext() {
    const ctx = JSON.parse(
      document.querySelector("#_lmt_ctx")?.textContent ?? "{}"
    );

    const slotEl = (this as unknown as HTMLElement).shadowRoot?.querySelector?.(
      "slot"
    );
    if (!slotEl) return;
    const els = slotEl.assignedElements({ flatten: true });

    for (const el of els) {
      if ((el as LitElement)?.requestUpdate && hasCtx(el)) {
        el.ctx = ctx;
      }
    }
  }

  // removes defer on all children that are not inside another <is-land>
  #removeDefer() {
    const shadowRoot = (this as unknown as HTMLElement).shadowRoot;
    if (!shadowRoot) return;

    const slotEl = shadowRoot.querySelector("slot");
    if (!slotEl) return;
    const els = slotEl.assignedElements({ flatten: true });

    // remove defer-hydration from slotted items e.g.
    // <is-land><my-component defer-hydration></my-component></is-land>
    for (const el of els) {
      el.removeAttribute("defer-hydration");

      // do not traverse children if an island. e.g.
      // <is-land><is-land><my-component defer-hydration></my-component></is-land></is-land>
      if (el.tagName === "IS-LAND") {
        continue;
      }

      // get all children of the slotted itms that are deferred
      // e.g. <is-land><div><my-component defer-hydration></my-component></div></is-land>
      const deferredChildren = Array.from(
        el.querySelectorAll("[defer-hydration]")
      );

      // remove defer hydration from all children of slotted items
      for (const child of deferredChildren) {
        // ignore any that are in islands e.g.
        // <is-land><div><is-land><my-component defer-hydration></my-component></is-land></div></is-land>
        if (child.closest("is-land") !== (this as unknown as HTMLElement)) {
          continue;
        }

        child.removeAttribute("defer-hydration");
      }
    }
  }

  render(): TemplateResult {
    // ssr
    return html`<slot></slot>`;
  }
}

customElements.define("is-land", Island as unknown as CustomElementConstructor);
