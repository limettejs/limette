import { PageComponent } from 'limette';
import { html } from 'lit';
import { DescriptorClientOnly, ShorthandClientOnly } from '../islands/client-only.ts';

export default class CsrIslandsPage extends PageComponent {
  static override islands = {
    'shorthand-client-only': ShorthandClientOnly,
    'descriptor-client-only': {
      component: DescriptorClientOnly,
    },
  };

  override render() {
    return html`
      <shorthand-client-only ssr></shorthand-client-only>
      <descriptor-client-only></descriptor-client-only>
    `;
  }
}
