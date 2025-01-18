import { App, staticFiles, fsRoutes } from "@limette/core";

export const app = new App();

app.use(staticFiles);

fsRoutes(app, {
  loadFile: (path: string) => import(`./${path}`),
});

if (import.meta.main) {
  app.listen();
}
