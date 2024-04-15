import { LitElement } from "lit";
import { html } from "@lit-labs/ssr";
import "../islands/child-island.js";

export default class Params extends LitElement {
  render() {
    console.log("ctx in render", this.ctx);
    return html`
      <h1>Params</h1>
      <p>SSR content with params: ${JSON.stringify(this.ctx)}</p>
      <is-land><child-island></child-island></is-land>
      <a href="/">To home</a>
    `;
  }
}
