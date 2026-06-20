import type { ViteDevServerLike } from './types.ts';

export const CLIENT_ENTRY_MODULE_PREFIX = 'virtual:limette/client-entry/';
export const RESOLVED_CLIENT_ENTRY_MODULE_PREFIX =
  `\0${CLIENT_ENTRY_MODULE_PREFIX}`;
const CLIENT_ENTRY_DEV_PREFIX = '/@limette/client-entry/';

export function clientEntryDevPath(routeId: string) {
  return `${CLIENT_ENTRY_DEV_PREFIX}${routeId}.js`;
}

export function configureClientEntryMiddleware(server: ViteDevServerLike) {
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
}
