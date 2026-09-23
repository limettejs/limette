import { discoverRoutes } from './manifest.ts';
import { discoverStyleImportsForFiles } from './islands.ts';
import { clientEntryDevPath } from './client-entry.ts';
import type { DiscoverRoutesOptions, LimetteRouteManifest } from './manifest.ts';
import { registerRouteDefinitions } from '../server/register-routes.ts';
import type { App } from '../server/app.ts';
import type { AppWrapperComponentClass } from '../server/ssr.ts';
import type { RuntimeRouteDefinition } from '../server/route.ts';
import type { LayoutModule } from '../server/layouts.ts';
import type { MiddlewareModule } from '../server/middlewares.ts';
import type { RouteModule } from '../server/router.ts';
import { islandComponent, type IslandsDefinition } from '../server/components.ts';
import { tailwindEntryDevPath, tailwindSourceVersion } from './tailwind.ts';

export type LoadViteDevRoutesOptions = DiscoverRoutesOptions & {
  loadFile: (path: string) => Promise<unknown>;
  devServerOrigin?: string;
  tailwind?: string;
};

export function routeTagName(path: string, id: string) {
  const routeName = path === '/' ? 'index' : path;
  return `${routeName}-${id}`
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function relativeRouteFile(path: string) {
  return path.startsWith('.') ? path : `./${path}`;
}

function joinDevServerUrl(origin: string | undefined, path: string) {
  if (!origin) return path;
  return `${origin.replace(/\/+$/g, '')}${path}`;
}

function clientStyleDevPath(styleImport: string) {
  const path = styleImport.startsWith('/') ? styleImport : `/@id/${styleImport}`;
  return `${path}${path.includes('?') ? '&' : '?'}direct`;
}

function islandComponentsFor(components: readonly unknown[]) {
  const islands: Record<string, CustomElementConstructor> = {};

  for (const component of components) {
    for (const [tagName, definition] of Object.entries(
      (component as { islands?: IslandsDefinition } | undefined)?.islands ?? {}
    )) {
      islands[tagName] = islandComponent(definition);
    }
  }

  return islands;
}

async function devIslandStyles(
  route: LimetteRouteManifest['routes'][number],
  options: LoadViteDevRoutesOptions
) {
  const root = options.root ?? process.cwd();
  const styles: Record<string, string[]> = {};

  await Promise.all(
    route.islandImports.map(async (island) => {
      if (!island.resolvedImport.startsWith('/')) return;

      const islandFile = island.resolvedImport.slice(1).split(/[?#]/, 1)[0];
      const styleImports = await discoverStyleImportsForFiles({
        root,
        files: [islandFile],
        resolve: options.resolve,
      });
      const existingStyles = styles[island.tagName] ?? [];
      styles[island.tagName] = [
        ...new Set([
          ...existingStyles,
          ...styleImports.map((styleImport) =>
            joinDevServerUrl(options.devServerOrigin, clientStyleDevPath(styleImport))
          ),
        ]),
      ];
    })
  );

  return styles;
}

export async function loadViteDevRoutes(
  options: LoadViteDevRoutesOptions,
  manifest?: LimetteRouteManifest
): Promise<RuntimeRouteDefinition[]> {
  manifest ??= await discoverRoutes(options);

  return await Promise.all(
    manifest.routes.map(async (route): Promise<RuntimeRouteDefinition> => {
      const [routeModule, layouts, middlewares, islandStyles, tailwindVersion] = await Promise.all([
        options.loadFile(route.routeFile) as Promise<RouteModule>,
        Promise.all(
          route.layouts.map((layout) => options.loadFile(layout) as Promise<LayoutModule>)
        ),
        Promise.all(
          route.middlewares.map(
            (middleware) => options.loadFile(middleware) as Promise<MiddlewareModule>
          )
        ),
        devIslandStyles(route, options),
        options.tailwind
          ? tailwindSourceVersion({
              root: options.root ?? process.cwd(),
              route,
              tailwindFile: options.tailwind,
            })
          : undefined,
      ]);
      const clientEntryPath = route.islandImports.length
        ? joinDevServerUrl(options.devServerOrigin, clientEntryDevPath(route.id))
        : undefined;
      const stylePaths = route.islandImports.length
        ? []
        : route.styleImports.map((styleImport) =>
            joinDevServerUrl(options.devServerOrigin, clientStyleDevPath(styleImport))
          );
      const tagName = routeTagName(route.path, route.id);

      return {
        id: route.id,
        path: route.path,
        file: relativeRouteFile(route.routeFile),
        routeModule,
        tagName,
        islands: route.islandImports.map((islandImport) => islandImport.tagName),
        ssrIslands: route.islandImports
          .filter((islandImport) => islandImport.ssr)
          .map((islandImport) => islandImport.tagName),
        renderComponents: {
          ...islandComponentsFor([...layouts.map((layout) => layout.default), routeModule.default]),
          [`lmt-route-${tagName}`]: routeModule.default,
        },
        middlewares,
        layouts,
        assets: {
          scripts: clientEntryPath ? [clientEntryPath] : [],
          styles: stylePaths,
          islandStyles,
          tailwindStyle: options.tailwind
            ? joinDevServerUrl(
                options.devServerOrigin,
                tailwindEntryDevPath(route.id, tailwindVersion)
              )
            : undefined,
        },
      };
    })
  );
}

export async function materializeDevRoutes(
  app: App,
  options: LoadViteDevRoutesOptions
): Promise<void> {
  if (!app._hasFsRoutes()) return;

  const manifest = await discoverRoutes(options);
  const [appModule, routes] = await Promise.all([
    options.loadFile(manifest.appFile) as Promise<{
      default: AppWrapperComponentClass;
    }>,
    loadViteDevRoutes(options, manifest),
  ]);

  const appIslands = islandComponentsFor([appModule.default]);
  const routesWithAppIslands = routes.map((route) => ({
    ...route,
    renderComponents: {
      ...appIslands,
      ...route.renderComponents,
    },
  }));

  registerRouteDefinitions(app, {
    appWrapper: appModule.default,
    routes: routesWithAppIslands,
  });
}
