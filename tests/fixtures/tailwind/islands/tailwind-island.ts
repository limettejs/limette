import { html, LitElement } from 'lit';

export class TailwindIsland extends LitElement {
  override render() {
    return html`<section class="outline-[7px]">Island utility</section>`;
  }
}

if (!customElements.get('tailwind-island')) {
  customElements.define('tailwind-island', TailwindIsland);
}
