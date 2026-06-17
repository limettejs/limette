import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverRoutes } from './manifest.ts';
import type { DiscoverRoutesOptions } from './manifest.ts';

const ROUTES_MODULE_ID = 'virtual:limette/routes';
const RESOLVED_ROUTES_MODULE_ID = `\0${ROUTES_MODULE_ID}`;
const CLIENT_ENTRY_MODULE_PREFIX = 'virtual:limette/client-entry/';
const RESOLVED_CLIENT_ENTRY_MODULE_PREFIX = `\0${CLIENT_ENTRY_MODULE_PREFIX}`;
const SOURCE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export type LimetteVitePluginOptions = DiscoverRoutesOptions;

export function limette(options: LimetteVitePluginOptions = {}) {
  let root = options.root ?? process.cwd();

  return {
    name: 'limette',
    config() {
      return {
        resolve: {
          alias: [
            {
              find:
                '@limette/core/runtime/ssr-client/lit-element-hydrate-support.ts',
              replacement: resolve(
                SOURCE_ROOT,
                'runtime/ssr-client/lit-element-hydrate-support.ts',
              ),
            },
            {
              find:
                '@limette/core/runtime/ssr-client/lit-element-hydrate-support-patch.ts',
              replacement: resolve(
                SOURCE_ROOT,
                'runtime/ssr-client/lit-element-hydrate-support-patch.ts',
              ),
            },
          ],
        },
      };
    },
    configResolved(config: { root: string }) {
      root = options.root ?? config.root;
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
