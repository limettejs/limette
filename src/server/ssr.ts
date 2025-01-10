import { html, unsafeHTML, render, collectResult, DOMParser } from "../deps.ts";
import type { Context } from "../router/app.ts";
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

import { installWindowOnGlobal } from "../deps.ts";
import type { LayoutModule } from "../types.ts";

installWindowOnGlobal();
// Set window object, because the shim doesn't do it
// @ts-ignore some components use the `window` reference for registration process
globalThis.window = globalThis;

type Params = {
  [key: string]: string;
};

export type AppRootOptions = {
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
    render(app: AppRootOptions): TemplateResult;
  };
}

function registerRouteComponent(
  ComponentClass: CustomElementConstructor,
  tagName: string
) {
  if (!customElements.get(`lmt-route-${tagName}`)) {
    customElements.define(`lmt-route-${tagName}`, ComponentClass);
  } else {
    // check if it is the same class
  }

  return `<lmt-route-${tagName}></lmt-route-${tagName}>`;
}

function processHeadAndShadowRoots(htmlString: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    htmlString,
    "text/html"
  ) as unknown as Document;

  const uniqueElements = new Map(); // Track the last unique element by key
  let lastTitleElement = null; // Track the last <title> element found

  // Recursive function to process <lmt-head> elements in the main DOM and nested declarative shadow DOMs
  function processLmtHeadElements(root: Document | DocumentFragment) {
    // Find and process all <lmt-head> elements within the current root
    const lmtHeadElements = Array.from(root.querySelectorAll("lmt-head"));

    lmtHeadElements.forEach((wrapper) => {
      Array.from(wrapper.children).forEach((child) => {
        if (child.tagName === "TITLE") {
          // Keep only the last <title> element found
          lastTitleElement = child;
        } else {
          const key = child.getAttribute("key");
          if (key) {
            uniqueElements.set(key, child); // Only keep the latest element with each key
          } else {
            uniqueElements.set(Symbol(), child); // Treat children without a key as unique
          }
        }
      });

      // Remove the <lmt-head> wrapper from the DOM
      wrapper.remove();
    });

    // Recursively process nested declarative shadow DOMs within this root
    (
      root.querySelectorAll(
        "template[shadowroot]"
      ) as unknown as HTMLTemplateElement[]
    ).forEach((template) => {
      processLmtHeadElements(template.content); // Process the content of each declarative shadow DOM template
    });
  }

  function processLmtShadowRoots(node: Document | DocumentFragment) {
    // Select all <template> elements in the current node
    const templates = node.querySelectorAll("template");

    templates.forEach((template) => {
      // Only process templates with shadowroot="disabled"
      if (template?.getAttribute("shadowroot") === "disabled") {
        // Recursively process the content of this template
        processLmtShadowRoots(template.content);

        // Replace the <template> with its content
        const parent = template.parentNode;
        const content = template.content;
        parent?.replaceChild(content, template);
      }
      // Skip templates with other shadowroot values (if any)
    });
  }

  // Process shadow roots
  processLmtShadowRoots(doc);

  // Start by processing the main document
  processLmtHeadElements(doc);

  // Remove redundant elements in <head> that match keys in uniqueElements
  Array.from(doc.head.querySelectorAll("[key]")).forEach((headElement) => {
    const key = headElement.getAttribute("key");
    if (key && uniqueElements.has(key)) {
      headElement.remove();
    }
  });

  // Remove any existing <title> elements in <head> if we have a new one
  if (lastTitleElement) {
    Array.from(doc.head.querySelectorAll("title")).forEach((title) =>
      title.remove()
    );
    // Append the last <title> element found to <head>
    doc.head.appendChild(lastTitleElement);
  }

  // Append the deduplicated elements to <head>
  uniqueElements.forEach((element) => {
    doc.head.appendChild(element);
  });

  return doc.documentElement.outerHTML;
}

const ComponentCtxMixin = (base: typeof LitElement) => {
  class ComponentCtxClass extends base {
    __ctx: ComponentContext = { params: {}, data: undefined };

    get ctx() {
      return this.__ctx;
    }
  }
  // return ComponentCtxClass as Constructor<ComponentCtxMixinInterface> & T;
  return ComponentCtxClass;
};

export async function bootstrapContent(
  AppRoot: AppTemplateInterface,
  route: BuildRoute,
  componentContext: ComponentContext
) {
  const routeModule = route.routeModule;
  const routeConfig = routeModule?.config;

  const ComponentClass = ComponentCtxMixin(
    routeModule?.default as unknown as typeof LitElement
  );
  let component = unsafeHTML(
    registerRouteComponent(
      ComponentClass as unknown as CustomElementConstructor,
      route.tagName
    )
  );

  /**
   * Render the layouts only if there are any layouts and the inherited layouts are not skipped.
   * When a route uses skipInheritedLayouts, no layout will be used.
   * When a layout uses skipInheritedLayouts, only that layout is used.
   */
  if (route.layouts.length > 0 && routeConfig?.skipInheritedLayouts !== true) {
    // Check if the inherited layouts should be skipped, in which case we only
    // render the last layout in the chain
    const skipInheritedLayouts =
      route.layouts.at(-1)?.config?.skipInheritedLayouts;

    component = await renderLayout({
      component: component,
      layouts: !skipInheritedLayouts
        ? (route.layouts as LayoutModule[])
        : ([route.layouts.at(-1)] as LayoutModule[]),
      componentContext: componentContext,
    });
  }

  const ctxStr = `<script type="text/json" id="_lmt_ctx">${JSON.stringify(
    componentContext
  )}</script>`;

  const appTemplateOptions: AppRootOptions = {
    css: route.cssAssetPath
      ? unsafeHTML(`<link rel="stylesheet" href="${route.cssAssetPath}" />`)
      : ``,
    js: [
      route.jsAssetPath ? unsafeHTML(ctxStr) : ``,
      route.jsAssetPath
        ? html`<script type="module" src="${route.jsAssetPath}"></script>`
        : ``,
    ],
    component: component,
  };

  return AppRoot.prototype.render(appTemplateOptions);
}

async function renderLayout({
  component,
  layouts,
  componentContext,
}: {
  component: DirectiveResult<UnsafeHTMLDirective>;
  layouts: LayoutModule[];
  componentContext: ComponentContext;
}) {
  if (layouts.length === 0) return;

  const layoutsReversed = [...layouts].reverse();

  let result = component;
  for await (const Layout of layoutsReversed) {
    // @ts-ignore this should be fixed in the future
    result = await Layout.default.prototype.render.call(
      // @ts-ignore this should be fixed in the future
      Object.assign(Layout.default.prototype, { ctx: componentContext }),
      result
    );
  }

  return result;
}

export async function renderContent(
  AppRoot: AppTemplateInterface,
  route: BuildRoute,
  ctx: Context,
  data?: ComponentContext["data"]
) {
  const componentContext = { params: ctx.params, data };

  const result = render(
    await bootstrapContent(
      AppRoot as AppTemplateInterface,
      route,
      componentContext
    ),
    {
      elementRenderers: [LimetteElementRenderer(route, componentContext)],
    }
  );

  // Collect the output from the generator
  const rawContent = await collectResult(result);

  const content = processHeadAndShadowRoots(rawContent);

  return content;
}
