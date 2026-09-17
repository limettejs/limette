import { LayoutComponent } from '@limette/core';
import { html } from 'lit';

export default class TestLayout extends LayoutComponent {
  override render() {
    return html`<div data-server-layout>${this.child}</div>`;
  }
}
