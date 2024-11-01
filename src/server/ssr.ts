import {
  html,
  unsafeHTML,
  render,
  collectResult,
  DOMParser,
  Element,
} from "../deps.ts";
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

function registerComponent(
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

function moveLmtHeadElements(htmlString: string) {
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

function moveLmtHeadElementsFirstLevel(htmlString: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    htmlString,
    "text/html"
  ) as unknown as Document;

  const uniqueElements = new Map(); // Track the last unique element by key
  let lastTitleElement = null; // Track the last <title> element found

  function processLmtHeadElements(root: Document | DocumentFragment) {
    // Find all <lmt-head> elements within the given root
    const lmtHeadElements = Array.from(root.querySelectorAll("lmt-head"));

    lmtHeadElements.forEach((wrapper) => {
      Array.from(wrapper.children).forEach((child) => {
        if (child.tagName === "TITLE") {
          // Keep only the last <title> element found
          lastTitleElement = child;
        } else {
          const key = child.getAttribute("key");

          if (key) {
            // Only keep the latest element with each key
            uniqueElements.set(key, child);
          } else {
            // Treat children without a key as unique
            uniqueElements.set(Symbol(), child);
          }
        }
      });

      // Remove the <lmt-head> wrapper from the DOM
      wrapper.remove();
    });
  }

  // Process <lmt-head> elements in the main DOM
  processLmtHeadElements(doc);

  // Process <lmt-head> elements within each declarative shadow DOM template
  const templates = doc.querySelectorAll(
    "template[shadowroot]"
  ) as unknown as HTMLTemplateElement[];
  templates.forEach((template) => {
    processLmtHeadElements(template.content); // Directly use template.content without re-parsing
  });

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

export function bootstrapContent(
  AppTemplate: AppTemplateInterface,
  route: BuildRoute,
  componentContext: ComponentContext
) {
  const componentModule = route.routeModule;

  const ComponentClass = ComponentCtxMixin(
    componentModule?.default as typeof LitElement
  );
  const component = registerComponent(
    ComponentClass as unknown as CustomElementConstructor,
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
      elementRenderers: [LimetteElementRenderer(route, componentContext)],
    }
  );
  const rawContent = await collectResult(result);

  const content = moveLmtHeadElements(rawContent);

  return content;
}
