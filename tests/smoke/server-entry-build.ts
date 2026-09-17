import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { repositoryRoot } from './_paths.ts';
import { viteCommand } from './_vite-command.ts';
import {
  readViteManifest,
  resolveServerEntryAssets,
} from '../../src/vite/assets.ts';
import { discoverRoutes } from '../../src/vite/manifest.ts';

const fixtureRoot = fileURLToPath(
  new URL('../fixtures/server-build/', import.meta.url),
);
const buildDir = join(fixtureRoot, 'dist');
const clientDir = join(buildDir, 'client');
const serverDir = join(buildDir, 'server');
const isolatedDir = join(repositoryRoot, '.vite-limette-server-isolated');
const hiddenSources: Array<{ source: string; hidden: string }> = [];

async function remove(path: string) {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

async function copyDirectory(source: string, destination: string) {
  await Deno.mkdir(destination, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory) {
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile) {
      await Deno.mkdir(dirname(destinationPath), { recursive: true });
      await Deno.copyFile(sourcePath, destinationPath);
    }
  }
}

async function readJavaScript(path: string): Promise<string> {
  let source = '';
  for await (const entry of Deno.readDir(path)) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory) {
      source += await readJavaScript(entryPath);
    } else if (entry.isFile && entry.name.endsWith('.js')) {
      source += `\n${await Deno.readTextFile(entryPath)}`;
    }
  }
  return source;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function buildFixture(cwd: string) {
  const command = viteCommand([
    '--config',
    join(fixtureRoot, 'vite.config.ts'),
    'build',
  ], { cwd });
  const output = await command.output();
  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr));
  }
}

try {
  await remove(buildDir);
  await remove(isolatedDir);

  await buildFixture(repositoryRoot);
  const routeManifest = await discoverRoutes({ root: fixtureRoot });
  const repositoryManifestPath = join(clientDir, '.vite/manifest.json');
  const repositoryRootAssets = resolveServerEntryAssets({
    routes: routeManifest,
    manifest: await readViteManifest({
      manifestPath: repositoryManifestPath,
    }),
    base: '/my-app/',
    manifestPath: repositoryManifestPath,
  });
  await remove(buildDir);

  await Deno.mkdir(join(clientDir, '.vite'), { recursive: true });
  await Deno.writeTextFile(join(clientDir, 'stale-client-output.txt'), 'stale');
  await Deno.writeTextFile(
    join(clientDir, '.vite/manifest.json'),
    JSON.stringify({ stale: { file: 'stale.js', isEntry: true } }),
  );

  await buildFixture(fixtureRoot);

  const clientManifestPath = join(clientDir, '.vite/manifest.json');
  const clientManifest = JSON.parse(
    await Deno.readTextFile(clientManifestPath),
  ) as Record<
    string,
    { file: string; css?: string[]; isEntry?: boolean; name?: string }
  >;
  const fixtureRootAssets = resolveServerEntryAssets({
    routes: routeManifest,
    manifest: clientManifest,
    base: '/my-app/',
    manifestPath: clientManifestPath,
  });
  assert(
    JSON.stringify([...repositoryRootAssets]) ===
      JSON.stringify([...fixtureRootAssets]),
    'Route assets changed when Vite was invoked from another working directory.',
  );
  const homeEntry = Object.values(clientManifest).find((chunk) =>
    chunk.isEntry && chunk.name?.startsWith('limette-route-')
  );
  assert(homeEntry, 'Client build did not emit the island route entry.');
  assert(
    !(await exists(join(clientDir, 'stale-client-output.txt'))),
    'Client environment did not clean stale output before building.',
  );
  assert(
    await exists(join(clientDir, homeEntry.file)),
    'Client manifest entry does not reference an emitted client file.',
  );
  const expectedScriptUrl = `/my-app/${homeEntry.file}`;
  const expectedStyleUrls = (homeEntry.css ?? []).map((path) =>
    `/my-app/${path}`
  );
  assert(
    expectedStyleUrls.length > 0 &&
      (await Promise.all(
        expectedStyleUrls.map((url) =>
          exists(join(clientDir, url.slice('/my-app/'.length)))
        ),
      )).every(Boolean),
    'Client manifest CSS does not reference emitted CSS files.',
  );

  assert(await exists(join(serverDir, 'entry.js')), 'Missing server entry.');
  await copyDirectory(serverDir, isolatedDir);
  await remove(buildDir);

  const emittedSource = await readJavaScript(isolatedDir);
  const forbiddenBuildTooling = [
    'src/vite/manifest',
    'src/vite/islands',
    'src/vite/assets',
    'src/vite/routes',
    'discoverRoutes',
    'loadViteBuildRoutes',
    'resolveClientAssets',
    'setFsRoutes',
    'prepareApp',
    '.vite/manifest.json',
    'node:fs',
    'node:path',
    'staticDirectoryHandler',
    'Deno.readFile',
    'Deno.realPath',
    'Deno.stat',
  ];
  for (const forbidden of forbiddenBuildTooling) {
    assert(
      !emittedSource.includes(forbidden),
      `Server artifact unexpectedly contains Limette build tooling: ${forbidden}`,
    );
  }
  assert(
    !/from\s*["']vite["']|import\s*\(\s*["']vite["']\s*\)/.test(
      emittedSource,
    ),
    'Server artifact unexpectedly imports Vite.',
  );
  assert(
    !emittedSource.includes(fixtureRoot),
    'Server artifact contains an application source path.',
  );

  for (const name of ['app.ts', 'routes', 'islands']) {
    const source = join(fixtureRoot, name);
    const hidden = join(fixtureRoot, `.${name}.unavailable`);
    await Deno.rename(source, hidden);
    hiddenSources.push({ source, hidden });
  }

  const entryUrl = pathToFileURL(join(isolatedDir, 'entry.js'));
  entryUrl.searchParams.set('test', crypto.randomUUID());
  const serverModule = await import(entryUrl.href) as {
    default: (request: Request) => Promise<Response> | Response;
    handler: (request: Request) => Promise<Response> | Response;
  };
  assert(
    serverModule.default === serverModule.handler,
    'Default export is not the generated server handler.',
  );

  const homeResponse = await serverModule.handler(
    new Request('http://localhost/'),
  );
  const homeHtml = await homeResponse.text();
  assert(homeResponse.status === 200, `Home returned ${homeResponse.status}.`);
  assert(
    homeResponse.headers.get('x-server-middleware') === 'applied',
    'Generated home route did not execute middleware.',
  );
  assert(homeHtml.includes('Generated home'), 'Generated home did not render.');
  assert(
    homeHtml.includes('data-server-layout'),
    'Home layout did not render.',
  );
  assert(
    homeHtml.includes(expectedScriptUrl),
    'Island route did not receive the hashed client manifest entry.',
  );
  assert(
    expectedStyleUrls.every((url) => homeHtml.includes(url)),
    'Island route did not receive CSS from the client manifest.',
  );
  assert(
    homeHtml.includes('shadowroot="open"') ||
      homeHtml.includes('shadowrootmode="open"'),
    'Generated island metadata was not used by SSR.',
  );

  const aboutResponse = await serverModule.handler(
    new Request('http://localhost/about'),
  );
  const aboutHtml = await aboutResponse.text();
  assert(
    aboutResponse.status === 200 && aboutHtml.includes('Generated about'),
    'Static generated route did not render.',
  );
  assert(
    !aboutHtml.includes('<script type="module"'),
    'No-island generated route received a client script.',
  );
  const userResponse = await serverModule.handler(
    new Request('http://localhost/users/alice'),
  );
  const userHtml = await userResponse.text();
  assert(
    userResponse.status === 200 && userHtml.includes('alice'),
    'Dynamic generated route did not receive route params.',
  );
  assert(
    userResponse.headers.get('x-server-middleware') === 'applied' &&
      userHtml.includes('data-server-layout'),
    'Dynamic generated route lost middleware or layout behavior.',
  );
} finally {
  for (const { source, hidden } of hiddenSources.reverse()) {
    await Deno.rename(hidden, source);
  }
  await remove(buildDir);
  await remove(isolatedDir);
}

async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}
