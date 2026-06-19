import { fileURLToPath } from 'node:url';
import { App, staticFiles } from '@limette/core';

const root = fileURLToPath(new URL('.', import.meta.url));

export const app = new App()
  .use(staticFiles)
  .fsRoutes({ vite: { root } });
