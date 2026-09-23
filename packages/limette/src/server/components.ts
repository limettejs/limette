// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import { LitElement, nothing } from 'lit';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { TemplateResult } from 'lit';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { DirectiveResult } from 'lit/directive.js';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { UnsafeHTMLDirective } from 'lit/directives/unsafe-html.js';
import type { DefaultState, RenderContext } from './context.ts';

export type IslandComponentClass = CustomElementConstructor;
export type IslandDefinition =
  | IslandComponentClass
  | {
      component: IslandComponentClass;
      ssr?: boolean;
    };
export type IslandsDefinition = Record<string, IslandDefinition>;

/** @internal */
export function islandComponent(definition: IslandDefinition): IslandComponentClass {
  return typeof definition === 'function' ? definition : definition.component;
}
export type ServerRenderResult = TemplateResult | DirectiveResult<typeof UnsafeHTMLDirective>;
export type HeadRenderResult = TemplateResult | typeof nothing | null | undefined;

export interface ServerComponentClass extends CustomElementConstructor {
  islands?: IslandsDefinition;
}

export type AppAssets = {
  styles: unknown[];
  scripts: unknown[];
};

export type AppRouteInfo = {
  id: string;
  path: string;
  file: string;
};

export abstract class ServerComponent extends LitElement {
  protected override createRenderRoot() {
    return this;
  }
}

export abstract class PageComponent<
  State = DefaultState,
  Platform = unknown,
> extends ServerComponent {
  static islands?: IslandsDefinition;
  declare protected readonly ctx: RenderContext<State, Platform>;

  head(): HeadRenderResult | Promise<HeadRenderResult> {
    return nothing;
  }
}

export abstract class LayoutComponent<
  State = DefaultState,
  Platform = unknown,
> extends ServerComponent {
  declare protected readonly ctx: RenderContext<State, Platform>;
  declare protected readonly outlet: unknown;

  head(): HeadRenderResult | Promise<HeadRenderResult> {
    return nothing;
  }
}

export abstract class AppComponent<
  State = DefaultState,
  Platform = unknown,
> extends ServerComponent {
  declare protected readonly ctx: RenderContext<State, Platform>;
  declare protected readonly outlet: unknown;
  declare assets: AppAssets;
  declare route: AppRouteInfo;

  head(): HeadRenderResult | Promise<HeadRenderResult> {
    return nothing;
  }
}
