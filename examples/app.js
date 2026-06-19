import { App, staticFiles } from '@limette/core';

export const app = new App()
  .use(staticFiles)
  .fsRoutes();
