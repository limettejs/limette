import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverRoutes } from './manifest.ts';
import {
  incomingMessageToRequest,
  writeResponseToServerResponse,
} from './node-adapter.ts';
import { setFsRoutes } from '../server/fs.ts';
import type { DiscoverRoutesOptions } from './manifest.ts';
import type { App } from '../server/app.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';

type ViteDevServerLike = {
  middlewares: {
    use: (handler: (...args: unknown[]) => void | Promise<void>) => void;
  };
  transformRequest: (url: string) => Promise<{ code: string } | null>;
};

const ROUTES_MODULE_ID = 'virtual:limette/routes';
const RESOLVED_ROUTES_MODULE_ID = `\0${ROUTES_MODULE_ID}`;
const CLIENT_ENTRY_MODULE_PREFIX = 'virtual:limette/client-entry/';
const RESOLVED_CLIENT_ENTRY_MODULE_PREFIX = `\0${CLIENT_ENTRY_MODULE_PREFIX}`;
const CLIENT_ENTRY_DEV_PREFIX = '/@limette/client-entry/';

export type LimetteVitePluginOptions = DiscoverRoutesOptions & {
  dev?: {
    app?: App;
    appModule?: string;
    appExport?: string;
    loadApp?: () => App | Promise<App>;
  };
};

export function clientEntryDevPath(routeId: string) {
  return `${CLIENT_ENTRY_DEV_PREFIX}${routeId}.js`;
}

async function loadAppModule(
  root: string,
  appModule: string,
  appExport = 'app',
) {
  const url = pathToFileURL(resolve(root, appModule)).href;
  const module = await import(url) as Record<string, unknown>;
  const app = module[appExport];

  if (!app) {
    throw new Error(
      `Expected Limette app export "${appExport}" in ${appModule}.`,
    );
  }

  return app as App;
}

export function limette(options: LimetteVitePluginOptions = {}) {
  let root = options.root ?? process.cwd();
  let devHandler:
    | Promise<
      (request: Request, info: unknown) => Response | Promise<Response>
    >
    | undefined;

  async function getDevHandler() {
    if (!options.dev?.app && !options.dev?.appModule && !options.dev?.loadApp) {
      return undefined;
    }

    devHandler ??= (async () => {
      const app = options.dev!.app ?? await options.dev!.loadApp?.() ??
        await loadAppModule(
          root,
          options.dev!.appModule!,
          options.dev!.appExport,
        );
      app.config.mode = 'development';
      await setFsRoutes(app);

      return app.handler();
    })();

    return await devHandler;
  }

  return {
    name: 'limette',
    config() {
      return {
        resolve: {
          alias: [
            {
              find: /^lit$/,
              replacement: resolve(root, 'node_modules/lit/index.js'),
            },
            {
              find: /^lit\/(.*)$/,
              replacement: resolve(root, 'node_modules/lit/$1'),
            },
            {
              find: /^@lit-labs\/ssr-client$/,
              replacement: resolve(
                root,
                'node_modules/@lit-labs/ssr-client/index.js',
              ),
            },
            {
              find: /^@lit-labs\/ssr-client\/(.*)$/,
              replacement: resolve(
                root,
                'node_modules/@lit-labs/ssr-client/$1',
              ),
            },
          ],
        },
      };
    },
    configResolved(config: { root: string }) {
      root = options.root ?? config.root;
    },
    configureServer(server: ViteDevServerLike) {
      server.middlewares.use(async (...args) => {
        const [req, res, next] = args as [
          { url?: string },
          {
            statusCode: number;
            setHeader: (name: string, value: string) => void;
            end: (body?: string) => void;
          },
          () => void,
        ];
        const url = new URL(req.url ?? '/', 'http://localhost');

        if (!url.pathname.startsWith(CLIENT_ENTRY_DEV_PREFIX)) {
          next();
          return;
        }

        const routeId = decodeURIComponent(
          url.pathname
            .slice(CLIENT_ENTRY_DEV_PREFIX.length)
            .replace(/\.js$/, ''),
        );
        const result = await server.transformRequest(
          `${CLIENT_ENTRY_MODULE_PREFIX}${routeId}`,
        );

        if (!result) {
          res.statusCode = 404;
          res.end();
          return;
        }

        res.setHeader('Content-Type', 'application/javascript');
        res.end(`import "/@vite/client";\n${result.code}`);
      });

      if (
        !options.dev?.app && !options.dev?.appModule && !options.dev?.loadApp
      ) {
        return;
      }

      return () => {
        server.middlewares.use(
          async (...args) => {
            const [req, res, next] = args as [
              IncomingMessage,
              ServerResponse,
              () => void,
            ];
            const handler = await getDevHandler();
            if (!handler) {
              next();
              return;
            }

            const request = await incomingMessageToRequest(req);
            const response = await handler(request, {});
            await writeResponseToServerResponse(response, res);
          },
        );
      };
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
