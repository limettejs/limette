import { discoverRoutes } from './manifest.ts';
import { litResolution } from './lit-resolution.ts';
import { createLimetteDevServer } from './dev-server.ts';
import { clientEntryInputs } from './client-entries.ts';
import { readViteManifest, resolveServerEntryAssets } from './assets.ts';
import {
  CLIENT_ENTRY_MODULE_PREFIX,
  configureClientEntryMiddleware,
  ISLAND_ENTRY_MODULE_PREFIX,
  RESOLVED_CLIENT_ENTRY_MODULE_PREFIX,
  RESOLVED_ISLAND_ENTRY_MODULE_PREFIX,
} from './client-entry.ts';
import type {
  HotUpdateContextLike,
  PluginContextLike,
  ViteDevServerLike,
} from './types.ts';
import {
  generateServerEntry,
  RESOLVED_SERVER_ENTRY_MODULE_ID,
  SERVER_ENTRY_MODULE_ID,
  SERVER_RUNTIME_MODULE_ID,
} from './server-entry.ts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LimetteOptions {
  app: string;
  routesDir?: string;
}

type UserConfigLike = {
  root?: string;
  base?: string;
};

type ConfigEnvLike = {
  command: 'build' | 'serve';
};

function serverRuntimePath() {
  const sourcePath = fileURLToPath(
    new URL('../server-runtime.ts', import.meta.url),
  );
  if (existsSync(sourcePath)) return sourcePath;

  return fileURLToPath(
    new URL('./internal/server-runtime.mjs', import.meta.url),
  );
}

export function limette(options: LimetteOptions) {
  let root = process.cwd();
  let base = '/';
  const devServer = createLimetteDevServer({
    routesDir: options.routesDir,
    dev: { appModule: options.app },
  });

  return {
    name: 'limette',
    async config(config: UserConfigLike, env: ConfigEnvLike) {
      root = resolve(config.root ?? root);
      base = config.base ?? '/';
      const resolution = litResolution(root);

      if (env.command !== 'build') {
        return { ...resolution, appType: 'custom' as const };
      }

      const clientInputs = await clientEntryInputs({
        root,
        routesDir: options.routesDir,
      });

      return {
        resolve: resolution.resolve,
        appType: 'custom',
        builder: {},
        environments: {
          client: {
            consumer: 'client',
            build: {
              outDir: 'dist/client',
              emptyOutDir: true,
              manifest: true,
              rolldownOptions: {
                input: clientInputs,
              },
            },
          },
          server: {
            consumer: 'server',
            resolve: {
              alias: {
                [SERVER_RUNTIME_MODULE_ID]: serverRuntimePath(),
              },
              external: ['@limette/core'],
              noExternal: resolution.ssr.noExternal.filter((dependency) =>
                dependency !== '@limette/core'
              ),
            },
            build: {
              outDir: 'dist/server',
              emptyOutDir: true,
              copyPublicDir: false,
              ssr: true,
              rolldownOptions: {
                input: {
                  entry: SERVER_ENTRY_MODULE_ID,
                },
                output: {
                  entryFileNames: 'entry.js',
                },
              },
            },
          },
        },
      };
    },
    configResolved(config: { root: string; base: string }) {
      root = config.root;
      base = config.base;
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
      if (id === SERVER_ENTRY_MODULE_ID) {
        return RESOLVED_SERVER_ENTRY_MODULE_ID;
      }

      if (id.startsWith(CLIENT_ENTRY_MODULE_PREFIX)) {
        return `${RESOLVED_CLIENT_ENTRY_MODULE_PREFIX}${
          id.slice(CLIENT_ENTRY_MODULE_PREFIX.length)
        }`;
      }

      if (id.startsWith(ISLAND_ENTRY_MODULE_PREFIX)) {
        return `${RESOLVED_ISLAND_ENTRY_MODULE_PREFIX}${
          id.slice(ISLAND_ENTRY_MODULE_PREFIX.length)
        }`;
      }

      return undefined;
    },
    async load(this: PluginContextLike, id: string) {
      if (id === RESOLVED_SERVER_ENTRY_MODULE_ID) {
        const importer = resolve(root, '__limette_server_entry__.js');
        const resolvedApp = await this.resolve(options.app, importer);
        if (!resolvedApp) {
          throw new Error(
            `Could not resolve configured Limette app module "${options.app}" from "${root}".`,
          );
        }

        const manifest = await discoverRoutes({
          root,
          routesDir: options.routesDir,
        });
        const manifestPath = resolve(
          root,
          'dist/client/.vite/manifest.json',
        );
        const assets = resolveServerEntryAssets({
          manifest: await readViteManifest({ manifestPath }),
          routes: manifest,
          base,
          manifestPath,
        });

        return generateServerEntry({
          root,
          appModule: resolvedApp.id,
          manifest,
          assets,
        });
      }

      if (!id.startsWith(RESOLVED_CLIENT_ENTRY_MODULE_PREFIX)) {
        if (!id.startsWith(RESOLVED_ISLAND_ENTRY_MODULE_PREFIX)) {
          return undefined;
        }

        const identity = id.slice(RESOLVED_ISLAND_ENTRY_MODULE_PREFIX.length);
        const separator = identity.lastIndexOf('/');
        const routeId = identity.slice(0, separator);
        const islandIndex = Number(identity.slice(separator + 1));
        const manifest = await discoverRoutes({
          root,
          routesDir: options.routesDir,
        });
        const route = manifest.routes.find((route) => route.id === routeId);
        const island = route?.islandImports[islandIndex];

        if (!route || !island || !Number.isInteger(islandIndex)) {
          throw new Error(`Unknown Limette island client entry: ${identity}`);
        }

        return [
          `import ${JSON.stringify(island.resolvedImport)};`,
          `export const routeId = ${JSON.stringify(route.id)};`,
          `export const islandTagName = ${JSON.stringify(island.tagName)};`,
        ].join('\n');
      }

      const routeId = id.slice(RESOLVED_CLIENT_ENTRY_MODULE_PREFIX.length);
      const manifest = await discoverRoutes({
        root,
        routesDir: options.routesDir,
      });
      const route = manifest.routes.find((route) => route.id === routeId);

      if (!route) {
        throw new Error(`Unknown Limette route client entry: ${routeId}`);
      }

      const imports = [
        ...route.styleImports.map((styleImport) =>
          `import ${JSON.stringify(styleImport)};`
        ),
        ...(route.islandImports.length
          ? [
            `import '@limette/core/runtime/ssr-client/lit-element-hydrate-support.ts';`,
            `import '@limette/core/runtime/ssr-client/lit-element-hydrate-support-patch.ts';`,
            ...route.islandImports.map((islandImport) =>
              `import ${JSON.stringify(islandImport.resolvedImport)};`
            ),
          ]
          : []),
      ];

      return [
        ...imports,
        `export const routeId = ${JSON.stringify(route.id)};`,
        `export const routePath = ${JSON.stringify(route.path)};`,
        `export const islandImports = ${
          JSON.stringify(route.islandImports, null, 2)
        };`,
        `export const styleImports = ${
          JSON.stringify(route.styleImports, null, 2)
        };`,
      ].join('\n');
    },
  };
}
