import { LitElement, html } from "lit";
import "../../islands/bar.js";

export default class Home extends LitElement {
  render() {
    return html`
      <h1>Foo/Bar</h1>
      <p>SSR content</p>
      <island-bar></island-bar>
      <a href="/">To home</a>
    `;
  }
}
