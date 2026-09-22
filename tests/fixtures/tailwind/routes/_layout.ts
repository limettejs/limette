import { LayoutComponent } from 'limette';
import { html } from 'lit';

export default class TailwindLayout extends LayoutComponent {
  override render() {
    return html`<section class="min-h-[41px]">${this.outlet}</section>`;
  }
}
