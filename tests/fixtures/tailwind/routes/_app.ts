import { AppComponent } from 'limette';
import { html } from 'lit';

export default class TailwindApp extends AppComponent {
  override render() {
    return html`
      <!DOCTYPE html>
      <html>
        <head>${this.assets.styles}</head>
        <body class="bg-[#abcdef]">
                ${this.outlet}${this.assets.scripts}
              </body>
      </html>
    `;
  }
}
