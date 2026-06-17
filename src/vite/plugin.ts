import { discoverRoutes } from './manifest.ts';
import type { DiscoverRoutesOptions } from './manifest.ts';

const ROUTES_MODULE_ID = 'virtual:limette/routes';
const RESOLVED_ROUTES_MODULE_ID = `\0${ROUTES_MODULE_ID}`;

export type LimetteVitePluginOptions = DiscoverRoutesOptions;

export function limette(options: LimetteVitePluginOptions = {}) {
  let root = options.root ?? process.cwd();

  return {
    name: 'limette',
    configResolved(config: { root: string }) {
      root = options.root ?? config.root;
    },
    resolveId(id: string) {
      if (id === ROUTES_MODULE_ID) {
        return RESOLVED_ROUTES_MODULE_ID;
      }

      return undefined;
    },
    async load(id: string) {
      if (id !== RESOLVED_ROUTES_MODULE_ID) {
        return undefined;
      }

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
    },
  };
}
