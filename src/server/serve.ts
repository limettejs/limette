import { setFsRoutes } from './fs.ts';
import { staticBuildMiddleware } from './static-files.ts';
import type { App } from './app.ts';

const preparedApps = new WeakSet<App>();

export async function prepareApp(app: App) {
  if (preparedApps.has(app)) return;

  if (app.config.mode === 'production') {
    app.get('/_limette/*', staticBuildMiddleware);
  }

  if (app.builtinPluginOptions.fsRoutes?.enabled === true) {
    await setFsRoutes(app);
  }

  preparedApps.add(app);
}
