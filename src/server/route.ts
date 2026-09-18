import type { LayoutModule } from './layouts.ts';
import type { MiddlewareModule } from './middlewares.ts';
import type { RouteModule } from './router.ts';

export interface RuntimeRouteDefinition {
  readonly id: string;
  readonly path: string;
  readonly file: string;
  readonly tagName: string;
  readonly routeModule: RouteModule;
  readonly layouts: readonly LayoutModule[];
  readonly middlewares: readonly MiddlewareModule[];
  readonly islands: readonly string[];
  readonly assets: {
    readonly scripts: readonly string[];
    readonly styles: readonly string[];
    readonly islandStyles: Readonly<Record<string, readonly string[]>>;
  };
}
