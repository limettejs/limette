import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { cwd } from 'node:process';
import type { Context } from './context.ts';

export interface StaticViteBuildMiddlewareOptions {
  outDir?: string;
  base?: string;
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

async function fileExists(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function safeFilePath(fsRoot: string, pathname: string) {
  let decodedPathname: string;

  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }

  const root = resolve(cwd(), fsRoot);
  const normalizedPathname = decodedPathname.replace(/^\/+/, '');
  const path = resolve(root, normalizedPathname);

  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    return undefined;
  }

  return path;
}

async function serveFile(request: Request, fsRoot: string, pathname: string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const path = safeFilePath(fsRoot, pathname);

  if (!path || !await fileExists(path)) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = new Headers();
  const contentType = CONTENT_TYPES[extname(path).toLowerCase()];
  if (contentType) headers.set('content-type', contentType);

  if (request.method === 'HEAD') {
    return new Response(null, { headers });
  }

  return new Response(new Uint8Array(await readFile(path)), { headers });
}

/**
 * Middleware to serve files from the static files.
 */
export async function staticFiles(ctx: Context): Promise<Response> {
  if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD') {
    return ctx.next();
  }

  const path = safeFilePath('static', ctx.url.pathname);

  if (path && await fileExists(path)) {
    return await serveFile(ctx.request, 'static', ctx.url.pathname);
  }

  return ctx.next();
}

export function staticBuildMiddleware(ctx: Context) {
  return serveFile(ctx.request, '.', ctx.url.pathname);
}

function normalizeBasePath(base = '/') {
  if (!base || base === '/') return '/';
  return `/${base.replace(/^\/+|\/+$/g, '')}/`;
}

export function staticViteBuildMiddleware(
  options: StaticViteBuildMiddlewareOptions = {},
) {
  const base = normalizeBasePath(options.base);
  const fsRoot = options.outDir ?? 'dist';

  return (ctx: Context) => {
    if (base === '/') {
      return serveFile(ctx.request, fsRoot, ctx.url.pathname);
    }

    const url = new URL(ctx.request.url);
    if (!url.pathname.startsWith(base)) {
      return ctx.next();
    }

    return serveFile(
      ctx.request,
      fsRoot,
      '/' + url.pathname.slice(base.length),
    );
  };
}
