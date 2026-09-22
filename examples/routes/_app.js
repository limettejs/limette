import { AppComponent } from 'limette';
import { html } from 'lit';

export default class App extends AppComponent {
  head() {
    return html`
      <title>Limette</title>
      <meta name="description" content="A Limette application" />
    `;
  }

  render() {
    return html`
      <!DOCTYPE html>
      <html>
        <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                ${this.assets.styles}
              </head>
        <body>
                ${this.outlet}
                ${this.assets.scripts}
              </body>
      </html>
    `;
  }
}
