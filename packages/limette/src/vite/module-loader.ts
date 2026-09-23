import { relative, resolve, sep } from 'node:path';
import type { ViteDevServerLike } from './types.ts';

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

export function loadServerModule(
  server: ViteDevServerLike,
  root: string,
  path: string,
  version?: number,
) {
  return server.ssrLoadModule(viteRootModuleUrl(root, path, version));
}
