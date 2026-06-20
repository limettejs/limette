import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ViteDevServerLike } from './types.ts';

const IS_DENO = typeof Deno !== 'undefined';

function normalizePath(path: string) {
  return path.split(sep).join('/');
}

export function viteRootModuleUrl(
  root: string,
  path: string,
  version?: number,
) {
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

export function loadServerModule(
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
