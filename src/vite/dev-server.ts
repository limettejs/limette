import { isAbsolute, relative, resolve } from 'node:path';
import {
  incomingMessageToRequest,
  writeResponseToServerResponse,
} from './node-adapter.ts';
import { loadServerModule } from './module-loader.ts';
import { setFsRoutes } from '../server/fs.ts';
import type { DiscoverRoutesOptions } from './manifest.ts';
import type { App } from '../server/app.ts';
import type { HotUpdateContextLike, ViteDevServerLike } from './types.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type LimetteDevOptions = DiscoverRoutesOptions & {
  dev?: {
    app?: App;
    appModule?: string;
    appExport?: string;
    loadApp?: () => App | Promise<App>;
  };
};

function isInsidePath(parent: string, child: string) {
  const relativePath = relative(parent, child);
  return relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath));
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

export function createLimetteDevServer(options: LimetteDevOptions = {}) {
  let root = options.root ?? process.cwd();
  let devHandler:
    | Promise<
      (request: Request, info: unknown) => Response | Promise<Response>
    >
    | undefined;

  const hasDevApp = () =>
    Boolean(options.dev?.app || options.dev?.appModule || options.dev?.loadApp);

  function setRoot(nextRoot: string) {
    root = options.root ?? nextRoot;
  }

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
      loadFile: (path) => loadServerModule(server, root, path, version),
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

  function configure(server: ViteDevServerLike) {
    const reloadChangedServerFile = (file: string) => {
      if (hasDevApp() && isServerFile(file)) {
        sendFullReload(server);
      }
    };

    server.watcher.on('add', reloadChangedServerFile);
    server.watcher.on('unlink', reloadChangedServerFile);

    if (!hasDevApp()) {
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
  }

  function handleHotUpdate(ctx: HotUpdateContextLike) {
    if (!hasDevApp() || !isServerFile(ctx.file)) {
      return;
    }

    sendFullReload(ctx.server);

    return [];
  }

  return {
    configure,
    handleHotUpdate,
    setRoot,
  };
}
