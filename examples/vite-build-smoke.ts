import { App, fsRoutes } from '../src/mod.ts';
import { Builder } from '../src/dev/mod.ts';
import { setFsRoutes } from '../src/server/fs.ts';

const outDir = '.vite-limette-builder-client';
const app = new App();

fsRoutes(app, {
  loadFile: (path: string) => import(`./${path}`),
  vite: {
    outDir,
  },
});

const builder = new Builder();
await builder.build(app);
await setFsRoutes(app);

const response = await app.handler()(
  new Request('http://localhost/'),
);
const html = await response.text();

if (response.status !== 200) {
  throw new Error(`Expected the page to render, got ${response.status}.`);
}

if (!html.includes('/assets/limette-route-')) {
  throw new Error('Expected Builder.build() to generate Vite client assets.');
}
