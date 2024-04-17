// Islands architecture element that has event listeners and hydrates an element
// upon those listeners being triggered. e.g.
// <is-land on="pointerenter,click,idle" import="./my-component.js"><my-component></my-component></is-land>

import { LitElement, html, css } from "lit";

export class Island extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }
  `;

  connectedCallback() {
    // make sure this element is never affected by defer-hydration
    this.removeAttribute("defer-hydration");
    super.connectedCallback();
  }

  async update(changed) {
    await this.#setContext();
    this.#removeDefer();
    super.update(changed);
  }

  async #setContext() {
    const ctx = JSON.parse(document.querySelector("#_lmt_ctx")?.textContent);
    console.log("set context", ctx);

    const slotEl = this.shadowRoot.querySelector("slot");
    if (!slotEl) return;
    const els = slotEl.assignedElements({ flatten: true });
    // console.log(els);
    for (const el of els) {
      console.log(el.tagName, customElements.get(el.tagName));
      if (el?.requestUpdate) {
        // console.log("an web comp found", el);
        el.ctx = ctx;
      }
    }
  }

  // removes defer on all children that are not inside another <is-land>
  #removeDefer() {
    const slotEl = this.shadowRoot.querySelector("slot");
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
      const deferredChildren = el.querySelectorAll("[defer-hydration]");

      // remove defer hydration from all children of slotted items
      for (const child of deferredChildren) {
        // ignore any that are in islands e.g.
        // <is-land><div><is-land><my-component defer-hydration></my-component></is-land></div></is-land>
        if (child.closest("is-land") !== this) {
          continue;
        }

        child.removeAttribute("defer-hydration");
      }
    }
  }

  render() {
    // ssr
    return html`<slot></slot>`;
  }
}

customElements.define("is-land", Island);
