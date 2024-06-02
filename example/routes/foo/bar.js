import { LitElement, html } from "lit";
import "../../islands/bar.js";

export default class Home extends LitElement {
  render() {
    return html`
      <h1>Foo/Bar</h1>
      <p>SSR content</p>
      <is-land><island-bar></island-bar></is-land>
      <a href="/">To home</a>
    `;
  }
}
