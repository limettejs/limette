import { serve } from '../deno.ts';
import type { ServeOptions } from '../deno.ts';
import type { App } from '../server/app.ts';
import { refreshMiddleware } from './refresh-middleware.ts';
import { buildViteClient } from '../vite/build.ts';
import {
  startViteDevServer,
  waitForViteDevServer,
} from '../vite/dev-server.ts';

export interface BuilderOptions {
  target?: string | string[];
}

export class Builder {
  options: BuilderOptions;

  constructor(options?: BuilderOptions) {
    this.options = {
      target: options?.target ?? ['chrome99', 'firefox99', 'safari15'],
    };
  }

  #viteOptions(app: App) {
    const vite = app.builtinPluginOptions.fsRoutes.vite;
    return vite ?? {};
  }

  #usesVite(app: App) {
    return app.builtinPluginOptions.fsRoutes.enabled === true;
  }

  async build(app: App): Promise<void> {
    const t0 = performance.now();

    const viteOptions = this.#viteOptions(app);

    if (!this.#usesVite(app)) {
      throw new Error('Builder.build() requires fsRoutes() with Vite enabled.');
    }

    await buildViteClient({
      root: viteOptions.root,
      outDir: viteOptions.outDir,
      base: viteOptions.base,
      configFile: viteOptions.configFile,
      mode: viteOptions.mode,
      viteSpecifier: viteOptions.viteSpecifier,
    });

    const t1 = performance.now();
    console.log(`Build done. (${((t1 - t0) / 1000).toFixed(2)}s)`);
    return;
  }

  async listen(app: App, options?: ServeOptions) {
    app.config.mode = 'development';

    app.builder = this;

    if (this.#usesVite(app)) {
      const fsRoutesOptions = app.builtinPluginOptions.fsRoutes;
      const viteOptions = this.#viteOptions(app);
      const viteDevServer = viteOptions.startDevServer === false
        ? undefined
        : startViteDevServer({
          root: viteOptions.root,
          configFile: viteOptions.configFile,
          devServerOrigin: viteOptions.devServerOrigin,
          devServerHost: viteOptions.devServerHost,
          devServerPort: viteOptions.devServerPort,
          logLevel: viteOptions.logLevel,
          mode: viteOptions.mode,
          startupTimeoutMs: viteOptions.startupTimeoutMs,
          strictPort: viteOptions.strictPort,
          viteSpecifier: viteOptions.viteSpecifier,
        });

      if (viteDevServer) {
        try {
          await waitForViteDevServer(viteDevServer, {
            timeoutMs: viteOptions.startupTimeoutMs,
          });
        } catch (error) {
          await viteDevServer.close();
          throw error;
        }
      }

      app._setBuiltinPluginOptions('fsRoutes', {
        ...fsRoutesOptions,
        vite: {
          ...viteOptions,
          devServerOrigin: viteOptions.devServerOrigin ??
            viteDevServer?.origin,
        },
      });

      if (viteDevServer) {
        const close = () => {
          void viteDevServer.close();
        };
        Deno.addSignalListener('SIGINT', close);
        Deno.addSignalListener('SIGTERM', close);
        globalThis.addEventListener('unload', close);
      }
    }

    // For dev mode, use the refresh middleware
    app.use(refreshMiddleware);

    await serve(app, options);
  }
}
