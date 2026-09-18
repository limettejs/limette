import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteCommand } from './_vite-command.ts';

const fixtureRoot = fileURLToPath(
  new URL('../fixtures/server-build/', import.meta.url),
);
const islandPath = join(fixtureRoot, 'islands/status.ts');
const originalIsland = await Deno.readTextFile(islandPath);
const islandCssPath = join(fixtureRoot, 'islands/status.css');
const originalIslandCss = await Deno.readTextFile(islandCssPath);
const before = 'Status</p>';
const after = 'Status changed by Vite island refresh</p>';
const changedIsland = originalIsland.replace(before, after);
const changedIslandCss = originalIslandCss.replace(
  'fixture-source: status-island',
  'fixture-source: status-island-hmr',
);
const port = 5181;
const origin = `http://127.0.0.1:${port}`;
const command = viteCommand([
  '--config',
  join(fixtureRoot, 'vite.config.ts'),
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
let socket: WebSocket | undefined;
let islandChanged = false;
let islandCssChanged = false;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForPage(expected: string) {
  let lastStatus = 0;
  let lastHtml = '';

  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${origin}/`);
      lastStatus = response.status;
      lastHtml = await response.text();
      if (response.ok && lastHtml.includes(expected)) return lastHtml;
    } catch {
      // The server may still be starting or rebuilding.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Vite dev did not render ${JSON.stringify(expected)}; ` +
      `last status=${lastStatus}, body=${lastHtml.slice(0, 200)}`,
  );
}

function islandShadow(html: string) {
  const match = html.match(
    /<test-status[^>]*>([\s\S]*?)<\/test-status>/,
  );
  assert(match, 'The SSR island shadow root was not rendered.');
  return match[1];
}

function islandStyleUrls(html: string) {
  return [...islandShadow(html).matchAll(/@import url\("([^"]+)"\)/g)]
    .map((match) => match[1]);
}

try {
  const initialHtml = await waitForPage(before);
  assert(
    (initialHtml.match(/src="\/@vite\/client"/g) ?? []).length === 1,
    'The island route did not load exactly one Vite client.',
  );
  const initialIslandStyles = islandStyleUrls(initialHtml);
  assert(
    initialIslandStyles.includes('/islands/status.css?direct') &&
      initialIslandStyles.includes('/islands/shared.css?direct'),
    'The SSR island shadow root did not include all island CSS dependencies.',
  );
  assert(
    !islandShadow(initialHtml).includes('/styles/home.css'),
    'Route CSS leaked into the island shadow root.',
  );
  const clientEntry = initialHtml.match(
    /<script type="module" src="([^" ]*\/@limette\/client-entry\/[^"]+)"/,
  )?.[1];
  assert(clientEntry, 'The island route did not emit a Vite client entry.');

  const entryResponse = await fetch(`${origin}${clientEntry}`);
  assert(entryResponse.ok, 'The Vite island client entry did not load.');
  assert(
    !(await entryResponse.text()).includes('/@vite/client'),
    'The island entry retained a duplicate Vite client import.',
  );
  const islandResponse = await fetch(`${origin}/islands/status.ts`);
  assert(islandResponse.ok, 'The island client module did not load.');
  await islandResponse.text();
  for (const styleUrl of initialIslandStyles) {
    const styleResponse = await fetch(`${origin}${styleUrl}`);
    assert(
      styleResponse.ok &&
        (styleResponse.headers.get('content-type') ?? '').includes('text/css'),
      `Vite did not serve island CSS ${styleUrl}.`,
    );
    await styleResponse.text();
  }

  const viteClient = await (await fetch(`${origin}/@vite/client`)).text();
  const token = viteClient.match(/const wsToken = "([^"]+)"/)?.[1];
  const hmrBase = viteClient.match(/const hmrBase = "([^"]+)"/)?.[1] ?? '/';
  assert(token, 'Could not read the Vite HMR websocket token.');

  let resolveFullReload!: () => void;
  const fullReload = new Promise<void>((resolve) => {
    resolveFullReload = resolve;
  });
  let resolveCssUpdate!: () => void;
  const cssUpdate = new Promise<void>((resolve) => {
    resolveCssUpdate = resolve;
  });
  socket = new WebSocket(
    `ws://127.0.0.1:${port}${hmrBase}?token=${token}`,
    'vite-hmr',
  );
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as {
      type?: string;
      updates?: Array<{ path?: string; acceptedPath?: string }>;
    };
    if (message.type === 'full-reload') resolveFullReload();
    if (
      message.type === 'update' &&
      message.updates?.some((update) =>
        update.path?.includes('/islands/status.css') ||
        update.acceptedPath?.includes('/islands/status.css')
      )
    ) {
      resolveCssUpdate();
    }
  };
  await new Promise<void>((resolve, reject) => {
    socket!.onopen = () => resolve();
    socket!.onerror = () => reject(new Error('Vite HMR websocket failed.'));
  });

  assert(
    changedIslandCss !== originalIslandCss,
    'Island CSS refresh fixture did not change.',
  );
  await Deno.writeTextFile(islandCssPath, changedIslandCss);
  islandCssChanged = true;
  let updatedCss = '';
  for (let attempt = 0; attempt < 50; attempt++) {
    updatedCss = await (
      await fetch(`${origin}/islands/status.css?direct`)
    ).text();
    if (updatedCss.includes('status-island-hmr')) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(
    updatedCss.includes('status-island-hmr'),
    'Vite continued serving stale island CSS.',
  );
  await Promise.race([
    cssUpdate,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error('The island CSS edit did not emit an HMR update.')),
        5_000,
      )
    ),
  ]);
  const cssUpdatedHtml = await waitForPage(before);
  assert(
    JSON.stringify(islandStyleUrls(cssUpdatedHtml)) ===
      JSON.stringify(initialIslandStyles),
    'SSR changed or lost its island-specific CSS URLs after a CSS edit.',
  );
  assert(
    !islandShadow(cssUpdatedHtml).includes('/styles/home.css'),
    'Route CSS entered the island shadow root after a CSS edit.',
  );

  assert(
    changedIsland !== originalIsland,
    'Island refresh fixture did not change.',
  );
  await Deno.writeTextFile(islandPath, changedIsland);
  islandChanged = true;

  const updatedHtml = await waitForPage(after);
  assert(
    !updatedHtml.includes(before),
    'SSR retained the previous island constructor after its module changed.',
  );
  await Promise.race([
    fullReload,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error('The island update did not trigger a full reload.')),
        5_000,
      )
    ),
  ]);
} finally {
  if (islandChanged) await Deno.writeTextFile(islandPath, originalIsland);
  if (islandCssChanged) {
    await Deno.writeTextFile(islandCssPath, originalIslandCss);
  }
  socket?.close();
  try {
    child.kill('SIGTERM');
  } catch {
    // The process may already have exited.
  }
  await child.status;
  const errors = await stderr;
  if (errors) console.error(errors);
}
