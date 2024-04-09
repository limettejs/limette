import "../islands/greeter.js";
import { LitElement, html } from "lit";

export default class Home extends LitElement {
  render() {
    return html`
      <h1>Home</h1>
      <p>SSR content</p>
      <is-land><simple-greeter name="Iris"></simple-greeter></is-land>
    `;
  }
}
