import { serve } from '../../src/node.ts';
import { app } from '../../examples/app.js';
import { viteCommand } from './_vite-command.ts';

const port = 5180;

const command = viteCommand([
  '--config',
  'vite.config.ts',
  'build',
]);
const output = await command.output();

if (!output.success) {
  throw new Error(new TextDecoder().decode(output.stderr));
}

const server = await serve(app, { port, hostname: '127.0.0.1' });

try {
  const origin = `http://127.0.0.1:${port}`;
  const pageResponse = await fetch(`${origin}/`);

  if (!pageResponse.ok) {
    throw new Error(`Expected page to render, got ${pageResponse.status}.`);
  }

  const html = await pageResponse.text();
  const scriptPath = html.match(/<script type="module" src="([^"]+)"/)?.[1];

  if (!scriptPath?.startsWith('/assets/limette-route-')) {
    throw new Error('Expected SSR output to include a Vite route script.');
  }

  const assetResponse = await fetch(`${origin}${scriptPath}`);

  if (!assetResponse.ok) {
    throw new Error(
      `Expected Vite asset to load, got ${assetResponse.status}.`,
    );
  }
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
