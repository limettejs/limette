// import { html } from "@lit-labs/ssr";
// import { ScopedElementsMixin } from "@open-wc/scoped-elements/html-element.js";
import "../islands/greeter.js";
import { LitElement, html } from "lit";

export class Home extends LitElement {
  // static scopedElements = {
  //   "simple-greeter": Greeter,
  // };

  render() {
    console.log("registry", this.registry);
    return html`
      <h1>Home</h1>
      <p>SSR content</p>
      <is-land><simple-greeter name="Marius"></simple-greeter></is-land>
    `;
  }
}
