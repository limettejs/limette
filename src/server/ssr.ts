import { html, render } from '@lit-labs/ssr';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { collectResult } from '@lit-labs/ssr/lib/render-result.js';
import { DOMParser } from 'linkedom';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { TemplateResult } from 'lit';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { DirectiveResult } from 'lit/directive.js';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { UnsafeHTMLDirective } from 'lit/directives/unsafe-html.js';
import type { Context } from './context.ts';
import type { BuildRoute } from './route.ts';
import { LimetteElementRenderer } from './rendering/limette-element-renderer.ts';
import type {
  AppAssets,
  AppRouteInfo,
  ServerRenderResult,
} from './components.ts';

import { installWindowOnGlobal } from '@lit-labs/ssr/lib/dom-shim.js';
import type { LayoutModule } from './layouts.ts';

const originalFetch = globalThis.fetch;
installWindowOnGlobal();
// Restore the original fetch function shimmed by lit-labs/ssr which is not compatible with Deno
globalThis.fetch = originalFetch;
// Set window object, because the shim doesn't do it
// @ts-ignore some components use the `window` reference for registration process
globalThis.window = globalThis;

export type AppWrapperOptions = {
  css: DirectiveResult<typeof UnsafeHTMLDirective> | string;
  js:
    | string[]
    | TemplateResult[]
    | DirectiveResult<typeof UnsafeHTMLDirective>[];
  component: ServerRenderResult;
  page: ServerRenderResult;
  assets: AppAssets;
  route: AppRouteInfo;
};

export interface AppWrapperComponentClass {
  new (): AppWrapperComponent;
  ctx: Context;
  render(app?: AppWrapperOptions): TemplateResult | Promise<TemplateResult>;
}

export interface AppWrapperComponent {
  ctx: Context;
  page?: ServerRenderResult;
  assets?: AppAssets;
  route?: AppRouteInfo;
  render(app?: AppWrapperOptions): TemplateResult | Promise<TemplateResult>;
}

function registerRouteComponent(
  ComponentClass: CustomElementConstructor,
  tagName: string,
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
    'text/html',
  ) as unknown as Document;

  const uniqueElements = new Map(); // Track the last unique element by key
  let lastTitleElement = null; // Track the last <title> element found

  // Recursive function to process <lmt-head> elements in the main DOM and nested declarative shadow DOMs
  function processLmtHeadElements(root: Document | DocumentFragment) {
    // Find and process all <lmt-head> elements within the current root
    const lmtHeadElements = Array.from(root.querySelectorAll('lmt-head'));

    lmtHeadElements.forEach((wrapper) => {
      Array.from(wrapper.children).forEach((child) => {
        if (child.tagName === 'TITLE') {
          // Keep only the last <title> element found
          lastTitleElement = child;
        } else {
          const key = child.getAttribute('key');
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
        'template[shadowroot]',
      ) as unknown as HTMLTemplateElement[]
    ).forEach((template) => {
      processLmtHeadElements(template.content); // Process the content of each declarative shadow DOM template
    });
  }

  function processLmtShadowRoots(node: Document | DocumentFragment) {
    // Select all <template> elements in the current node
    const templates = node.querySelectorAll('template');

    templates.forEach((template) => {
      // Only process templates with shadowroot="disabled"
      if (template?.getAttribute('shadowroot') === 'disabled') {
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
  Array.from(doc.head.querySelectorAll('[key]')).forEach((headElement) => {
    const key = headElement.getAttribute('key');
    if (key && uniqueElements.has(key)) {
      headElement.remove();
    }
  });

  // Remove any existing <title> elements in <head> if we have a new one
  if (lastTitleElement) {
    Array.from(doc.head.querySelectorAll('title')).forEach((title) =>
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

export async function bootstrapContent(
  AppWrapper: AppWrapperComponentClass,
  route: BuildRoute,
  ctx: Context,
) {
  const routeModule = route.routeModule;
  const routeConfig = routeModule?.config;

  const ComponentClass = routeModule?.default;
  let component = unsafeHTML(
    registerRouteComponent(
      ComponentClass as unknown as CustomElementConstructor,
      route.tagName,
    ),
  );

  /**
   * Render the layouts only if there are any layouts and the inherited layouts are not skipped.
   * When a route uses skipInheritedLayouts, no layout will be used.
   * When a layout uses skipInheritedLayouts, only that layout is used.
   */
  if (route.layouts.length > 0 && routeConfig?.skipInheritedLayouts !== true) {
    // Check if the inherited layouts should be skipped, in which case we only
    // render the last layout in the chain
    const skipInheritedLayouts = route.layouts.at(-1)?.config
      ?.skipInheritedLayouts;

    component = await renderLayout({
      component: component,
      layouts: !skipInheritedLayouts
        ? (route.layouts as LayoutModule[])
        : ([route.layouts.at(-1)] as LayoutModule[]),
      ctx: ctx,
    });
  }

  const ctxStr = `<script type="text/json" id="_lmt_ctx">${
    JSON.stringify(
      ctx,
    )
  }</script>`;

  const cssAssetPaths = route.cssAssetPaths ??
    (route.cssAssetPath ? [route.cssAssetPath] : []);
  const jsAssetPaths = route.jsAssetPaths ??
    (route.jsAssetPath ? [route.jsAssetPath] : []);
  const styles = cssAssetPaths.map((path) =>
    unsafeHTML(`<link rel="stylesheet" href="${path}" />`)
  );
  const scripts = jsAssetPaths.length
    ? [
      unsafeHTML(ctxStr),
      ...jsAssetPaths.map((path) =>
        html`
          <script type="module" src="${path}"></script>
        `
      ),
    ]
    : [];
  const assets = { styles, scripts };
  const routeInfo = {
    id: route.id,
    path: route.path,
    file: route.relativeFilePath,
  };

  const appWrapperOptions: AppWrapperOptions = {
    css: styles[0] ?? ``,
    js: scripts,
    component: component,
    page: component,
    assets,
    route: routeInfo,
  };

  const appWrapper = new AppWrapper();
  appWrapper.ctx = ctx;
  appWrapper.page = component;
  appWrapper.assets = assets;
  appWrapper.route = routeInfo;

  return AppWrapper.prototype.render.length === 0
    ? await appWrapper.render()
    : await appWrapper.render(appWrapperOptions);
}

async function renderLayout({
  component,
  layouts,
  ctx,
}: {
  component: DirectiveResult<typeof UnsafeHTMLDirective>;
  layouts: LayoutModule[];
  ctx: Context;
}) {
  if (layouts.length === 0) return component;

  const layoutsReversed = [...layouts].reverse();

  let result: ServerRenderResult = component;
  for await (const LayoutModule of layoutsReversed) {
    const LayoutComponent = LayoutModule.default;
    const layout = new LayoutComponent();
    layout.ctx = ctx;
    layout.child = result;
    result = LayoutComponent.prototype.render.length === 0
      ? await layout.render()
      : await layout.render(result);
  }

  return result;
}

export async function renderContent(
  AppWrapper: AppWrapperComponentClass,
  route: BuildRoute,
  ctx: Context,
) {
  const result = render(
    await bootstrapContent(AppWrapper as AppWrapperComponentClass, route, ctx),
    {
      elementRenderers: [LimetteElementRenderer(route, ctx)],
    },
  );

  // Collect the output from the generator
  const rawContent = await collectResult(result);

  const content = processHeadAndShadowRoots(rawContent);

  return content;
}
