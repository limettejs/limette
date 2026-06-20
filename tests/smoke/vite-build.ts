import { App } from '../../src/mod.ts';
import { setFsRoutes } from '../../src/server/fs.ts';
import { exampleRoot } from './_paths.ts';
import { viteCommand } from './_vite-command.ts';

const outDir = '.vite-limette-builder-client';
const app = new App().fsRoutes({
  vite: {
    root: exampleRoot,
    outDir,
  },
});

const command = viteCommand([
  '--config',
  'vite.config.ts',
  'build',
  '--outDir',
  outDir,
]);
const output = await command.output();

if (!output.success) {
  throw new Error(new TextDecoder().decode(output.stderr));
}

await setFsRoutes(app);

const response = await app.handler()(
  new Request('http://localhost/'),
);
const html = await response.text();

if (response.status !== 200) {
  throw new Error(`Expected the page to render, got ${response.status}.`);
}

if (!html.includes('/assets/limette-route-')) {
  throw new Error('Expected Vite build to generate client assets.');
}
