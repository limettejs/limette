import { LayoutComponent } from 'limette';
import { html } from 'lit';
import '../styles/layout.css';
import '../shared/theme.ts';

export default class TestLayout extends LayoutComponent {
  override head() {
    return html`<title>Generated layout</title>`;
  }

  override render() {
    return html`<div data-server-layout>${this.outlet}</div>`;
  }
}
