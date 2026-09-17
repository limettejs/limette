import { PageComponent } from '@limette/core';
import { html } from 'lit';
import { TestCounter } from '../islands/counter.ts';

export default class HomePage extends PageComponent {
  static override islands = {
    'test-counter': TestCounter,
  };

  override render() {
    return html`
      <main>
        <h1>Generated home</h1>
        <test-counter></test-counter>
      </main>
    `;
  }
}
