import { PageComponent } from '@limette/core';
import { html } from 'lit';
import { TestCounter } from '../islands/counter.ts';
import { ShorthandClientOnly } from '../islands/client-only.ts';
import { TestStatus } from '../islands/status.ts';
import '../styles/home.css';

export default class HomePage extends PageComponent {
  static override islands = {
    'test-counter': {
      component: TestCounter,
      ssr: true,
    },
    'test-status': {
      component: TestStatus,
      ssr: true,
    },
    'test-client-only': ShorthandClientOnly,
  };

  override render() {
    return html`
      <main>
        <h1>Generated home</h1>
        <test-counter></test-counter>
        <test-status></test-status>
        <test-client-only></test-client-only>
      </main>
    `;
  }
}
