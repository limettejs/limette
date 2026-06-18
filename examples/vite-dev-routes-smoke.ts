import { App, fsRoutes } from '../src/mod.ts';
import { setFsRoutes } from '../src/server/fs.ts';

const port = 5178;
const origin = `http://127.0.0.1:${port}`;
const app = new App({ mode: 'development' });

fsRoutes(app, {
  loadFile: (path: string) => import(`./${path}`),
  vite: {
    devServerOrigin: origin,
  },
});

await setFsRoutes(app);

const response = await app.handler()(
  new Request('http://localhost/'),
  {} as Deno.ServeHandlerInfo,
);
const html = await response.text();
const scriptPath = html.match(/<script type="module" src="([^"]+)"/)?.[1];

if (response.status !== 200) {
  throw new Error(`Expected the page to render, got ${response.status}.`);
}

if (!scriptPath?.startsWith(`${origin}/@limette/client-entry/`)) {
  throw new Error('Expected SSR output to include a Vite dev client entry.');
}

const command = new Deno.Command(Deno.execPath(), {
  args: [
    'run',
    '-A',
    'npm:vite@^8.0.0',
    '--config',
    'vite.config.ts',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  stdout: 'null',
  stderr: 'null',
});
const child = command.spawn();

try {
  let entryResponse: Response | undefined;
  let lastError: unknown;

  for (let i = 0; i < 40; i++) {
    try {
      entryResponse = await fetch(scriptPath);
      if (entryResponse.ok) break;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!entryResponse?.ok) {
    throw new Error(
      `Expected Vite dev server to serve the client entry. Last error: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }

  const code = await entryResponse.text();

  if (!code.includes('/@vite/client') || !code.includes('island-foo')) {
    throw new Error('Expected Vite dev entry to include HMR and island code.');
  }
} finally {
  try {
    child.kill('SIGTERM');
  } catch {
    // The process may already have exited if startup failed.
  }
  await child.status;
}
