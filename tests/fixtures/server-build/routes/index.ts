import { PageComponent } from '@limette/core';
import { html } from 'lit';
import { TestCounter } from '../islands/counter.ts';
import { TestStatus } from '../islands/status.ts';
import '../styles/home.css';

export default class HomePage extends PageComponent {
  static override islands = {
    'test-counter': TestCounter,
    'test-status': TestStatus,
  };

  override render() {
    return html`
      <main>
        <h1>Generated home</h1>
        <test-counter></test-counter>
        <test-status ssr></test-status>
      </main>
    `;
  }
}
