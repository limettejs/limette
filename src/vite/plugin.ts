import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
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
  moduleGraph?: {
    invalidateAll?: () => void;
  };
  ssrLoadModule: (url: string) => Promise<Record<string, unknown>>;
  transformRequest: (url: string) => Promise<{ code: string } | null>;
  watcher: {
    on: (event: 'add' | 'unlink', listener: (file: string) => void) => void;
  };
  ws: {
    send: (payload: { type: 'full-reload' }) => void;
  };
};

type HotUpdateContextLike = {
  file: string;
  server: ViteDevServerLike;
};

const ROUTES_MODULE_ID = 'virtual:limette/routes';
const RESOLVED_ROUTES_MODULE_ID = `\0${ROUTES_MODULE_ID}`;
const CLIENT_ENTRY_MODULE_PREFIX = 'virtual:limette/client-entry/';
const RESOLVED_CLIENT_ENTRY_MODULE_PREFIX = `\0${CLIENT_ENTRY_MODULE_PREFIX}`;
const CLIENT_ENTRY_DEV_PREFIX = '/@limette/client-entry/';
const IS_DENO = typeof Deno !== 'undefined';

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

function normalizePath(path: string) {
  return path.split(sep).join('/');
}

function isInsidePath(parent: string, child: string) {
  const relativePath = relative(parent, child);
  return relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function viteRootModuleUrl(root: string, path: string, version?: number) {
  const absolutePath = resolve(root, path);
  const relativePath = normalizePath(relative(root, absolutePath));
  const search = version === undefined ? '' : `?lmt=${version}`;

  if (relativePath.startsWith('..')) {
    return `/@fs/${normalizePath(absolutePath)}${search}`;
  }

  return `/${relativePath}${search}`;
}

function nativeModuleUrl(root: string, path: string, version?: number) {
  const url = pathToFileURL(resolve(root, path));
  if (version !== undefined) {
    url.searchParams.set('lmt', String(version));
  }
  return url.href;
}

function packageName(specifier: string) {
  const segments = specifier.split('/');
  return specifier.startsWith('@')
    ? `${segments[0]}/${segments[1]}`
    : segments[0];
}

function packageSubpath(specifier: string) {
  const name = packageName(specifier);
  return specifier.slice(name.length).replace(/^\/+/, '');
}

function denoNodeModulePath(root: string, specifier: string) {
  const name = packageName(specifier);
  const subpath = packageSubpath(specifier);
  return resolve(
    root,
    'node_modules/.deno/node_modules',
    name,
    subpath,
  );
}

function resolveFromRoot(root: string, specifier: string) {
  const require = createRequire(resolve(root, 'package.json'));

  try {
    return require.resolve(specifier);
  } catch {
    return denoNodeModulePath(root, specifier);
  }
}

function findPackageRoot(path: string) {
  if (existsSync(resolve(path, 'package.json'))) {
    return path;
  }

  let current = dirname(path);

  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'package.json'))) {
      return current;
    }

    current = dirname(current);
  }

  return dirname(path);
}

function packageRootFromRoot(root: string, specifier: string) {
  const name = packageName(specifier);
  const require = createRequire(resolve(root, 'package.json'));

  try {
    const packageJsonPath = require.resolve(`${name}/package.json`);
    return packageJsonPath.slice(0, -'/package.json'.length);
  } catch {
    try {
      return findPackageRoot(resolveFromRoot(root, name));
    } catch {
      return denoNodeModulePath(root, name);
    }
  }
}

function loadServerModule(
  server: ViteDevServerLike,
  root: string,
  path: string,
  version?: number,
) {
  if (IS_DENO) {
    return import(nativeModuleUrl(root, path, version)) as Promise<
      Record<string, unknown>
    >;
  }

  return server.ssrLoadModule(viteRootModuleUrl(root, path, version));
}

async function loadAppModule(
  server: ViteDevServerLike,
  root: string,
  appModule: string,
  appExport = 'app',
  version?: number,
) {
  const module = await loadServerModule(server, root, appModule, version);
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

  const hasDevApp = () =>
    Boolean(options.dev?.app || options.dev?.appModule || options.dev?.loadApp);

  function invalidateDevHandler() {
    if (!options.dev?.app) {
      devHandler = undefined;
    }
  }

  function isServerFile(file: string) {
    const absoluteFile = resolve(file);
    const routesPath = resolve(root, options.routesDir ?? 'routes');
    const appModulePath = options.dev?.appModule
      ? resolve(root, options.dev.appModule)
      : undefined;

    return isInsidePath(routesPath, absoluteFile) ||
      (appModulePath ? absoluteFile === appModulePath : false);
  }

  function sendFullReload(server: ViteDevServerLike) {
    invalidateDevHandler();
    server.moduleGraph?.invalidateAll?.();
    server.ws.send({ type: 'full-reload' });
  }

  async function createDevHandler(server: ViteDevServerLike) {
    const version = Date.now();
    const app = options.dev!.app ?? await options.dev!.loadApp?.() ??
      await loadAppModule(
        server,
        root,
        options.dev!.appModule!,
        options.dev!.appExport,
        version,
      );
    const fsRoutesOptions = app.builtinPluginOptions.fsRoutes;
    app.config.mode = 'development';
    app._setBuiltinPluginOptions('fsRoutes', {
      ...fsRoutesOptions,
      loadFile: (path) =>
        loadServerModule(server, root, path, version),
      vite: {
        ...fsRoutesOptions.vite,
        devTagNameSuffix: String(version),
        root: fsRoutesOptions.vite?.root ?? root,
      },
    });
    await setFsRoutes(app);

    return app.handler();
  }

  async function getDevHandler(server: ViteDevServerLike) {
    if (!options.dev?.app) {
      return await createDevHandler(server);
    }

    devHandler ??= createDevHandler(server);

    return await devHandler;
  }

  return {
    name: 'limette',
    config() {
      const litRoot = packageRootFromRoot(root, 'lit');
      const litHtmlRoot = packageRootFromRoot(root, 'lit-html');
      const litElementRoot = packageRootFromRoot(root, 'lit-element');
      const reactiveElementRoot = packageRootFromRoot(
        root,
        '@lit/reactive-element',
      );
      const ssrRoot = packageRootFromRoot(root, '@lit-labs/ssr');
      const ssrClientRoot = packageRootFromRoot(root, '@lit-labs/ssr-client');
      const ssrDomShimRoot = packageRootFromRoot(
        root,
        '@lit-labs/ssr-dom-shim',
      );

      return {
        resolve: {
          alias: [
            {
              find: /^lit$/,
              replacement: resolveFromRoot(root, 'lit'),
            },
            {
              find: /^lit\/(.*)$/,
              replacement: `${litRoot}/$1`,
            },
            {
              find: /^lit-html$/,
              replacement: resolveFromRoot(root, 'lit-html'),
            },
            {
              find: /^lit-html\/(.*)$/,
              replacement: `${litHtmlRoot}/$1`,
            },
            {
              find: /^lit-element$/,
              replacement: resolveFromRoot(root, 'lit-element'),
            },
            {
              find: /^lit-element\/(.*)$/,
              replacement: `${litElementRoot}/$1`,
            },
            {
              find: /^@lit\/reactive-element$/,
              replacement: resolveFromRoot(root, '@lit/reactive-element'),
            },
            {
              find: /^@lit\/reactive-element\/(.*)$/,
              replacement: `${reactiveElementRoot}/$1`,
            },
            {
              find: /^@lit-labs\/ssr$/,
              replacement: resolveFromRoot(root, '@lit-labs/ssr'),
            },
            {
              find: /^@lit-labs\/ssr\/(.*)$/,
              replacement: `${ssrRoot}/$1`,
            },
            {
              find: /^@lit-labs\/ssr-client$/,
              replacement: resolveFromRoot(root, '@lit-labs/ssr-client'),
            },
            {
              find: /^@lit-labs\/ssr-client\/(.*)$/,
              replacement: `${ssrClientRoot}/$1`,
            },
            {
              find: /^@lit-labs\/ssr-dom-shim$/,
              replacement: resolveFromRoot(root, '@lit-labs/ssr-dom-shim'),
            },
            {
              find: /^@lit-labs\/ssr-dom-shim\/(.*)$/,
              replacement: `${ssrDomShimRoot}/$1`,
            },
          ],
          dedupe: [
            '@lit-labs/ssr',
            '@lit-labs/ssr-client',
            '@lit/reactive-element',
            'lit',
            'lit-element',
            'lit-html',
          ],
        },
        ssr: {
          noExternal: [
            '@limette/core',
            '@lit-labs/ssr',
            '@lit-labs/ssr-client',
            '@lit/reactive-element',
            'lit',
            'lit-element',
            'lit-html',
            'parse5',
            '@parse5/tools',
            'entities',
          ],
        },
      };
    },
    configResolved(config: { root: string }) {
      root = options.root ?? config.root;
    },
    configureServer(server: ViteDevServerLike) {
      const reloadChangedServerFile = (file: string) => {
        if (hasDevApp() && isServerFile(file)) {
          sendFullReload(server);
        }
      };

      server.watcher.on('add', reloadChangedServerFile);
      server.watcher.on('unlink', reloadChangedServerFile);

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
            const handler = await getDevHandler(server);
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
    handleHotUpdate(ctx: HotUpdateContextLike) {
      if (!hasDevApp() || !isServerFile(ctx.file)) {
        return;
      }

      sendFullReload(ctx.server);

      return [];
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
