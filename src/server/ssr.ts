import { html, unsafeHTML } from "../deps.ts";
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from "lit";
import type { BuildRoute } from "../dev/build.ts";

import "../runtime/is-land.ts"; // should use limette?

type Params = {
  [key: string]: string;
};

type Constructor<T = {}> = new (...args: any[]) => T;

// Define the interface for the mixin
export declare class ComponentCtxMixinInterface {
  get ctx(): string;
}

// const ComponentCtxMixin = <T extends Constructor<typeof LitElement>>(
const ComponentCtxMixin = (
  base: typeof LitElement,
  ctxArg: {
    params: Params;
  }
) => {
  class ComponentCtxClass extends base {
    _ctx: string = "";

    constructor() {
      super();
      let ctxSerialized;
      try {
        ctxSerialized = JSON.stringify(ctxArg);
      } catch {
        // do nothing
      }
      this._ctx = ctxSerialized ?? "";
    }

    get ctx() {
      let ctxDeserialized;
      try {
        ctxDeserialized = JSON.parse(this._ctx);
      } catch {
        // do nothing
      }

      // return JSON.parse(this._ctx);
      return ctxDeserialized;
    }
  }
  // return ComponentCtxClass as Constructor<ComponentCtxMixinInterface> & T;
  return ComponentCtxClass;
};

export async function bootstrapContent(
  route: BuildRoute,
  ctx: {
    params: Params;
  }
) {
  console.log("import():", route.filePath);
  const componentModule = await import(route.filePath);

  const componentClass = ComponentCtxMixin(componentModule.default, {
    params: ctx.params,
  });
  const component = registerComponent(
    componentClass as unknown as CustomElementConstructor,
    route.tagName
  );

  const ctxStr = `<script type="text/json" id="_lmt_ctx">${JSON.stringify({
    params: ctx.params,
  })}</script>`;

  return html` <html>
    <head>
      <title>Limette</title>
      ${route.cssPath
        ? html`<link rel="stylesheet" href="${route.cssPath}" />`
        : ``}
    </head>
    <body>
      ${unsafeHTML(component)}
      <!-- -->
      ${route.bundlePath ? unsafeHTML(ctxStr) : ``}
      ${route.bundlePath
        ? html`<script type="module" src="${route.bundlePath}"></script>`
        : ``}
    </body>
  </html>`;
}

function registerComponent(module: CustomElementConstructor, tagName: string) {
  if (!customElements.get(`lmt-route-${tagName}`)) {
    customElements.define(`lmt-route-${tagName}`, module);
  } else {
    // check if it is the same class
  }

  return `<lmt-route-${tagName}></lmt-route-${tagName}>`;
}
