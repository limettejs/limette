import { fileURLToPath } from 'node:url';
import { viteCommand } from './_vite-command.ts';

const fixtureRoot = fileURLToPath(
  new URL('../fixtures/server-build/', import.meta.url),
);
const port = 5180;
const origin = `http://127.0.0.1:${port}`;
const command = viteCommand([
  '--config',
  `${fixtureRoot}/vite.config.ts`,
  '--base',
  '/',
  '--host',
  '127.0.0.1',
  '--port',
  String(port),
  '--strictPort',
  '--logLevel',
  'error',
], {
  cwd: fixtureRoot,
  stdout: 'null',
  stderr: 'piped',
});
const child = command.spawn();
const stderr = new Response(child.stderr).text();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForPage(path: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${origin}${path}`);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Vite CSS fixture did not become ready: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

try {
  const aboutHtml = await (await waitForPage('/about')).text();
  const styleUrls = [...aboutHtml.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
    .map((match) => match[1]);
  assert(
    !aboutHtml.includes('<script type="module"'),
    'CSS-only development route unexpectedly received a client script.',
  );
  for (
    const path of [
      '/styles/app.css',
      '/styles/layout.css',
      '/styles/shared.css',
      '/styles/about.css',
    ]
  ) {
    const styleUrl = `${path}?direct`;
    assert(styleUrls.includes(styleUrl), `Development HTML lost ${styleUrl}.`);
    const response = await fetch(`${origin}${styleUrl}`);
    assert(
      response.ok &&
        (response.headers.get('content-type') ?? '').includes('text/css'),
      `Vite did not serve ${path} as CSS.`,
    );
  }

  const homeHtml = await (await fetch(`${origin}/`)).text();
  const entryPath = homeHtml.match(
    /<script type="module" src="([^"]+)"/,
  )?.[1];
  assert(
    entryPath?.startsWith('/@limette/client-entry/'),
    'Island development route lost its client entry.',
  );
  const entryCode = await (await fetch(`${origin}${entryPath}`)).text();
  for (
    const expected of [
      '/styles/app.css',
      '/styles/layout.css',
      '/styles/shared.css',
      '/styles/home.css',
      '/islands/counter.ts',
    ]
  ) {
    assert(entryCode.includes(expected), `Development entry lost ${expected}.`);
  }
} finally {
  try {
    child.kill('SIGTERM');
  } catch {
    // The process may already have exited after a startup error.
  }
  await child.status;
  const errors = await stderr;
  if (errors) console.error(errors);
}
