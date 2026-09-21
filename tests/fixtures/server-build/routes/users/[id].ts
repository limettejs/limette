import { PageComponent } from '@limette/core';
import { html } from 'lit';

export default class UserPage extends PageComponent {
  override head() {
    return html`
      <title>User profile</title>
      <meta name="description" content="Profile for ${this.ctx.params.id}" />
    `;
  }

  override render() {
    return html`
      <main>
        <h1>User ${this.ctx.params.id}</h1>
      </main>
    `;
  }
}
