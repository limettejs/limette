export type ViteDevServerLike = {
  middlewares: {
    use: (handler: (...args: unknown[]) => void | Promise<void>) => void;
  };
  moduleGraph?: {
    invalidateAll?: () => void;
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
