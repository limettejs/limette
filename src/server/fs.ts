import type { BuildRoute } from '../dev/build.ts';
import type { App } from './app.ts';
import type { Method } from './router.ts';
import { handlersForRoute } from './handlers.ts';
import type { AppWrapperComponentClass } from './ssr.ts';
import { staticViteBuildMiddleware } from './static-files.ts';
import { join } from '@std/path';

export interface BuildRoutesOptions {
  buildAssets?: boolean;
  devMode?: boolean;
  tailwind?: boolean;
  target?: string | string[];
  loadFile?: (path: string) => Promise<unknown>;
}

function normalizeViteOptions(
  vite: App['builtinPluginOptions']['fsRoutes']['vite'],
) {
  return vite ?? {};
}

function viteAssetRoutePath(base = '/') {
  const normalizedBase = !base || base === '/'
    ? '/'
    : `/${base.replace(/^\/+|\/+$/g, '')}/`;
  return `${normalizedBase}assets/*`;
}

/**
 * This will load the fs routes in the app.listen() method , only if the `fsRoutes` was called.
 */
export async function setFsRoutes(app: App) {
  const fsRoutesOptions = app.builtinPluginOptions.fsRoutes;
  const viteOptions = normalizeViteOptions(fsRoutesOptions.vite);
  const { discoverRoutes, loadViteBuildRoutes, loadViteDevRoutes } =
    await import(
      '../vite/mod.ts'
    );
  const root = viteOptions.root ?? Deno.cwd();
  const outDir = viteOptions.outDir ?? 'dist';
  const fsOutDir = join(root, outDir);
  const viteRouteOptions = {
    root,
    outDir,
    base: viteOptions.base,
    manifestPath: viteOptions.manifestPath,
    loadFile: fsRoutesOptions.loadFile!,
  };
  const [routeManifest, routes] = await Promise.all([
    discoverRoutes(viteRouteOptions),
    app.config.mode === 'development'
      ? loadViteDevRoutes({
        root,
        loadFile: fsRoutesOptions.loadFile!,
        devServerOrigin: viteOptions.devServerOrigin ??
          'http://localhost:5173',
      })
      : loadViteBuildRoutes(viteRouteOptions),
  ]);
  const AppWrapper = (
    (await fsRoutesOptions.loadFile!(routeManifest.appFile)) as {
      default: AppWrapperComponentClass;
    }
  ).default;

  if (
    app.config.mode !== 'development' &&
    viteOptions.serveAssets !== false
  ) {
    app.get(
      viteAssetRoutePath(viteOptions.base),
      staticViteBuildMiddleware({
        outDir: fsOutDir,
        base: viteOptions.base,
      }),
    );
  }

  if (!AppWrapper) {
    throw new Error(
      'You need to create an AppWrapper (_app.ts/js) to render a page.',
    );
  }

  for (const route of routes) {
    const handlers = handlersForRoute(route, AppWrapper);

    // Register error pages
    if (route.path.endsWith('/_error') && handlers?.GET) {
      app.error(route.path, handlers.GET);
      continue;
    }

    const middlewares = route.middlewares
      .map((module) => module?.handler)
      .flat();

    for (const [method, handler] of Object.entries(handlers)) {
      // Register route
      app[method.toLocaleLowerCase() as Lowercase<Method>](
        route.path,
        ...middlewares,
        handler,
      );
    }
  }
}
