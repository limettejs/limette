import { LitElement, html } from "lit";
// import { html } from "@lit-labs/ssr";
import "../islands/child-island.js";

export default class Params extends LitElement {
  constructor() {
    super();
    console.log("route[constructor][ctx]:", this.ctx);
    this.foo = { a: "b" };
  }

  willUpdate() {
    console.log("route[willUpdate][ctx]:", this.ctx);
  }

  render() {
    console.log("route[render][ctx]", this.ctx);
    return html`
      <h1>Params</h1>
      <p>SSR content with params: ${JSON.stringify(this.ctx)}</p>
      <is-land
        ><child-island .cctx=${this.ctx} .foo=${this.foo}></child-island
      ></is-land>
      <a href="/">To home</a>
    `;
  }
}
