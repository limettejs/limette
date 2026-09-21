import { PageComponent } from '@limette/core';
import { html } from 'lit';

export default class NewUserPage extends PageComponent {
  override render() {
    return html`
      <main>
        <h1>New user</h1>
      </main>
    `;
  }
}
