/// <reference path="../../src/vite/client.d.ts" />

import manifest from 'virtual:limette/routes';
import {
  islandImports as homeIslandImports,
  routePath as homeRoutePath,
} from 'virtual:limette/client-entry/42099b';

if (manifest.appFile !== 'routes/_app.js') {
  throw new Error(`Unexpected app file: ${manifest.appFile}`);
}

const paths = manifest.routes.map((route) => route.path);
const expectedPaths = ['/', '/foo-:id', '/foo/bar', '/no-js'];

for (const expectedPath of expectedPaths) {
  if (!paths.includes(expectedPath)) {
    throw new Error(`Missing route in Vite manifest: ${expectedPath}`);
  }
}

if (homeRoutePath !== '/') {
  throw new Error(
    `Unexpected route path for home client entry: ${homeRoutePath}`,
  );
}

if (
  !homeIslandImports.some((islandImport) =>
    islandImport.resolvedImport === '/islands/foo.js'
  )
) {
  throw new Error('Missing island import for home client entry.');
}

export default manifest;
