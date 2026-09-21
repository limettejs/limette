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

async function cssFiles(path: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(path)) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory) {
      files.push(...await cssFiles(entryPath));
    } else if (entry.isFile && entry.name.endsWith('.css')) {
      files.push(entryPath);
    }
  }
  return files;
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
  const homeRoute = routeManifest.routes.find((route) => route.path === '/');
  const aboutRoute = routeManifest.routes.find((route) =>
    route.path === '/about'
  );
  const csrRoute = routeManifest.routes.find((route) =>
    route.path === '/csr-islands'
  );
  assert(homeRoute && aboutRoute && csrRoute, 'Missing CSS fixture routes.');
  const homeAssets = fixtureRootAssets.get(homeRoute.id);
  const aboutAssets = fixtureRootAssets.get(aboutRoute.id);
  const csrAssets = fixtureRootAssets.get(csrRoute.id);
  assert(
    homeAssets && aboutAssets && csrAssets,
    'Missing resolved CSS fixture assets.',
  );
  assert(
    csrRoute.islandImports.length === 2 &&
      csrRoute.islandImports.every((island) => island.ssr === false),
    'Shorthand or omitted island SSR did not default to false.',
  );
  for (
    const styleImport of [
      '/styles/app.css',
      '/styles/layout.css',
      '/styles/shared.css',
      '/styles/home.css',
    ]
  ) {
    assert(
      homeRoute.styleImports.includes(styleImport),
      `Home route did not discover ${styleImport}.`,
    );
  }
  for (
    const styleImport of [
      '/styles/app.css',
      '/styles/layout.css',
      '/styles/shared.css',
      '/styles/about.css',
    ]
  ) {
    assert(
      aboutRoute.styleImports.includes(styleImport),
      `About route did not discover ${styleImport}.`,
    );
  }
  assert(
    homeAssets.scripts.length === 1 && homeAssets.styles.length > 0,
    'Island route did not receive its script and route-scoped styles.',
  );
  assert(
    aboutAssets.scripts.length === 0 && aboutAssets.styles.length > 0,
    'CSS-only route received a script or lost its styles.',
  );
  const emittedCssFiles = await cssFiles(clientDir);
  const cssContents = new Map(
    await Promise.all(
      emittedCssFiles.map(async (path) =>
        [path, await Deno.readTextFile(path)] as const
      ),
    ),
  );
  const sharedCssFiles = [...cssContents]
    .filter(([, css]) => css.includes('fixture-shared-style'))
    .map(([path]) => path);
  assert(
    sharedCssFiles.length === 1,
    `Shared CSS was emitted ${sharedCssFiles.length} times instead of once.`,
  );
  const sharedCssUrl = `/my-app/${
    sharedCssFiles[0].slice(clientDir.length + 1).replaceAll('\\', '/')
  }`;
  assert(
    homeAssets.styles.includes(sharedCssUrl) &&
      aboutAssets.styles.includes(sharedCssUrl),
    'Shared CSS was not associated with every affected route.',
  );
  const routeCss = async (styles: readonly string[]) =>
    (await Promise.all(
      styles.map((url) =>
        Deno.readTextFile(join(clientDir, url.slice('/my-app/'.length)))
      ),
    )).join('\n');
  const homeCss = await routeCss(homeAssets.styles);
  const aboutCss = await routeCss(aboutAssets.styles);
  const counterStyles = homeAssets.islandStyles['test-counter'];
  const statusStyles = homeAssets.islandStyles['test-status'];
  assert(
    counterStyles?.length > 1 && statusStyles?.length > 1,
    'An island requiring own and shared CSS did not retain every CSS asset.',
  );
  const counterCss = await routeCss(counterStyles);
  const statusCss = await routeCss(statusStyles);
  for (
    const marker of [
      'fixture-app-style',
      'fixture-layout-style',
      'fixture-shared-style',
      'fixture-home-style',
      'fixture-island-style',
    ]
  ) {
    assert(homeCss.includes(marker), `Home CSS lost ${marker}.`);
  }
  for (
    const marker of [
      'fixture-app-style',
      'fixture-layout-style',
      'fixture-shared-style',
      'fixture-about-style',
    ]
  ) {
    assert(aboutCss.includes(marker), `About CSS lost ${marker}.`);
  }
  for (
    const marker of ['fixture-island-style', 'fixture-shared-island-style']
  ) {
    assert(counterCss.includes(marker), `Counter island CSS lost ${marker}.`);
  }
  assert(
    !counterCss.includes('fixture-status-island-style'),
    'Counter island CSS included the other island stylesheet.',
  );
  for (
    const marker of [
      'fixture-status-island-style',
      'fixture-shared-island-style',
    ]
  ) {
    assert(statusCss.includes(marker), `Status island CSS lost ${marker}.`);
  }
  assert(
    !statusCss.includes('fixture-island-style'),
    'Status island CSS included the counter stylesheet.',
  );
  for (
    const pageMarker of [
      'fixture-app-style',
      'fixture-layout-style',
      'fixture-shared-style',
      'fixture-home-style',
    ]
  ) {
    assert(
      !counterCss.includes(pageMarker) && !statusCss.includes(pageMarker),
      `Page-only CSS ${pageMarker} leaked into an island CSS graph.`,
    );
  }
  const sharedIslandCssFiles = [...cssContents]
    .filter(([, css]) => css.includes('fixture-shared-island-style'))
    .map(([path]) => path);
  assert(
    sharedIslandCssFiles.length === 1,
    `Shared island CSS was emitted ${sharedIslandCssFiles.length} times instead of once.`,
  );
  const sharedIslandCssUrl = `/my-app/${
    sharedIslandCssFiles[0].slice(clientDir.length + 1).replaceAll('\\', '/')
  }`;
  assert(
    counterStyles.includes(sharedIslandCssUrl) &&
      statusStyles.includes(sharedIslandCssUrl),
    'Shared island CSS was not associated with both islands.',
  );
  assert(
    JSON.stringify([...repositoryRootAssets]) ===
      JSON.stringify([...fixtureRootAssets]),
    'Route assets changed when Vite was invoked from another working directory.',
  );
  const homeEntry = Object.values(clientManifest).find((chunk) =>
    chunk.isEntry && chunk.name === `limette-route-${homeRoute.id}`
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
  const homeEntrySource = await Deno.readTextFile(
    join(clientDir, homeEntry.file),
  );
  assert(
    homeEntrySource.includes('customElements') &&
      homeEntrySource.includes('test-counter') &&
      homeEntrySource.includes('test-status'),
    'The production client entry did not register route-declared islands.',
  );
  const browserRegistration = await new Deno.Command('node', {
    cwd: repositoryRoot,
    args: [
      '--input-type=module',
      '--eval',
      `
        import { parseHTML } from 'linkedom';
        const { window } = parseHTML('<html><body></body></html>');
        for (const name of [
          'window', 'document', 'customElements', 'HTMLElement', 'Element',
          'Document', 'ShadowRoot', 'Event', 'CustomEvent', 'Node',
          'MutationObserver', 'CSSStyleSheet'
        ]) {
          if (window[name] !== undefined) globalThis[name] = window[name];
        }
        const appendChild = document.head.appendChild;
        document.head.appendChild = function (node) {
          const result = appendChild.call(this, node);
          if (node.tagName === 'LINK') {
            queueMicrotask(() => node.dispatchEvent(new Event('load')));
          }
          return result;
        };
        await import(${
        JSON.stringify(pathToFileURL(join(clientDir, homeEntry.file)).href)
      });
        if (!customElements.get('test-counter')) {
          throw new Error('The emitted client entry did not register test-counter.');
        }
        const counter = document.createElement('test-counter');
        document.body.append(counter);
        await counter.updateComplete;
        if (!counter.shadowRoot || counter.count !== 0) {
          throw new Error('The registered island did not upgrade.');
        }
        counter.count++;
        await counter.updateComplete;
        if (counter.count !== 1) {
          throw new Error('The upgraded island did not update.');
        }
      `,
    ],
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  assert(
    browserRegistration.success,
    `The production island did not register and upgrade:\n${
      new TextDecoder().decode(browserRegistration.stderr)
    }`,
  );
  const csrEntry = Object.values(clientManifest).find((chunk) =>
    chunk.isEntry && chunk.name === `limette-route-${csrRoute.id}`
  );
  assert(csrEntry, 'Client build did not emit the CSR-only route entry.');
  const csrBrowserRegistration = await new Deno.Command('node', {
    cwd: repositoryRoot,
    args: [
      '--input-type=module',
      '--eval',
      `
        import { parseHTML } from 'linkedom';
        const { window } = parseHTML('<html><body></body></html>');
        for (const name of [
          'window', 'document', 'customElements', 'HTMLElement', 'Element',
          'Document', 'ShadowRoot', 'Event', 'CustomEvent', 'Node',
          'MutationObserver', 'CSSStyleSheet'
        ]) {
          if (window[name] !== undefined) globalThis[name] = window[name];
        }
        const appendChild = document.head.appendChild;
        document.head.appendChild = function (node) {
          const result = appendChild.call(this, node);
          if (node.tagName === 'LINK') {
            queueMicrotask(() => node.dispatchEvent(new Event('load')));
          }
          return result;
        };
        globalThis.__limetteClientOnlyRenders = 0;
        await import(${
        JSON.stringify(pathToFileURL(join(clientDir, csrEntry.file)).href)
      });
        for (const tagName of [
          'shorthand-client-only', 'descriptor-client-only'
        ]) {
          if (!customElements.get(tagName)) {
            throw new Error('The CSR client entry did not register ' + tagName + '.');
          }
          const element = document.createElement(tagName);
          document.body.append(element);
          await element.updateComplete;
        }
        if (globalThis.__limetteClientOnlyRenders !== 2) {
          throw new Error('CSR-only islands did not render on the client.');
        }
      `,
    ],
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  assert(
    csrBrowserRegistration.success,
    `CSR-only islands did not register and render on the client:\n${
      new TextDecoder().decode(csrBrowserRegistration.stderr)
    }`,
  );
  const expectedScriptUrl = homeAssets.scripts[0];
  const expectedStyleUrls = homeAssets.styles;
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
    homeHtml.includes('<title>Generated home title</title>') &&
      homeHtml.includes(
        '<meta name="description" content="Generated app description">',
      ),
    'Generated production entry did not merge structural head metadata.',
  );
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
    !homeHtml.includes('/@vite/client'),
    'Production SSR unexpectedly included the Vite development client.',
  );
  const islandShadow = (tagName: string) => {
    const match = homeHtml.match(
      new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`),
    );
    assert(match, `Generated ${tagName} island did not render.`);
    return match[1];
  };
  const counterShadow = islandShadow('test-counter');
  const statusShadow = islandShadow('test-status');
  assert(
    counterShadow.includes('Count:') && statusShadow.includes('Status'),
    'An explicitly SSR-enabled island did not render its implementation.',
  );
  assert(
    counterStyles.every((url) => counterShadow.includes(url)) &&
      statusStyles.every((url) => statusShadow.includes(url)),
    'An island shadow root lost one of its associated stylesheets.',
  );
  assert(
    statusStyles.filter((url) => !counterStyles.includes(url))
      .every((url) => !counterShadow.includes(url)) &&
      counterStyles.filter((url) => !statusStyles.includes(url))
        .every((url) => !statusShadow.includes(url)),
    "An island shadow root received another island's stylesheet.",
  );
  const pageOnlyStyleUrls = expectedStyleUrls.filter((url) =>
    !counterStyles.includes(url) && !statusStyles.includes(url)
  );
  assert(
    pageOnlyStyleUrls.length > 0 &&
      pageOnlyStyleUrls.every((url) =>
        !counterShadow.includes(url) && !statusShadow.includes(url)
      ),
    'Document-only CSS was injected into an island shadow root.',
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
    aboutAssets.styles.every((url) => aboutHtml.includes(url)),
    'CSS-only route did not render its route-scoped stylesheet URLs.',
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
    userHtml.includes('<title>User profile</title>') &&
      userHtml.includes(
        '<meta name="description" content="Profile for alice">',
      ),
    'Dynamic route head() did not receive request params.',
  );
  assert(
    userResponse.headers.get('x-server-middleware') === 'applied' &&
      userHtml.includes('data-server-layout'),
    'Dynamic generated route lost middleware or layout behavior.',
  );
  const sharedIslandResponse = await serverModule.handler(
    new Request('http://localhost/shared-island'),
  );
  const sharedIslandHtml = await sharedIslandResponse.text();
  assert(
    sharedIslandResponse.status === 200 &&
      sharedIslandHtml.includes('Count') &&
      sharedIslandHtml.includes('test-counter'),
    'A shared island failed when registered by more than one route.',
  );
  const serverExecutionState = globalThis as typeof globalThis & {
    __limetteClientOnlyRenders?: number;
  };
  serverExecutionState.__limetteClientOnlyRenders = 0;
  const csrResponse = await serverModule.handler(
    new Request('http://localhost/csr-islands'),
  );
  const csrHtml = await csrResponse.text();
  assert(
    csrResponse.status === 200 &&
      csrHtml.includes('<shorthand-client-only') &&
      csrHtml.includes('<descriptor-client-only'),
    'CSR-only island hosts were not rendered.',
  );
  assert(
    /<shorthand-client-only[^>]*\bssr(?:="")?/.test(csrHtml),
    'The legacy-named ssr attribute was not preserved as an ordinary attribute.',
  );
  assert(
    !csrHtml.includes('Client-only implementation') &&
      serverExecutionState.__limetteClientOnlyRenders === 0,
    'A CSR-only island implementation executed during SSR.',
  );
  assert(
    csrAssets.styles.every((url) => csrHtml.includes(url)) &&
      Object.values(csrAssets.islandStyles).flat().every((url) =>
        csrHtml.includes(url)
      ),
    'CSR-only islands lost their document or shadow-root styles.',
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
