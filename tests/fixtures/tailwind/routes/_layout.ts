import { LayoutComponent } from '@limette/core';
import { html } from 'lit';

export default class TailwindLayout extends LayoutComponent {
  override render() {
    return html`<section class="min-h-[41px]">${this.child}</section>`;
  }
}
