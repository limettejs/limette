import { PageComponent } from '@limette/core';
import { html } from 'lit';

export default class AboutPage extends PageComponent {
  override render() {
    return html`
      <main>
        <h1>Generated about</h1>
      </main>
    `;
  }
}
