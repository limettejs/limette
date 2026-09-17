import { join } from 'node:path';
import {
  generateServerEntry,
  SERVER_ENTRY_MODULE_ID,
  type ServerEntryAssets,
} from '../../src/vite/server-entry.ts';
import type { LimetteRouteManifest } from '../../src/vite/manifest.ts';
import { limette } from '../../src/vite/plugin.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function occurrences(source: string, value: string) {
  return source.split(value).length - 1;
}

const manifest: LimetteRouteManifest = {
  appFile: 'routes/_app "quoted".ts',
  routes: [
    {
      id: 'static-id',
      path: '/static',
      routeFile: 'routes/static.ts',
      layouts: ['routes/shared-layout.ts'],
      middlewares: ['routes/shared-middleware.ts'],
      islandImports: [],
    },
    {
      id: 'island-id',
      path: '/island/"quoted"',
      routeFile: 'routes/island.ts',
      layouts: ['routes/shared-layout.ts'],
      middlewares: ['routes/shared-middleware.ts'],
      islandImports: [{
        tagName: 'test-"island"',
        local: 'TestIsland',
        sourceFile: 'routes/island.ts',
        moduleSpecifier: '../islands/test.ts',
        resolvedImport: '/islands/test.ts',
      }],
    },
  ],
};
const assets: ServerEntryAssets = new Map([
  ['static-id', {
    scripts: [],
    styles: ['/assets/static "quoted".css'],
  }],
  ['island-id', {
    scripts: ['/assets/island "quoted".js'],
    styles: ['/assets/island.css'],
  }],
]);
const options = {
  root: '/application root',
  appModule: '/application root/app "quoted".ts',
  runtimeModule: '/runtime/register-routes.ts',
  manifest,
  assets,
};

const first = generateServerEntry(options);
const second = generateServerEntry(options);
assert(first === second, 'Server entry generation is not deterministic.');
assert(
  first.includes('app._hasFsRoutes()'),
  'Generated routes are not gated by the app fsRoutes() declaration.',
);
assert(
  first.startsWith('import { app } from '),
  'The configured named app export is not statically imported.',
);
assert(
  first.indexOf('path: "/static"') <
    first.indexOf('path: "/island/\\"quoted\\""'),
  'Generated route definitions did not preserve manifest order.',
);
assert(
  occurrences(
    first,
    jsImport(join(options.root, 'routes/shared-layout.ts')),
  ) ===
    1,
  'A shared layout was imported more than once.',
);
assert(
  occurrences(
    first,
    jsImport(join(options.root, 'routes/shared-middleware.ts')),
  ) === 1,
  'Shared middleware was imported more than once.',
);
assert(
  first.includes('scripts: []') &&
    first.includes('styles: ["/assets/static \\"quoted\\".css"]'),
  'No-island route assets were not serialized correctly.',
);
assert(
  first.includes('scripts: ["/assets/island \\"quoted\\".js"]') &&
    first.includes('islands: ["test-\\"island\\""]'),
  'Island metadata was not serialized safely.',
);
assert(
  first.includes('app \\"quoted\\".ts"') &&
    first.includes('_app \\"quoted\\".ts"'),
  'Module specifiers were not serialized safely.',
);

function jsImport(path: string) {
  return `from ${JSON.stringify(path)}`;
}

let missingAssetsError = '';
try {
  generateServerEntry({
    ...options,
    assets: new Map([['static-id', assets.get('static-id')!]]),
  });
} catch (error) {
  missingAssetsError = error instanceof Error ? error.message : String(error);
}
assert(
  missingAssetsError.includes('island-bearing Limette route') &&
    missingAssetsError.includes('/island/"quoted"'),
  'Missing island route assets did not produce an actionable error.',
);

let unknownAssetsError = '';
try {
  generateServerEntry({
    ...options,
    assets: new Map([...assets, ['unknown-id', { scripts: [], styles: [] }]]),
  });
} catch (error) {
  unknownAssetsError = error instanceof Error ? error.message : String(error);
}
assert(
  unknownAssetsError.includes('unknown Limette route ID "unknown-id"'),
  'Unknown route asset metadata did not produce an actionable error.',
);

const unresolvedAppPlugin = limette({
  app: './missing-app.ts',
});
const resolvedServerEntryId = unresolvedAppPlugin.resolveId(
  SERVER_ENTRY_MODULE_ID,
);
let unresolvedAppError = '';
try {
  await unresolvedAppPlugin.load.call(
    { resolve: () => Promise.resolve(null) },
    resolvedServerEntryId!,
  );
} catch (error) {
  unresolvedAppError = error instanceof Error ? error.message : String(error);
}
assert(
  unresolvedAppError.includes(
    'Could not resolve configured Limette app module "./missing-app.ts"',
  ),
  'An unresolved configured app module did not produce an actionable error.',
);
