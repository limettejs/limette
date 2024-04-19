import { LitElement, html } from "lit";
import "../../islands/child-island.js";

export default class Home extends LitElement {
  render() {
    return html`
      <h1>Foo/Bar</h1>
      <p>SSR content</p>
      <is-land><child-island></child-island></is-land>
      <a href="/">To home</a>
    `;
  }
}
