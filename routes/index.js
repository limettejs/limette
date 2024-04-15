import { LitElement, html } from "lit";
import "../islands/greeter.js";

export default class Home extends LitElement {
  render() {
    return html`
      <h1>Home</h1>
      <p>SSR content</p>
      <is-land><simple-greeter name="Iris"></simple-greeter></is-land>
      <a href="/foo/bar">To foo/bar</a> | <a href="/foo-123">To params</a> |
      <a href="/no-js">To no js</a>
    `;
  }
}

console.log("parent check", LitElement.isPrototypeOf(Home));
