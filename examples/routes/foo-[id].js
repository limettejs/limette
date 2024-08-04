import { LitElement, html } from "lit";
// import { html } from "@lit-labs/ssr";
import "../islands/bar.js";

export default class Params extends LitElement {
  constructor() {
    super();
    this.foo = { a: "b" };
  }

  render() {
    return html`
      <h1>Params</h1>
      <p>SSR content with params: ${JSON.stringify(this.ctx)}</p>
      <is-land
        ><island-bar .ctx=${this.ctx} .foo=${this.foo}></island-bar
      ></is-land>
      <a href="/">To home</a>
    `;
  }
}
