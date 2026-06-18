import { Builder } from '../src/dev/mod.ts';
import { serve } from '../src/node.ts';
import { app } from './main.ts';

const port = 5180;

await new Builder().build(app);

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
