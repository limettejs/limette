// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { TemplateResult } from "lit";
import type { Context } from "./context.ts";

export interface LayoutConfig {
  skipInheritedLayouts: boolean; // Skip already inherited layouts
}

export interface LayoutModule {
  config: LayoutConfig;
  default: LayoutComponentClass;
}

export interface LayoutComponentClass {
  new (): LayoutComponent;
  ctx: Context;
  render(component: TemplateResult): TemplateResult | Promise<TemplateResult>;
}

export interface LayoutComponent {
  ctx: Context;
  render(component: TemplateResult): TemplateResult | Promise<TemplateResult>;
}
