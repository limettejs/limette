import type { App } from '../server/app.ts';

export interface FsRoutesViteOptions {
  root?: string;
  outDir?: string;
  base?: string;
  configFile?: string;
  devServerOrigin?: string;
  devServerHost?: string;
  devServerPort?: number;
  logLevel?: 'info' | 'warn' | 'error' | 'silent';
  manifestPath?: string;
  mode?: string;
  serveAssets?: boolean;
  startDevServer?: boolean;
  startupTimeoutMs?: number;
  strictPort?: boolean;
  viteSpecifier?: string;
}

export interface FsRoutesPluginOptions {
  enabled?: boolean;
  loadFile?: (path: string) => Promise<unknown>;
  vite?: FsRoutesViteOptions;
}

export function fsRoutes(app: App, options: FsRoutesPluginOptions) {
  if (typeof options?.loadFile !== 'function') {
    throw new Error('Option missing: loadFile.');
  }

  app._setBuiltinPluginOptions('fsRoutes', {
    enabled: true,
    loadFile: options.loadFile,
    vite: options.vite ?? {},
  });
}
