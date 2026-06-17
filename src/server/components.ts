// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import { LitElement } from 'lit';
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { TemplateResult } from 'lit';
import type { Context } from './context.ts';

export type IslandComponentClass = CustomElementConstructor;
export type IslandsDefinition = Record<string, IslandComponentClass>;

export interface ServerComponentClass extends CustomElementConstructor {
  __requiresContext?: boolean;
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

export abstract class ServerComponent<
  TData = unknown,
  TParams extends Record<string, string> = Record<string, string>,
> extends LitElement {
  static __requiresContext = true;

  declare ctx: Context<TData, TParams>;

  protected override createRenderRoot() {
    return this;
  }
}

export abstract class PageComponent<
  TData = unknown,
  TParams extends Record<string, string> = Record<string, string>,
> extends ServerComponent<TData, TParams> {
  static islands?: IslandsDefinition;
}

export abstract class LayoutComponent<
  TData = unknown,
  TParams extends Record<string, string> = Record<string, string>,
> extends ServerComponent<TData, TParams> {
  declare child: TemplateResult;
}

export abstract class AppComponent<
  TData = unknown,
  TParams extends Record<string, string> = Record<string, string>,
> extends ServerComponent<TData, TParams> {
  declare page: TemplateResult;
  declare assets: AppAssets;
  declare route: AppRouteInfo;
}
