import { AppComponent } from '@limette/core';
import { html } from 'lit';

export default class App extends AppComponent {
  render() {
    return html`<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Limette</title>
          ${this.assets.styles}
        </head>
        <body>
          ${this.page}
          ${this.assets.scripts}
        </body>
      </html>`;
  }
}
