import { join } from '@std/path';
import { exists } from '@std/fs';
import { serveDir } from '@std/http';
import type { Context } from './context.ts';

export interface StaticViteBuildMiddlewareOptions {
  outDir?: string;
  base?: string;
}

/**
 * Middleware to serve files from the static files.
 */
export async function staticFiles(ctx: Context): Promise<Response> {
  if (ctx.request.method.toLowerCase() !== 'get') {
    return ctx.next();
  }

  const path = join(Deno.cwd(), 'static', ctx.url.pathname);

  if (await exists(path, { isFile: true })) {
    return await serveDir(ctx.request, { fsRoot: 'static', quiet: true });
  }

  return ctx.next();
}

export function staticBuildMiddleware(ctx: Context) {
  return serveDir(ctx.request, { quiet: true });
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
      return serveDir(ctx.request, { fsRoot, quiet: true });
    }

    const url = new URL(ctx.request.url);
    if (!url.pathname.startsWith(base)) {
      return ctx.next();
    }

    url.pathname = '/' + url.pathname.slice(base.length);
    return serveDir(new Request(url, ctx.request), { fsRoot, quiet: true });
  };
}
