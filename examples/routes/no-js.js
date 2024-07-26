import { LitElement, html } from "lit";

export default class NoJS extends LitElement {
  render() {
    return html`
      <h1>No JS</h1>
      <p>SSR content but no JS loaded</p>
      <a href="/">To home</a>
    `;
  }
}
