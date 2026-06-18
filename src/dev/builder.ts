import { Spinner } from '@std/cli/unstable-spinner';
import type { App, ListenOptions } from '../server/app.ts';
import { build } from './build.ts';
import { refreshMiddleware } from './refresh-middleware.ts';
import { buildViteClient } from '../vite/build.ts';

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

  async build(app: App): Promise<void> {
    const t0 = performance.now();
    const spinner = new Spinner({ message: 'Building...', color: 'blue' });
    spinner.start();

    const vite = app.builtinPluginOptions.fsRoutes.vite;
    const viteOptions = typeof vite === 'object' ? vite : {};
    const useVite = vite === true || viteOptions.enabled === true;

    if (useVite) {
      await buildViteClient({
        root: viteOptions.root,
        outDir: viteOptions.outDir,
        base: viteOptions.base,
        configFile: viteOptions.configFile,
        mode: viteOptions.mode,
        viteSpecifier: viteOptions.viteSpecifier,
      });
    } else {
      await build(app, { target: this.options.target });
    }

    const t1 = performance.now();
    spinner.stop();
    console.log(`✅ Build done. (${((t1 - t0) / 1000).toFixed(2)}s)`);
    return;
  }

  listen(app: App, options?: ListenOptions) {
    app.config.mode = 'development';

    app.builder = this;

    // For dev mode, use the refresh middleware
    app.use(refreshMiddleware);

    app.listen(options);
  }
}
