import { App } from '../src/mod.ts';
import { setFsRoutes } from '../src/server/fs.ts';

const outDir = '.vite-limette-builder-client';
const app = new App().fsRoutes({
  vite: {
    outDir,
  },
});

const command = new Deno.Command(Deno.execPath(), {
  args: [
    'run',
    '-A',
    'npm:vite@^8.0.0',
    '--config',
    'vite.config.ts',
    'build',
    '--outDir',
    outDir,
  ],
  stdout: 'null',
  stderr: 'piped',
});
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
