import type { App } from '../server/app.ts';

export interface FsRoutesViteOptions {
  enabled?: boolean;
  root?: string;
  outDir?: string;
  base?: string;
  configFile?: string;
  manifestPath?: string;
  mode?: string;
  serveAssets?: boolean;
  viteSpecifier?: string;
}

export interface FsRoutesPluginOptions {
  enabled?: boolean;
  loadFile?: (path: string) => Promise<unknown>;
  vite?: boolean | FsRoutesViteOptions;
}

export function fsRoutes(app: App, options: FsRoutesPluginOptions) {
  if (typeof options?.loadFile !== 'function') {
    throw new Error('Option missing: loadFile.');
  }

  app._setBuiltinPluginOptions('fsRoutes', {
    enabled: true,
    loadFile: options.loadFile,
    vite: options.vite,
  });
}
