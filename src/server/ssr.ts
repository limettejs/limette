import './ssr-globals.ts';
import { render } from '@lit-labs/ssr';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import { html } from 'lit';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { collectResult } from '@lit-labs/ssr/lib/render-result.js';
import { DOMParser } from 'linkedom';
import type { Context } from './context.ts';
import type { RuntimeRouteDefinition } from './route.ts';
import { LimetteElementRenderer } from './rendering/limette-element-renderer.ts';
import type {
  AppAssets,
  AppRouteInfo,
  HeadRenderResult,
} from './components.ts';

import type { LayoutComponent, LayoutModule } from './layouts.ts';

export interface AppWrapperComponentClass {
  new (): AppWrapperComponent;
}

export interface AppWrapperComponent {
  ctx: Context;
  assets?: AppAssets;
  route?: AppRouteInfo;
  head?(): HeadRenderResult | Promise<HeadRenderResult>;
  render(): unknown;
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

function normalizedAttribute(element: Element, name: string) {
  return element.getAttribute(name)?.trim() ?? '';
}

function headEntryIdentity(element: Element) {
  const explicitKey = normalizedAttribute(element, 'key');
  if (explicitKey) return `key:${explicitKey}`;

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'title' || tagName === 'base') return `singleton:${tagName}`;

  if (tagName === 'meta') {
    if (element.hasAttribute('charset')) return 'meta:charset';
    for (const attribute of ['name', 'property', 'http-equiv', 'itemprop']) {
      const value = normalizedAttribute(element, attribute).toLowerCase();
      if (value) return `meta:${attribute}:${value}`;
    }
    return;
  }

  if (tagName === 'link') {
    const rel = normalizedAttribute(element, 'rel').toLowerCase()
      .split(/\s+/).filter(Boolean).sort().join(' ');
    if (rel === 'canonical') return 'link:canonical';
    const href = normalizedAttribute(element, 'href');
    if (!rel || !href) return;
    const qualifiers = [
      'as',
      'type',
      'media',
      'hreflang',
      'sizes',
      'imagesrcset',
    ]
      .map((attribute) => normalizedAttribute(element, attribute).toLowerCase())
      .join('|');
    return `link:${rel}:${href}:${qualifiers}`;
  }

  if (tagName === 'script') {
    const src = normalizedAttribute(element, 'src');
    if (src) return `script:src:${src}`;
  }
}

async function renderHeadContributions(
  contributions: readonly (
    | HeadRenderResult
    | Promise<HeadRenderResult>
    | undefined
  )[],
) {
  const resolved = (await Promise.all(contributions)).filter(
    (contribution) => contribution !== undefined && contribution !== null,
  );
  if (resolved.length === 0) return '';
  return await collectResult(render(html`${resolved}`));
}

function processShadowRootsAndHead(
  htmlString: string,
  applicationHeadHtml: string,
) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    htmlString,
    'text/html',
  ) as unknown as Document;

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

  processLmtShadowRoots(doc);

  const contributionDoc = parser.parseFromString(
    `<html><head>${applicationHeadHtml}</head><body></body></html>`,
    'text/html',
  ) as unknown as Document;
  const entries: Array<{ element: Element; framework: boolean }> = [];
  const entryIndexes = new Map<string, number>();
  const frameworkIdentities = new Set<string>();

  const merge = (element: Element, framework: boolean) => {
    const identity = headEntryIdentity(element);
    element.removeAttribute('key');
    element.removeAttribute('data-limette-head-asset');

    if (!framework && identity && frameworkIdentities.has(identity)) return;
    if (framework && identity) frameworkIdentities.add(identity);

    if (identity && entryIndexes.has(identity)) {
      const index = entryIndexes.get(identity)!;
      if (!entries[index].framework || framework) {
        entries[index] = { element, framework };
      }
      return;
    }

    if (identity) entryIndexes.set(identity, entries.length);
    entries.push({ element, framework });
  };

  for (const element of Array.from(doc.head.children)) {
    merge(element, element.hasAttribute('data-limette-head-asset'));
  }
  for (const element of Array.from(contributionDoc.head.children)) {
    merge(element, false);
  }

  for (const element of Array.from(doc.head.children)) element.remove();
  for (const { element } of entries) doc.head.appendChild(element);
  for (
    const element of Array.from(
      doc.querySelectorAll('[data-limette-head-asset]'),
    )
  ) {
    element.removeAttribute('data-limette-head-asset');
  }

  return doc.documentElement.outerHTML;
}

export async function bootstrapContent(
  AppWrapper: AppWrapperComponentClass,
  route: RuntimeRouteDefinition,
  ctx: Context,
) {
  const routeModule = route.routeModule;
  const routeConfig = routeModule?.config;

  const ComponentClass = routeModule?.default;
  let component: unknown = unsafeHTML(
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
  let layouts: LayoutComponent[] = [];
  if (route.layouts.length > 0 && routeConfig?.skipInheritedLayouts !== true) {
    // Check if the inherited layouts should be skipped, in which case we only
    // render the last layout in the chain
    const skipInheritedLayouts = route.layouts.at(-1)?.config
      ?.skipInheritedLayouts;

    const renderedLayouts = await renderLayout({
      component: component,
      layouts: !skipInheritedLayouts
        ? route.layouts
        : ([route.layouts.at(-1)] as LayoutModule[]),
      ctx: ctx,
    });
    component = renderedLayouts.component;
    layouts = renderedLayouts.layouts;
  }

  const ctxStr = `<script type="text/json" id="_lmt_ctx">${
    JSON.stringify(
      ctx,
    )
  }</script>`;

  const documentStylePaths = [
    ...route.assets.styles,
    ...(route.assets.tailwindStyle ? [route.assets.tailwindStyle] : []),
  ];
  const styles = documentStylePaths.map((path) =>
    unsafeHTML(
      `<link data-limette-head-asset rel="stylesheet" href="${path}" />`,
    )
  );
  const scripts = route.assets.scripts.length
    ? [
      unsafeHTML(ctxStr),
      ...route.assets.scripts.map((path) =>
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
    file: route.file,
  };

  const appWrapper = new AppWrapper();
  appWrapper.ctx = ctx;
  appWrapper.assets = assets;
  appWrapper.route = routeInfo;
  (appWrapper as AppWrapperComponent & { outlet: unknown }).outlet = component;

  const content = await appWrapper.render();
  const appHead: HeadRenderResult | Promise<HeadRenderResult> | undefined =
    appWrapper.head?.();

  const headContributions: Array<
    HeadRenderResult | Promise<HeadRenderResult> | undefined
  > = [appHead, ...layouts.map((layout) => layout.head?.())];

  return {
    content,
    headContributions,
  };
}

async function renderLayout({
  component,
  layouts,
  ctx,
}: {
  component: unknown;
  layouts: readonly LayoutModule[];
  ctx: Context;
}) {
  if (layouts.length === 0) return { component, layouts: [] };

  let result: unknown = component;
  const instances: LayoutComponent[] = new Array(layouts.length);
  for (let index = layouts.length - 1; index >= 0; index--) {
    const LayoutModule = layouts[index];
    const LayoutComponent = LayoutModule.default;
    const layout = new LayoutComponent();
    layout.ctx = ctx;
    (layout as LayoutComponent & { outlet: unknown }).outlet = result;
    instances[index] = layout;
    result = await layout.render();
  }

  return { component: result, layouts: instances };
}

export async function renderContent(
  AppWrapper: AppWrapperComponentClass,
  route: RuntimeRouteDefinition,
  ctx: Context,
) {
  const bootstrap = await bootstrapContent(
    AppWrapper as AppWrapperComponentClass,
    route,
    ctx,
  );
  let routeHead:
    | HeadRenderResult
    | Promise<HeadRenderResult>
    | undefined;
  const result = render(
    bootstrap.content,
    {
      elementRenderers: [
        LimetteElementRenderer(
          route,
          ctx,
          (head) => routeHead = head,
        ),
      ],
    },
  );

  // Collect the output from the generator
  const rawContent = await collectResult(result);

  const applicationHeadHtml = await renderHeadContributions([
    ...bootstrap.headContributions,
    routeHead,
  ]);
  const content = processShadowRootsAndHead(rawContent, applicationHeadHtml);

  return content;
}
