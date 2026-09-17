import { html, LitElement } from 'lit';
import './counter.css';

export class TestCounter extends LitElement {
  override render() {
    return html`<button>Count</button>`;
  }
}

if (!customElements.get('test-counter')) {
  customElements.define('test-counter', TestCounter);
}
