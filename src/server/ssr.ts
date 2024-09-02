import { html, unsafeHTML, render, collectResult } from "../deps.ts";
import type { RouterContext } from "../deps.ts";
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement, TemplateResult } from "lit";
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { DirectiveResult } from "lit/directives/unsafe-html.js";
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { UnsafeHTMLDirective } from "lit/directives/unsafe-html.js";
import type { BuildRoute } from "../dev/build.ts";
import { LimetteElementRenderer } from "./rendering/limette-element-renderer.ts";
import type { ComponentContext } from "./router.ts";

import "../runtime/is-land.ts"; // should use limette?

type Params = {
  [key: string]: string;
};

export type AppTemplateOptions = {
  css: DirectiveResult<UnsafeHTMLDirective> | string;
  js: string[] | TemplateResult[] | DirectiveResult<UnsafeHTMLDirective>[];
  component: DirectiveResult<UnsafeHTMLDirective>;
};

// Define the interface for the mixin
export declare class ComponentCtxMixinInterface {
  get ctx(): string;
}

export declare class AppTemplateInterface {
  prototype: {
    render(app: AppTemplateOptions): TemplateResult;
  };
}

function registerComponent(module: CustomElementConstructor, tagName: string) {
  if (!customElements.get(`lmt-route-${tagName}`)) {
    customElements.define(`lmt-route-${tagName}`, module);
  } else {
    // check if it is the same class
  }

  return `<lmt-route-${tagName}></lmt-route-${tagName}>`;
}

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

export function bootstrapContent(
  AppTemplate: AppTemplateInterface,
  route: BuildRoute,
  componentContext: ComponentContext
) {
  const componentModule = route.routeModule;

  const componentClass = ComponentCtxMixin(
    componentModule?.default as typeof LitElement,
    componentContext
  );
  const component = registerComponent(
    componentClass as unknown as CustomElementConstructor,
    route.tagName
  );

  const ctxStr = `<script type="text/json" id="_lmt_ctx">${JSON.stringify(
    componentContext
  )}</script>`;

  const appTemplateOptions: AppTemplateOptions = {
    css: route.cssAssetPath
      ? unsafeHTML(`<link rel="stylesheet" href="${route.cssAssetPath}" />`)
      : ``,
    js: [
      route.jsAssetPath ? unsafeHTML(ctxStr) : ``,
      route.jsAssetPath
        ? html`<script type="module" src="${route.jsAssetPath}"></script>`
        : ``,
    ],
    component: unsafeHTML(component),
  };

  return AppTemplate.prototype.render(appTemplateOptions);
}

export async function renderContent(
  AppTemplate: AppTemplateInterface,
  route: BuildRoute,
  routerContext: RouterContext<typeof route.path>,
  data?: ComponentContext["data"]
) {
  const componentContext = { params: routerContext.params, data };

  const result = render(
    await bootstrapContent(
      AppTemplate as AppTemplateInterface,
      route,
      componentContext
    ),
    {
      elementRenderers: [LimetteElementRenderer(route)],
    }
  );
  const content = await collectResult(result);
  return content;
}
