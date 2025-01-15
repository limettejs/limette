// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from "lit";

export interface LayoutConfig {
  skipInheritedLayouts: boolean; // Skip already inherited layouts
}

export interface LayoutModule {
  config: LayoutConfig;
  default: LitElement;
}
