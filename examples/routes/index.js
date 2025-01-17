import { LitElement, html } from "lit";
import "../islands/foo.js";

export default class Home extends LitElement {
  render() {
    return html`
      <section class="p-6">
        <h1>Home</h1>
        <p class="text-2xl font-bold text-blue-600/100">SSR content</p>
        <island-foo name="Iris"></island-foo>

        <section>
          <a href="/foo/bar">To foo/bar</a> | <a href="/foo-123">To params</a> |
          <a href="/no-js">To no js</a>
        </section>
      </section>
    `;
  }
}
