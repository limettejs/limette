import type { OutputFile } from 'esbuild';
import type { LayoutModule } from './layouts.ts';
import type { MiddlewareModule } from './middlewares.ts';
import type { RouteModule } from './router.ts';

export type BuildRoute = {
  id: string;
  path: string;
  relativeFilePath: string;
  absoluteFilePath: string;
  routeModule?: RouteModule;
  tagName: string;
  jsAssetContent: OutputFile | undefined;
  jsAssetPath: string | undefined;
  jsAssetPaths?: string[];
  cssAssetContent: string | undefined;
  cssAssetPath: string | undefined;
  cssAssetPaths?: string[];
  islands: string[] | undefined;
  middlewares: MiddlewareModule[] | [];
  middlewarePaths: string[] | [];
  layouts: LayoutModule[] | [];
  layoutPaths: string[] | [];
};
