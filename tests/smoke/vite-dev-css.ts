import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { viteCommand } from './_vite-command.ts';

const fixtureRoot = fileURLToPath(new URL('../fixtures/server-build/', import.meta.url));
const port = 5180;
const origin = `http://127.0.0.1:${port}`;
const cssPath = join(fixtureRoot, 'styles/about.css');
const routePath = join(fixtureRoot, 'routes/about.ts');
const layoutPath = join(fixtureRoot, 'routes/_layout.ts');
const originalCss = await Deno.readTextFile(cssPath);
const originalRoute = await Deno.readTextFile(routePath);
const originalLayout = await Deno.readTextFile(layoutPath);
const command = viteCommand(
  [
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
  ],
  {
    cwd: fixtureRoot,
    stdout: 'null',
    stderr: 'piped',
  }
);
const child = command.spawn();
const stderr = new Response(child.stderr).text();
let socket: WebSocket | undefined;
let cssChanged = false;
let routeChanged = false;
let layoutChanged = false;

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
    }`
  );
}

try {
  const aboutHtml = await (await waitForPage('/about')).text();
  const styleUrls = [...aboutHtml.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(
    (match) => match[1]
  );
  assert(
    (aboutHtml.match(/src="\/@vite\/client"/g) ?? []).length === 1,
    'CSS-only development route did not receive exactly one Vite client.'
  );
  assert(
    !aboutHtml.includes('/@limette/client-entry/') &&
      (aboutHtml.match(/<script type="module"/g) ?? []).length === 1,
    'CSS-only development route received application hydration JavaScript.'
  );
  for (const path of [
    '/styles/app.css',
    '/styles/layout.css',
    '/styles/shared.css',
    '/styles/about.css',
  ]) {
    const styleUrl = `${path}?direct`;
    assert(styleUrls.includes(styleUrl), `Development HTML lost ${styleUrl}.`);
    const response = await fetch(`${origin}${styleUrl}`);
    assert(
      response.ok && (response.headers.get('content-type') ?? '').includes('text/css'),
      `Vite did not serve ${path} as CSS.`
    );
  }

  const viteClient = await (await fetch(`${origin}/@vite/client`)).text();
  const token = viteClient.match(/const wsToken = "([^"]+)"/)?.[1];
  const hmrBase = viteClient.match(/const hmrBase = "([^"]+)"/)?.[1] ?? '/';
  assert(token, 'Could not read the Vite HMR websocket token.');
  let resolveCssUpdate!: () => void;
  const cssUpdate = new Promise<void>((resolve) => {
    resolveCssUpdate = resolve;
  });
  let resolveFullReload!: () => void;
  const fullReload = new Promise<void>((resolve) => {
    resolveFullReload = resolve;
  });
  socket = new WebSocket(`ws://127.0.0.1:${port}${hmrBase}?token=${token}`, 'vite-hmr');
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as {
      type?: string;
      updates?: Array<{ path?: string; acceptedPath?: string }>;
    };
    if (message.type === 'full-reload') resolveFullReload();
    if (
      message.type === 'update' &&
      message.updates?.some(
        (update) =>
          update.path?.includes('/styles/about.css') ||
          update.acceptedPath?.includes('/styles/about.css')
      )
    ) {
      resolveCssUpdate();
    }
  };
  await new Promise<void>((resolve, reject) => {
    socket!.onopen = () => resolve();
    socket!.onerror = () => reject(new Error('Vite HMR websocket failed.'));
  });

  const changedCss = originalCss.replace('fixture-source: about', 'fixture-source: about-hmr');
  assert(changedCss !== originalCss, 'CSS-only HMR fixture did not change.');
  await Deno.writeTextFile(cssPath, changedCss);
  cssChanged = true;
  let servedCss = '';
  for (let attempt = 0; attempt < 50; attempt++) {
    servedCss = await (await fetch(`${origin}/styles/about.css?direct`)).text();
    if (servedCss.includes('about-hmr')) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(servedCss.includes('about-hmr'), 'Vite served stale CSS after editing.');
  await Promise.race([
    cssUpdate,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('CSS-only edit did not emit an HMR update.')), 5_000)
    ),
  ]);

  const changedRoute = originalRoute.replace(
    'Generated about',
    'Generated about after full reload'
  );
  assert(changedRoute !== originalRoute, 'Clientless route reload fixture did not change.');
  await Deno.writeTextFile(routePath, changedRoute);
  routeChanged = true;
  let changedRouteHtml = '';
  for (let attempt = 0; attempt < 50; attempt++) {
    changedRouteHtml = await (await fetch(`${origin}/about`)).text();
    if (changedRouteHtml.includes('Generated about after full reload')) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(
    changedRouteHtml.includes('Generated about after full reload'),
    'Clientless route SSR did not refresh after its source changed.'
  );
  await Promise.race([
    fullReload,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Clientless route edit did not emit full reload.')), 5_000)
    ),
  ]);

  const changedLayout = originalLayout.replace('data-server-layout', 'data-server-layout-updated');
  assert(changedLayout !== originalLayout, 'Layout fixture did not change.');
  await Deno.writeTextFile(layoutPath, changedLayout);
  layoutChanged = true;
  let changedLayoutHtml = '';
  for (let attempt = 0; attempt < 50; attempt++) {
    changedLayoutHtml = await (await fetch(`${origin}/about`)).text();
    if (changedLayoutHtml.includes('data-server-layout-updated')) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(
    changedLayoutHtml.includes('data-server-layout-updated') &&
      changedLayoutHtml.includes('Generated about after full reload'),
    'Edited layout did not render freshly around its current outlet.'
  );

  const homeHtml = await (await fetch(`${origin}/`)).text();
  const entryPath = homeHtml.match(
    /<script type="module" src="([^" ]*\/@limette\/client-entry\/[^"]+)"/
  )?.[1];
  assert(
    (homeHtml.match(/src="\/@vite\/client"/g) ?? []).length === 1,
    'Island development route loaded the Vite client more than once.'
  );
  assert(
    entryPath?.startsWith('/@limette/client-entry/'),
    'Island development route lost its client entry.'
  );
  const entryCode = await (await fetch(`${origin}${entryPath}`)).text();
  for (const expected of [
    '/styles/app.css',
    '/styles/layout.css',
    '/styles/shared.css',
    '/styles/home.css',
    '/islands/counter.ts',
  ]) {
    assert(entryCode.includes(expected), `Development entry lost ${expected}.`);
  }
} finally {
  if (cssChanged) await Deno.writeTextFile(cssPath, originalCss);
  if (routeChanged) await Deno.writeTextFile(routePath, originalRoute);
  if (layoutChanged) await Deno.writeTextFile(layoutPath, originalLayout);
  socket?.close();
  try {
    child.kill('SIGTERM');
  } catch {
    // The process may already have exited after a startup error.
  }
  await child.status;
  const errors = await stderr;
  if (errors) console.error(errors);
}
