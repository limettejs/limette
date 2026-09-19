import { PageComponent } from '@limette/core';
import { html } from 'lit';

export default class RouteB extends PageComponent {
  override render() {
    return html`<main class="m-[17px]">Route B</main>`;
  }
}
