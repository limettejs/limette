export type ViteDevServerLike = {
  config?: {
    base: string;
  };
  middlewares: {
    use: (handler: (...args: unknown[]) => void | Promise<void>) => void;
  };
  moduleGraph?: {
    invalidateAll?: () => void;
  };
  pluginContainer?: {
    resolveId: (
      id: string,
      importer?: string,
      options?: { ssr?: boolean }
    ) => Promise<{
      id: string;
      external?: boolean | 'absolute' | 'relative';
    } | null>;
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

export type HotUpdateContextLike = {
  file: string;
  server: ViteDevServerLike;
};

export type PluginContextLike = {
  environment?: { name: string };
  emitFile?: (file: { type: 'chunk'; id: string; name: string }) => string;
  resolve: (id: string, importer?: string) => Promise<{ id: string } | null>;
};
