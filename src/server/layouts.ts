import type { Context } from './context.ts';
import type { HeadRenderResult, IslandsDefinition } from './components.ts';

export interface LayoutConfig {
  skipInheritedLayouts: boolean; // Skip already inherited layouts
}

export interface LayoutModule {
  config: LayoutConfig;
  default: LayoutComponentClass;
}

export interface LayoutComponentClass {
  new (): LayoutComponent;
  islands?: IslandsDefinition;
}

export interface LayoutComponent {
  ctx: Context;
  head?(): HeadRenderResult | Promise<HeadRenderResult>;
  render(): unknown;
}
