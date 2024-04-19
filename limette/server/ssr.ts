import { RouterContext } from "@oak/oak/router";

import { html } from "@lit-labs/ssr";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
// import "./patch-custom-elements.ts";
import "$limette/runtime/is-land.ts";

const ComponentCtxMixin = (base, ctx) =>
  class extends base {
    constructor() {
      super();
      let ctxSerialized;
      try {
        ctxSerialized = JSON.stringify(ctx);
      } catch {
        // do nothing
      }
      this._ctx = ctxSerialized;
    }

    get ctx() {
      let ctxDeserialized;
      try {
        ctxDeserialized = JSON.parse(this._ctx);
      } catch {
        // do nothing
      }
      console.log("get ctx", this._ctx);
      // return JSON.parse(this._ctx);
      return ctxDeserialized;
    }
  };

export async function bootstrapContent(route, ctx: RouterContext) {
  console.log("router context", ctx.params);

  const compoentModule = await import(route.filePath);
  const componentClass = ComponentCtxMixin(compoentModule.default, {
    params: ctx.params,
  });
  const component = registerComponent(componentClass, route.tagName);

  const ctxStr = `<script type="text/json" id="_lmt_ctx">${JSON.stringify({
    params: ctx.params,
  })}</script>`;

  return html` <html>
    <head>
      <title>Limette</title>
    </head>
    <body>
      ${unsafeHTML(component)} ${route.bundlePath ? unsafeHTML(ctxStr) : ``}
      ${route.bundlePath
        ? html`<script type="module" src="${route.bundlePath}"></script>`
        : ``}
    </body>
  </html>`;
}

function registerComponent(module, tagName) {
  if (!customElements.get(`lmt-route-${tagName}`)) {
    customElements.define(`lmt-route-${tagName}`, module);
  } else {
    // check if it is the same class
  }

  return `<lmt-route-${tagName}></lmt-route-${tagName}>`;
}
