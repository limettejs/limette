import { App, fsRoutes, staticFiles } from '@limette/core';

export const app = new App();

app.use(staticFiles);

fsRoutes(app, {
  loadFile: (path: string) => import(`./${path}`),
});

if (import.meta.main) {
  const { serve } = await import('@limette/core/deno');
  await serve(app);
}
