import { html, LitElement } from 'lit';
import './shared.css';
import './status.css';

export class TestStatus extends LitElement {
  override render() {
    return html`<p>Status</p>`;
  }
}

if (!customElements.get('test-status')) {
  customElements.define('test-status', TestStatus);
}
