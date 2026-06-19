import { resolve } from 'node:path';
import { discoverRoutes } from './manifest.ts';
import { resolveClientAssets } from './assets.ts';
import { clientEntryDevPath } from './plugin.ts';
import type { ResolveClientAssetsOptions } from './assets.ts';
import type { DiscoverRoutesOptions } from './manifest.ts';
import type { BuildRoute } from '../server/route.ts';
import type { LayoutModule } from '../server/layouts.ts';
import type { MiddlewareModule } from '../server/middlewares.ts';
import type { RouteModule } from '../server/router.ts';

export type LoadViteBuildRoutesOptions = ResolveClientAssetsOptions & {
  loadFile: (path: string) => Promise<unknown>;
};

export type LoadViteDevRoutesOptions = DiscoverRoutesOptions & {
  loadFile: (path: string) => Promise<unknown>;
  devServerOrigin?: string;
  tagNameSuffix?: string;
};

function routeTagName(path: string, id: string) {
  const routeName = path === '/' ? 'index' : path;
  return `${routeName}-${id}`
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function devRouteTagName(path: string, id: string, suffix?: string) {
  const tagName = routeTagName(path, id);
  return suffix ? `${tagName}-${suffix}` : tagName;
}

function relativeRouteFile(path: string) {
  return path.startsWith('.') ? path : `./${path}`;
}

function joinDevServerUrl(origin: string | undefined, path: string) {
  if (!origin) return path;
  return `${origin.replace(/\/+$/g, '')}${path}`;
}

export async function loadViteBuildRoutes(
  options: LoadViteBuildRoutesOptions,
): Promise<BuildRoute[]> {
  const root = options.root ?? process.cwd();
  const [manifest, clientAssets] = await Promise.all([
    discoverRoutes(options),
    resolveClientAssets(options),
  ]);
  const assetsByRouteId = new Map(
    clientAssets.map((assets) => [assets.routeId, assets]),
  );

  return await Promise.all(
    manifest.routes.map(async (route): Promise<BuildRoute> => {
      const [routeModule, layouts, middlewares] = await Promise.all([
        options.loadFile(route.routeFile) as Promise<RouteModule>,
        Promise.all(
          route.layouts.map((layout) =>
            options.loadFile(layout) as Promise<LayoutModule>
          ),
        ),
        Promise.all(
          route.middlewares.map((middleware) =>
            options.loadFile(middleware) as Promise<MiddlewareModule>
          ),
        ),
      ]);
      const assets = assetsByRouteId.get(route.id);

      return {
        id: route.id,
        path: route.path,
        relativeFilePath: relativeRouteFile(route.routeFile),
        absoluteFilePath: resolve(root, route.routeFile),
        routeModule,
        tagName: routeTagName(route.path, route.id),
        jsAssetContent: undefined,
        jsAssetPath: assets?.entry,
        jsAssetPaths: assets?.entry ? [assets.entry] : undefined,
        cssAssetContent: undefined,
        cssAssetPath: assets?.styles[0],
        cssAssetPaths: assets?.styles,
        islands: route.islandImports.map((islandImport) =>
          islandImport.tagName
        ),
        middlewares,
        middlewarePaths: route.middlewares.map((middleware) =>
          resolve(root, middleware)
        ),
        layouts,
        layoutPaths: route.layouts.map((layout) => resolve(root, layout)),
      };
    }),
  );
}

export async function loadViteDevRoutes(
  options: LoadViteDevRoutesOptions,
): Promise<BuildRoute[]> {
  const root = options.root ?? process.cwd();
  const manifest = await discoverRoutes(options);

  return await Promise.all(
    manifest.routes.map(async (route): Promise<BuildRoute> => {
      const [routeModule, layouts, middlewares] = await Promise.all([
        options.loadFile(route.routeFile) as Promise<RouteModule>,
        Promise.all(
          route.layouts.map((layout) =>
            options.loadFile(layout) as Promise<LayoutModule>
          ),
        ),
        Promise.all(
          route.middlewares.map((middleware) =>
            options.loadFile(middleware) as Promise<MiddlewareModule>
          ),
        ),
      ]);
      const jsAssetPath = route.islandImports.length
        ? joinDevServerUrl(
          options.devServerOrigin,
          clientEntryDevPath(route.id),
        )
        : undefined;

      return {
        id: route.id,
        path: route.path,
        relativeFilePath: relativeRouteFile(route.routeFile),
        absoluteFilePath: resolve(root, route.routeFile),
        routeModule,
        tagName: devRouteTagName(
          route.path,
          route.id,
          options.tagNameSuffix,
        ),
        jsAssetContent: undefined,
        jsAssetPath,
        jsAssetPaths: jsAssetPath ? [jsAssetPath] : undefined,
        cssAssetContent: undefined,
        cssAssetPath: undefined,
        cssAssetPaths: undefined,
        islands: route.islandImports.map((islandImport) =>
          islandImport.tagName
        ),
        middlewares,
        middlewarePaths: route.middlewares.map((middleware) =>
          resolve(root, middleware)
        ),
        layouts,
        layoutPaths: route.layouts.map((layout) => resolve(root, layout)),
      };
    }),
  );
}
