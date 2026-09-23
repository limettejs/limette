import type { LayoutModule } from './layouts.ts';
import type { MiddlewareModule } from './middlewares.ts';
import type { RouteModule } from './router.ts';
import type { DefaultState } from './context.ts';

export interface RuntimeRouteDefinition<State = DefaultState, Platform = unknown> {
  readonly id: string;
  readonly path: string;
  readonly file: string;
  readonly tagName: string;
  readonly routeModule: RouteModule<State, Platform>;
  readonly layouts: readonly LayoutModule<State, Platform>[];
  readonly middlewares: readonly MiddlewareModule<State, Platform>[];
  readonly islands: readonly string[];
  readonly ssrIslands: readonly string[];
  /** @internal Fresh request-scoped constructors used by Vite development SSR. */
  readonly renderComponents?: Record<string, CustomElementConstructor>;
  readonly assets: {
    readonly scripts: readonly string[];
    readonly styles: readonly string[];
    readonly islandStyles: Readonly<Record<string, readonly string[]>>;
    readonly tailwindStyle?: string;
  };
}
