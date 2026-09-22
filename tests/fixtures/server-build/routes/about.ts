import { PageComponent } from 'limette';
import { html } from 'lit';
import '../styles/about.css';

export default class AboutPage extends PageComponent {
  override render() {
    return html`
      <main>
        <h1>Generated about</h1>
      </main>
    `;
  }
}
