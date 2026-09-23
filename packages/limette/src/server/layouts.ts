import type { DefaultState } from './context.ts';
import type { HeadRenderResult, IslandsDefinition } from './components.ts';

export interface LayoutConfig {
  skipInheritedLayouts: boolean; // Skip already inherited layouts
}

export interface LayoutModule<State = DefaultState, Platform = unknown> {
  config: LayoutConfig;
  default: LayoutComponentClass<State, Platform>;
}

export interface LayoutComponentClass<State = DefaultState, Platform = unknown> {
  new (): LayoutComponent<State, Platform>;
  islands?: IslandsDefinition;
}

export interface LayoutComponent<State = DefaultState, Platform = unknown> {
  head?(): HeadRenderResult | Promise<HeadRenderResult>;
  render(): unknown;
}
