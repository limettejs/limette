import { discoverRoutes } from './manifest.ts';
import { litResolution } from './lit-resolution.ts';
import { createLimetteDevServer } from './dev-server.ts';
import {
  CLIENT_ENTRY_MODULE_PREFIX,
  configureClientEntryMiddleware,
  RESOLVED_CLIENT_ENTRY_MODULE_PREFIX,
} from './client-entry.ts';
import type { LimetteDevOptions } from './dev-server.ts';
import type { HotUpdateContextLike, ViteDevServerLike } from './types.ts';

const ROUTES_MODULE_ID = 'virtual:limette/routes';
const RESOLVED_ROUTES_MODULE_ID = `\0${ROUTES_MODULE_ID}`;

export type LimetteVitePluginOptions = LimetteDevOptions;

export function limette(options: LimetteVitePluginOptions = {}) {
  let root = options.root ?? process.cwd();
  const devServer = createLimetteDevServer(options);

  return {
    name: 'limette',
    config() {
      return litResolution(root);
    },
    configResolved(config: { root: string }) {
      root = options.root ?? config.root;
      devServer.setRoot(root);
    },
    configureServer(server: ViteDevServerLike) {
      configureClientEntryMiddleware(server);
      return devServer.configure(server);
    },
    handleHotUpdate(ctx: HotUpdateContextLike) {
      return devServer.handleHotUpdate(ctx);
    },
    resolveId(id: string) {
      if (id === ROUTES_MODULE_ID) {
        return RESOLVED_ROUTES_MODULE_ID;
      }

      if (id.startsWith(CLIENT_ENTRY_MODULE_PREFIX)) {
        return `${RESOLVED_CLIENT_ENTRY_MODULE_PREFIX}${
          id.slice(CLIENT_ENTRY_MODULE_PREFIX.length)
        }`;
      }

      return undefined;
    },
    async load(id: string) {
      if (id === RESOLVED_ROUTES_MODULE_ID) {
        const manifest = await discoverRoutes({
          ...options,
          root,
        });

        return [
          `export const appFile = ${JSON.stringify(manifest.appFile)};`,
          `export const routes = ${JSON.stringify(manifest.routes, null, 2)};`,
          `export const manifest = { appFile, routes };`,
          `export default manifest;`,
        ].join('\n');
      }

      if (!id.startsWith(RESOLVED_CLIENT_ENTRY_MODULE_PREFIX)) {
        return undefined;
      }

      const routeId = id.slice(RESOLVED_CLIENT_ENTRY_MODULE_PREFIX.length);
      const manifest = await discoverRoutes({
        ...options,
        root,
      });
      const route = manifest.routes.find((route) => route.id === routeId);

      if (!route) {
        throw new Error(`Unknown Limette route client entry: ${routeId}`);
      }

      const imports = route.islandImports.length
        ? [
          `import '@limette/core/runtime/ssr-client/lit-element-hydrate-support.ts';`,
          `import '@limette/core/runtime/ssr-client/lit-element-hydrate-support-patch.ts';`,
          ...route.islandImports.map((islandImport) =>
            `import ${JSON.stringify(islandImport.resolvedImport)};`
          ),
        ]
        : [];

      return [
        ...imports,
        `export const routeId = ${JSON.stringify(route.id)};`,
        `export const routePath = ${JSON.stringify(route.path)};`,
        `export const islandImports = ${
          JSON.stringify(route.islandImports, null, 2)
        };`,
      ].join('\n');
    },
  };
}
