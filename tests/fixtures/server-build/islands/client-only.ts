import { html, LitElement } from 'lit';
import './client-only.css';

const executionState = globalThis as typeof globalThis & {
  __limetteClientOnlyRenders?: number;
};

abstract class ClientOnlyBase extends LitElement {
  static override properties = {
    count: { type: Number },
  };

  count = 0;

  private changeCount(change: number) {
    this.count += change;
    this.requestUpdate();
  }

  override render() {
    executionState.__limetteClientOnlyRenders =
      (executionState.__limetteClientOnlyRenders ?? 0) + 1;
    return html`
      <button type="button" @click=${() => this.changeCount(-1)}>-</button>
      <span>Client count: ${this.count}</span>
      <button type="button" @click=${() => this.changeCount(1)}>+</button>
    `;
  }
}

export class ShorthandClientOnly extends ClientOnlyBase {}
export class DescriptorClientOnly extends ClientOnlyBase {}
