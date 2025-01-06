// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from "lit";
import type { Handlers } from "./server/router.ts";
import type { Middleware } from "./deps.ts";

export interface RouteConfig {
  skipInheritedLayouts: boolean; // Skip already inherited layouts
}

export interface LayoutConfig {
  skipInheritedLayouts: boolean; // Skip already inherited layouts
}

export interface RouteModule {
  config: RouteConfig;
  handler: Handlers;
  default: LitElement;
}

export interface MiddlewareModule {
  handler: Middleware | Middleware[];
}

export interface LayoutModule {
  config: LayoutConfig;
  default: LitElement;
}
