import { LayoutComponent } from '@limette/core';
import { html } from 'lit';
import '../styles/layout.css';
import '../shared/theme.ts';

export default class TestLayout extends LayoutComponent {
  override render() {
    return html`<div data-server-layout>${this.child}</div>`;
  }
}
