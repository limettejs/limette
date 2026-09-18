import { AppComponent } from '@limette/core';
import { html } from 'lit';
import '../styles/app.css';

export default class TestApp extends AppComponent {
  override render() {
    return html`
      <!DOCTYPE html>
      <html>
        <head>
                ${this.assets.styles}
              </head>
        <body>
                ${this.page} ${this.assets.scripts}
              </body>
      </html>
    `;
  }
}
