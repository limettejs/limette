import { App, fsRoutes, serve, staticFiles } from '@limette/core';

export const app = new App();

app.use(staticFiles);

fsRoutes(app, {
  loadFile: (path) => import(`./${path}`),
});

const isMain = typeof Deno !== 'undefined'
  ? import.meta.main
  : typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], 'file:').href;

if (isMain) {
  await serve(app);
}
