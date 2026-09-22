import { html, LitElement } from 'lit';
import './counter.css';
import './shared.css';

export class TestCounter extends LitElement {
  static override properties = {
    count: { type: Number },
  };

  count = 0;

  private changeCount(change: number) {
    this.count += change;
    this.requestUpdate();
  }

  override render() {
    return html`
      <button type="button" @click=${() => this.changeCount(-1)}>-</button>
      <span>Count: ${this.count}</span>
      <button type="button" @click=${() => this.changeCount(1)}>+</button>
    `;
  }
}
