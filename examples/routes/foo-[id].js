import { PageComponent } from '@limette/core';
import { html } from 'lit';
import { IslandBar } from '../islands/bar.js';

export default class Params extends PageComponent {
  static islands = {
    'island-bar': IslandBar,
  };

  constructor() {
    super();
    this.foo = { a: 'b' };
  }

  render() {
    return html`
      <h1>Params</h1>
      <p>SSR content with params: ${JSON.stringify(this.ctx)}</p>
      <island-bar .ctx=${this.ctx} .foo=${this.foo}></island-bar>
      <a href="/">To home</a>
    `;
  }
}
