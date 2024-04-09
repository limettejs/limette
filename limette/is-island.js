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
    this.#removeDefer();
  }

  // removes defer on all children that are not inside another <is-land>
  #removeDefer() {
    const slotEl = this.shadowRoot.querySelector("slot");
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
    return html`<slot></slot>`;
  }
}

customElements.define("is-land", Island);
