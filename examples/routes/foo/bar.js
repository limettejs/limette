import { PageComponent } from '@limette/core';
import { html } from 'lit';
import { IslandBar } from '../../islands/bar.js';

export default class Home extends PageComponent {
  static islands = {
    'island-bar': IslandBar,
  };

  render() {
    return html`
      <h1>Foo/Bar</h1>
      <p>SSR content</p>
      <island-bar></island-bar>
      <a href="/">To home</a>
    `;
  }
}
