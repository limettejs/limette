import { resolveClientAssets } from '../../src/vite/mod.ts';
import { exampleRoot } from './_paths.ts';

const routeAssets = await resolveClientAssets({
  root: exampleRoot,
  outDir: '.vite-limette-client',
});

const homeAssets = routeAssets.find((route) => route.routePath === '/');
if (!homeAssets?.entry) {
  throw new Error('Missing Vite client asset entry for home route.');
}

if (!homeAssets.scripts.some((script) => script.includes('limette-route-'))) {
  throw new Error('Home route assets do not include a route entry script.');
}

if (!homeAssets.scripts.some((script) => script.includes('/assets/bar-'))) {
  throw new Error('Home route assets do not include the shared island chunk.');
}

console.log(JSON.stringify(routeAssets, null, 2));
