import { App, fsRoutes } from '../src/mod.ts';
import { setFsRoutes } from '../src/server/fs.ts';

const app = new App();

fsRoutes(app, {
  loadFile: (path: string) => import(`./${path}`),
  vite: {
    enabled: true,
    outDir: '.vite-limette-client',
  },
});

await setFsRoutes(app);

const handler = app.handler();
const info = {} as Deno.ServeHandlerInfo;
const pageResponse = await handler(new Request('http://localhost/'), info);
const html = await pageResponse.text();

if (pageResponse.status !== 200) {
  throw new Error(`Expected the page to render, got ${pageResponse.status}.`);
}

const scriptPath = html.match(/<script type="module" src="([^"]+)"/)?.[1];

if (!scriptPath?.startsWith('/assets/limette-route-')) {
  throw new Error('Expected SSR output to include a Vite route script.');
}

const assetResponse = await handler(
  new Request(`http://localhost${scriptPath}`),
  info,
);
const assetContent = await assetResponse.text();

if (assetResponse.status !== 200) {
  throw new Error(
    `Expected the Vite route asset to be served, got ${assetResponse.status}.`,
  );
}

if (
  !assetResponse.headers.get('content-type')?.includes('javascript') ||
  assetContent.length === 0
) {
  throw new Error('Expected the Vite route asset to be served as JavaScript.');
}
