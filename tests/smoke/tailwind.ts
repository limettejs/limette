import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { discoverRoutes } from '../../src/vite/manifest.ts';
import { tailwindEntryName } from '../../src/vite/tailwind.ts';
import { viteCommand } from './_vite-command.ts';

const fixtureRoot = fileURLToPath(
  new URL('../fixtures/tailwind/', import.meta.url),
);
const buildDir = join(fixtureRoot, 'dist');
const routePath = join(fixtureRoot, 'routes/a.ts');
const islandPath = join(fixtureRoot, 'islands/tailwind-island.ts');
const originalRoute = await Deno.readTextFile(routePath);
const originalIsland = await Deno.readTextFile(islandPath);
let routeChanged = false;
let islandChanged = false;
let child: Deno.ChildProcess | undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function remove(path: string) {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
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
  const build = await viteCommand([
    '--config',
    join(fixtureRoot, 'vite.config.ts'),
    'build',
  ], { cwd: fixtureRoot }).output();
  assert(
    build.success,
    `Tailwind fixture build failed:\n${new TextDecoder().decode(build.stderr)}`,
  );

  const routes = await discoverRoutes({ root: fixtureRoot });
  const routeA = routes.routes.find((route) => route.path === '/a');
  const routeB = routes.routes.find((route) => route.path === '/b');
  assert(routeA && routeB, 'Tailwind fixture routes were not discovered.');
  const manifest = JSON.parse(
    await Deno.readTextFile(join(buildDir, 'client/.vite/manifest.json')),
  ) as Record<string, { file: string; name?: string; isEntry?: boolean }>;
  const entryFor = (routeId: string) =>
    Object.values(manifest).find((entry) =>
      entry.isEntry && entry.name === tailwindEntryName(routeId)
    );
  const entryA = entryFor(routeA.id);
  const entryB = entryFor(routeB.id);
  assert(entryA && entryB, 'Route-specific Tailwind entries were not emitted.');
  assert(entryA.file !== entryB.file, 'Routes shared one Tailwind CSS asset.');
  const cssA = await Deno.readTextFile(join(buildDir, 'client', entryA.file));
  const cssB = await Deno.readTextFile(join(buildDir, 'client', entryB.file));
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

  const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();
  const origin = `http://127.0.0.1:${port}`;
  child = viteCommand([
    '--config',
    join(fixtureRoot, 'vite.config.ts'),
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
  }).spawn();
  const stderr = new Response(child.stderr).text();
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
  await Deno.writeTextFile(routePath, updatedRoute);
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
  await Deno.writeTextFile(islandPath, updatedIsland);
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

  child.kill('SIGTERM');
  await child.status;
  child = undefined;
  const errors = await stderr;
  assert(!errors, `Tailwind Vite dev logged errors:\n${errors}`);
} finally {
  if (routeChanged) await Deno.writeTextFile(routePath, originalRoute);
  if (islandChanged) await Deno.writeTextFile(islandPath, originalIsland);
  if (child) {
    try {
      child.kill('SIGTERM');
    } catch {
      // The process may already have exited.
    }
    await child.status;
  }
  await remove(buildDir);
}
