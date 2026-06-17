/// <reference path="../src/vite/client.d.ts" />

import manifest from 'virtual:limette/routes';

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

export default manifest;
