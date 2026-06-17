import { PageComponent } from '@limette/core';
import { html } from 'lit';

export default class NoJS extends PageComponent {
  render() {
    return html`
      <h1>No JS</h1>
      <p>SSR content but no JS loaded</p>
      <a href="/">To home</a>
    `;
  }
}
