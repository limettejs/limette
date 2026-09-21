import { PageComponent } from '@limette/core';
import { html } from 'lit';
import { TestCounter } from '../islands/counter.ts';

export default class SharedIslandPage extends PageComponent {
  static override islands = {
    'test-counter': {
      component: TestCounter,
      ssr: true,
    },
  };

  override render() {
    return html`<test-counter></test-counter>`;
  }
}
