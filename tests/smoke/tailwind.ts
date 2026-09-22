import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { discoverRoutes } from '../../src/vite/manifest.ts';
import { tailwindEntryName } from '../../src/vite/tailwind.ts';
import { repositoryRoot } from './_paths.ts';

const fixtureRoot = fileURLToPath(
  new URL('../fixtures/tailwind/', import.meta.url),
);
const buildDir = join(fixtureRoot, 'dist');
const routePath = join(fixtureRoot, 'routes/a.ts');
const islandPath = join(fixtureRoot, 'islands/tailwind-island.ts');
const viteCli = join(repositoryRoot, 'node_modules/vite/bin/vite.js');
const originalRoute = await readFile(routePath, 'utf8');
const originalIsland = await readFile(islandPath, 'utf8');
let routeChanged = false;
let islandChanged = false;
let viteProcess: ReturnType<typeof startVite> | undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function remove(path: string) {
  await rm(path, { recursive: true, force: true });
}

function startVite(args: string[]) {
  const child = spawn(process.execPath, [viteCli, ...args], {
    cwd: fixtureRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const status = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const closed = new Promise<void>((resolve) => {
    child.once('error', () => resolve());
    child.once('close', () => resolve());
  });
  return {
    child,
    status,
    closed,
    stderr: () => stderr,
  };
}

async function settlesWithin(promise: Promise<unknown>, timeout: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const settled = await Promise.race([
    promise.then(() => true, () => true),
    new Promise<false>((resolve) => {
      timeoutId = setTimeout(() => resolve(false), timeout);
    }),
  ]);
  if (timeoutId !== undefined) clearTimeout(timeoutId);
  return settled;
}

async function stopDevServer(
  process: ReturnType<typeof startVite>,
) {
  process.child.kill('SIGTERM');
  if (!(await settlesWithin(process.status, 2_500))) {
    process.child.kill('SIGKILL');
  }
  await process.status;

  if (!(await settlesWithin(process.closed, 500))) {
    process.child.stderr.destroy();
    await settlesWithin(process.closed, 500);
  }
  return process.stderr();
}

async function runVite(args: string[]) {
  const process = startVite(args);
  const status = await process.status;
  await process.closed;
  return {
    success: status.code === 0,
    stderr: process.stderr(),
  };
}

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not allocate a local Vite test port.');
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
}

function hasDeclaration(css: string, property: string, value: string) {
  return new RegExp(`${property}:\\s*${value.replaceAll('[', '\\[')}`).test(
    css,
  );
}

async function waitForPage(origin: string, path: string, expected: string) {
  let html = '';
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${origin}${path}`);
      html = await response.text();
      if (response.ok && html.includes(expected)) return html;
    } catch {
      // The development server may still be starting or rebuilding.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite dev did not render ${expected}: ${html.slice(0, 300)}`);
}

async function waitForCss(
  origin: string,
  path: string,
  property: string,
  value: string,
) {
  let css = '';
  for (let attempt = 0; attempt < 80; attempt++) {
    const response = await fetch(`${origin}${path}`);
    css = await response.text();
    if (response.ok && hasDeclaration(css, property, value)) return css;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Tailwind dev CSS did not contain ${property}:${value}.`);
}

try {
  await remove(buildDir);
  const build = await runVite([
    '--config',
    join(fixtureRoot, 'vite.config.ts'),
    'build',
  ]);
  assert(
    build.success,
    `Tailwind fixture build failed:\n${build.stderr}`,
  );

  const routes = await discoverRoutes({ root: fixtureRoot });
  const routeA = routes.routes.find((route) => route.path === '/a');
  const routeB = routes.routes.find((route) => route.path === '/b');
  assert(routeA && routeB, 'Tailwind fixture routes were not discovered.');
  const manifest = JSON.parse(
    await readFile(join(buildDir, 'client/.vite/manifest.json'), 'utf8'),
  ) as Record<string, { file: string; name?: string; isEntry?: boolean }>;
  const entryFor = (routeId: string) =>
    Object.values(manifest).find((entry) =>
      entry.isEntry && entry.name === tailwindEntryName(routeId)
    );
  const entryA = entryFor(routeA.id);
  const entryB = entryFor(routeB.id);
  assert(entryA && entryB, 'Route-specific Tailwind entries were not emitted.');
  assert(entryA.file !== entryB.file, 'Routes shared one Tailwind CSS asset.');
  const cssA = await readFile(join(buildDir, 'client', entryA.file), 'utf8');
  const cssB = await readFile(join(buildDir, 'client', entryB.file), 'utf8');
  assert(
    hasDeclaration(cssA, 'padding', '13px') &&
      hasDeclaration(cssA, 'border-width', '3px') &&
      hasDeclaration(cssA, 'min-height', '41px') &&
      hasDeclaration(cssA, 'background-color', '#abcdef') &&
      hasDeclaration(cssA, 'outline-width', '7px') &&
      cssA.includes('--color-limette-proof:#123456'),
    'Route A Tailwind CSS lost route, island, or CSS-first theme output.',
  );
  assert(
    !hasDeclaration(cssA, 'margin', '17px'),
    'Route A Tailwind CSS included Route B candidates.',
  );
  assert(
    hasDeclaration(cssB, 'margin', '17px') &&
      hasDeclaration(cssB, 'min-height', '41px') &&
      hasDeclaration(cssB, 'background-color', '#abcdef') &&
      !hasDeclaration(cssB, 'padding', '13px') &&
      !hasDeclaration(cssB, 'border-width', '3px') &&
      !hasDeclaration(cssB, 'outline-width', '7px'),
    'Route B Tailwind CSS was not isolated from Route A.',
  );

  const serverEntry = pathToFileURL(join(buildDir, 'server/entry.js'));
  serverEntry.searchParams.set('test', crypto.randomUUID());
  const serverModule = await import(serverEntry.href) as {
    default(request: Request): Response | Promise<Response>;
  };
  const response = await serverModule.default(
    new Request('http://localhost/a'),
  );
  const html = await response.text();
  const tailwindUrl = `/${entryA.file}`;
  assert(
    response.ok &&
      html.includes(`<link rel="stylesheet" href="${tailwindUrl}">`) &&
      html.includes(`@import url("${tailwindUrl}")`),
    'SSR did not distribute one Tailwind URL to the document and shadow root.',
  );

  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  viteProcess = startVite([
    '--config',
    join(fixtureRoot, 'vite.config.ts'),
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
    '--logLevel',
    'error',
  ]);
  const initialHtml = await waitForPage(origin, '/a', 'p-[13px]');
  const devStyle = initialHtml.match(
    /<link rel="stylesheet" href="([^"]*virtual:limette\/tailwind\/[^"]+)"/,
  )?.[1];
  assert(devStyle, 'Development SSR did not link route Tailwind CSS.');
  const initialCss = await waitForCss(origin, devStyle, 'padding', '13px');
  assert(
    hasDeclaration(initialCss, 'outline-width', '7px'),
    'Development Tailwind CSS did not scan the island.',
  );

  const updatedRoute = originalRoute.replace('p-[13px]', 'p-[19px]');
  assert(
    updatedRoute !== originalRoute,
    'Route update fixture did not change.',
  );
  await writeFile(routePath, updatedRoute);
  routeChanged = true;
  const routeHtml = await waitForPage(origin, '/a', 'p-[19px]');
  const routeDevStyle = routeHtml.match(
    /<link rel="stylesheet" href="([^"]*virtual:limette\/tailwind\/[^"]+)"/,
  )?.[1];
  assert(
    routeDevStyle && routeDevStyle !== devStyle,
    'The development Tailwind entry was not refreshed after a source edit.',
  );
  const routeCss = await waitForCss(
    origin,
    routeDevStyle,
    'padding',
    '19px',
  );
  assert(
    !hasDeclaration(routeCss, 'padding', '13px'),
    'Tailwind retained the stale route candidate after an edit.',
  );

  const updatedIsland = originalIsland.replace(
    'outline-[7px]',
    'outline-[9px]',
  );
  assert(
    updatedIsland !== originalIsland,
    'Island update fixture did not change.',
  );
  await writeFile(islandPath, updatedIsland);
  islandChanged = true;
  const islandHtml = await waitForPage(origin, '/a', 'outline-[9px]');
  const islandDevStyle = islandHtml.match(
    /<link rel="stylesheet" href="([^"]*virtual:limette\/tailwind\/[^"]+)"/,
  )?.[1];
  assert(
    islandDevStyle && islandDevStyle !== routeDevStyle,
    'The development Tailwind entry was not refreshed after an island edit.',
  );
  const islandCss = await waitForCss(
    origin,
    islandDevStyle,
    'outline-width',
    '9px',
  );
  assert(
    !hasDeclaration(islandCss, 'outline-width', '7px'),
    'Tailwind retained the stale island candidate after an edit.',
  );

  const errors = await stopDevServer(viteProcess);
  viteProcess = undefined;
  assert(!errors, `Tailwind Vite dev logged errors:\n${errors}`);
} finally {
  if (routeChanged) await writeFile(routePath, originalRoute);
  if (islandChanged) await writeFile(islandPath, originalIsland);
  if (viteProcess) {
    await stopDevServer(viteProcess);
  }
  await remove(buildDir);
}
