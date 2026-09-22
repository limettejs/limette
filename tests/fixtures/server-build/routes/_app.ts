import { AppComponent } from 'limette';
import { html } from 'lit';
import '../styles/app.css';

export default class TestApp extends AppComponent {
  override head() {
    return html`
      <title>Generated app</title>
      <meta name="description" content="Generated app description" />
    `;
  }

  override render() {
    return html`
      <!DOCTYPE html>
      <html>
        <head>
                ${this.assets.styles}
              </head>
        <body>
                ${this.outlet} ${this.assets.scripts}
              </body>
      </html>
    `;
  }
}
