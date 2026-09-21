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
        exportName: 'TestIsland',
        ssr: true,
        sourceFile: 'routes/index.ts',
        moduleSpecifier: '../islands/test.ts',
        resolvedImport: '/islands/test.ts',
      }],
      sourceFiles: ['routes/_app.ts', 'routes/index.ts', 'islands/test.ts'],
      styleImports: ['/routes/index.css'],
    },
    {
      id: 'static-id',
      path: '/about',
      routeFile: 'routes/about.ts',
      layouts: [],
      middlewares: [],
      islandImports: [],
      sourceFiles: ['routes/_app.ts', 'routes/about.ts'],
      styleImports: ['/routes/about.css'],
    },
    {
      id: 'empty-id',
      path: '/empty',
      routeFile: 'routes/empty.ts',
      layouts: [],
      middlewares: [],
      islandImports: [],
      sourceFiles: ['routes/_app.ts', 'routes/empty.ts'],
      styleImports: [],
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
const staticChunk: ViteManifestChunk = {
  file: 'assets/static-entry.js',
  css: ['assets/static.css'],
  isEntry: true,
  name: 'limette-route-static-id',
};
const islandStyleChunk: ViteManifestChunk = {
  file: 'assets/island-build-only.js',
  css: ['assets/island-only.css'],
  imports: ['island-shared'],
  isEntry: true,
  name: 'limette-island-island-id-0',
};
const islandSharedChunk: ViteManifestChunk = {
  file: 'assets/island-shared.js',
  css: ['assets/island-shared.css'],
};

const assets = resolveServerEntryAssets({
  manifest: {
    'virtual:entry': islandChunk,
    'virtual:island': islandStyleChunk,
    'virtual:static': staticChunk,
    shared: sharedChunk,
    'island-shared': islandSharedChunk,
  },
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
    islandStyles: {
      'test-island': [
        '/my-app/assets/island-only.css',
        '/my-app/assets/island-shared.css',
      ],
    },
  }),
  'Server assets did not preserve Vite base or emitted CSS.',
);
assert(
  JSON.stringify(assets.get('static-id')) === JSON.stringify({
    scripts: [],
    styles: ['/my-app/assets/static.css'],
    islandStyles: {},
  }),
  'A CSS-only route did not receive styles without a client script.',
);
assert(
  JSON.stringify(assets.get('empty-id')) === JSON.stringify({
    scripts: [],
    styles: [],
    islandStyles: {},
  }),
  'An empty route unexpectedly received client assets.',
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
  island: islandStyleChunk,
  'island-shared': islandSharedChunk,
}, [
  'multiple entries',
  'limette-route-island-id',
  'route "/"',
  manifestPath,
]);

expectFailure({
  island: islandChunk,
  static: staticChunk,
  shared: sharedChunk,
}, [
  'limette-island-island-id-0',
  'test-island',
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
  empty: {
    file: 'assets/empty.js',
    isEntry: true,
    name: 'limette-route-empty-id',
  },
}, [
  'Unexpected Limette client entry',
  'limette-route-empty-id',
  'route without client assets "/empty"',
  'empty-id',
  manifestPath,
]);
