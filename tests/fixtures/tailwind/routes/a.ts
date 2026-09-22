import { PageComponent } from 'limette';
import { html } from 'lit';
import { TailwindIsland } from '../islands/tailwind-island.ts';
import { sharedClass } from '../shared/classes.ts';

export default class RouteA extends PageComponent {
  static override islands = {
    'tailwind-island': {
      component: TailwindIsland,
      ssr: true,
    },
  };

  override render() {
    return html`
      <main class="p-[13px] text-limette-proof ${sharedClass}">Route A</main>
      <tailwind-island></tailwind-island>
    `;
  }
}
