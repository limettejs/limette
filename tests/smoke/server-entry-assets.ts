import { resolveServerEntryAssets } from '../../src/vite/assets.ts';
import type { ViteManifest, ViteManifestChunk } from '../../src/vite/assets.ts';
import type { LimetteRouteManifest } from '../../src/vite/manifest.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const manifestPath = '/build/client/.vite/manifest.json';
const routes: LimetteRouteManifest = {
  appFile: 'routes/_app.ts',
  routes: [
    {
      id: 'island-id',
      path: '/',
      routeFile: 'routes/index.ts',
      layouts: [],
      middlewares: [],
      islandImports: [{
        tagName: 'test-island',
        local: 'TestIsland',
        sourceFile: 'routes/index.ts',
        moduleSpecifier: '../islands/test.ts',
        resolvedImport: '/islands/test.ts',
      }],
    },
    {
      id: 'static-id',
      path: '/about',
      routeFile: 'routes/about.ts',
      layouts: [],
      middlewares: [],
      islandImports: [],
    },
  ],
};
const islandChunk: ViteManifestChunk = {
  file: 'assets/entry-abc.js',
  css: ['assets/entry-def.css'],
  imports: ['shared'],
  isEntry: true,
  name: 'limette-route-island-id',
};
const sharedChunk: ViteManifestChunk = {
  file: 'assets/shared-abc.js',
  css: ['assets/shared-def.css'],
};

const assets = resolveServerEntryAssets({
  manifest: { 'virtual:entry': islandChunk, shared: sharedChunk },
  routes,
  base: '/my-app/',
  manifestPath,
});
assert(
  JSON.stringify(assets.get('island-id')) === JSON.stringify({
    scripts: ['/my-app/assets/entry-abc.js'],
    styles: [
      '/my-app/assets/entry-def.css',
      '/my-app/assets/shared-def.css',
    ],
  }),
  'Server assets did not preserve Vite base or emitted CSS.',
);
assert(
  JSON.stringify(assets.get('static-id')) === JSON.stringify({
    scripts: [],
    styles: [],
  }),
  'A no-island route unexpectedly required a client entry.',
);

function expectFailure(
  viteManifest: ViteManifest,
  expected: readonly string[],
) {
  let message = '';
  try {
    resolveServerEntryAssets({
      manifest: viteManifest,
      routes,
      manifestPath,
    });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  assert(
    expected.every((text) => message.includes(text)),
    `Expected asset resolution failure containing ${
      expected.join(', ')
    }, got: ${message}`,
  );
}

expectFailure({}, [
  'limette-route-island-id',
  'route "/"',
  'island-id',
  manifestPath,
]);

expectFailure({
  first: islandChunk,
  second: { ...islandChunk, file: 'assets/duplicate.js' },
  shared: sharedChunk,
}, [
  'multiple entries',
  'limette-route-island-id',
  'route "/"',
  manifestPath,
]);

expectFailure({
  shared: sharedChunk,
  stale: {
    file: 'assets/stale.js',
    isEntry: true,
    name: 'limette-route-stale-id',
  },
}, [
  'Unknown or stale',
  'limette-route-stale-id',
  'stale-id',
  manifestPath,
]);

expectFailure({
  shared: sharedChunk,
  malformed: {
    file: 'assets/malformed.js',
    isEntry: true,
    name: 'limette-route-',
  },
}, ['Malformed', 'limette-route-', manifestPath]);

expectFailure({
  island: islandChunk,
  shared: sharedChunk,
  static: {
    file: 'assets/static.js',
    isEntry: true,
    name: 'limette-route-static-id',
  },
}, [
  'Unexpected Limette client entry',
  'limette-route-static-id',
  'non-island route "/about"',
  'static-id',
  manifestPath,
]);
