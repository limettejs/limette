import { RouterContext } from "jsr:@oak/oak/router";

import { html } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import "./is-land.ts";

const ComponentCtxMixin = (base, ctx) =>
  class extends base {
    constructor() {
      super();
      this.ctx = ctx;
    }
  };

export async function bootstrapContent(route, ctx: RouterContext) {
  console.log("router context", ctx.params);
  const compoentModule = await import(route.filePath);
  const componentClass = ComponentCtxMixin(compoentModule.default, {
    params: ctx.params,
  });
  const component = registerComponent(componentClass, route.tagName);

  return html` <html>
    <head>
      <title>Limette</title>
    </head>
    <body>
      ${unsafeHTML(component)}
      ${route.bundlePath
        ? html`<script type="module" src="${route.bundlePath}"></script>`
        : ``}
    </body>
  </html>`;
}

function registerComponent(module, tagName) {
  if (!customElements.get(`lmt-${tagName}`)) {
    customElements.define(`lmt-${tagName}`, module);
  } else {
    // check if it is the same class
  }

  return `<lmt-${tagName}></lmt-${tagName}>`;
}
