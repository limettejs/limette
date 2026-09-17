import { PageComponent } from '@limette/core';
import { html } from 'lit';

export default class UserPage extends PageComponent {
  override render() {
    return html`
      <main>
        <h1>User ${this.ctx.params.id}</h1>
      </main>
    `;
  }
}
