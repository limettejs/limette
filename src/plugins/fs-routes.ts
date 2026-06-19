import type { App } from '../server/app.ts';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { pathToFileURL } from 'node:url';

export interface FsRoutesViteOptions {
  root?: string;
  outDir?: string;
  base?: string;
  devServerOrigin?: string;
  manifestPath?: string;
  serveAssets?: boolean;
}

export interface FsRoutesPluginOptions {
  enabled?: boolean;
  loadFile?: (path: string) => Promise<unknown>;
  vite?: FsRoutesViteOptions;
}

function defaultLoadFile(root = cwd()) {
  return (path: string) => import(pathToFileURL(resolve(root, path)).href);
}

export function fsRoutes(app: App, options: FsRoutesPluginOptions = {}) {
  app._setBuiltinPluginOptions('fsRoutes', {
    enabled: true,
    loadFile: options.loadFile ?? defaultLoadFile(options.vite?.root),
    vite: options.vite ?? {},
  });
}
