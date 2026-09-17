import { discoverRoutes } from './manifest.ts';
import { clientEntryDevPath } from './client-entry.ts';
import type {
  DiscoverRoutesOptions,
  LimetteRouteManifest,
} from './manifest.ts';
import { registerRouteDefinitions } from '../server/register-routes.ts';
import type { App } from '../server/app.ts';
import type { AppWrapperComponentClass } from '../server/ssr.ts';
import type { RuntimeRouteDefinition } from '../server/route.ts';
import type { LayoutModule } from '../server/layouts.ts';
import type { MiddlewareModule } from '../server/middlewares.ts';
import type { RouteModule } from '../server/router.ts';

export type LoadViteDevRoutesOptions = DiscoverRoutesOptions & {
  loadFile: (path: string) => Promise<unknown>;
  devServerOrigin?: string;
  tagNameSuffix?: string;
};

export function routeTagName(path: string, id: string) {
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

export async function loadViteDevRoutes(
  options: LoadViteDevRoutesOptions,
  manifest?: LimetteRouteManifest,
): Promise<RuntimeRouteDefinition[]> {
  manifest ??= await discoverRoutes(options);

  return await Promise.all(
    manifest.routes.map(async (route): Promise<RuntimeRouteDefinition> => {
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
      const clientEntryPath = route.islandImports.length
        ? joinDevServerUrl(
          options.devServerOrigin,
          clientEntryDevPath(route.id),
        )
        : undefined;

      return {
        id: route.id,
        path: route.path,
        file: relativeRouteFile(route.routeFile),
        routeModule,
        tagName: devRouteTagName(
          route.path,
          route.id,
          options.tagNameSuffix,
        ),
        islands: route.islandImports.map((islandImport) =>
          islandImport.tagName
        ),
        middlewares,
        layouts,
        assets: {
          scripts: clientEntryPath ? [clientEntryPath] : [],
          styles: [],
        },
      };
    }),
  );
}

export async function materializeDevRoutes(
  app: App,
  options: LoadViteDevRoutesOptions,
): Promise<void> {
  if (!app._hasFsRoutes()) return;

  const manifest = await discoverRoutes(options);
  const [appModule, routes] = await Promise.all([
    options.loadFile(manifest.appFile) as Promise<{
      default: AppWrapperComponentClass;
    }>,
    loadViteDevRoutes(options, manifest),
  ]);

  registerRouteDefinitions(app, {
    appWrapper: appModule.default,
    routes,
  });
}
