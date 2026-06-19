import { Context } from '../../src/server/context.ts';
import { renderContent } from '../../src/server/ssr.ts';
import type { AppWrapperComponentClass } from '../../src/server/ssr.ts';
import { discoverRoutes, loadViteBuildRoutes } from '../../src/vite/mod.ts';
import { exampleRoot, loadExampleFile } from './_paths.ts';

const manifest = await discoverRoutes({ root: exampleRoot });
const routes = await loadViteBuildRoutes({
  root: exampleRoot,
  outDir: '.vite-limette-client',
  loadFile: loadExampleFile,
});
const homeRoute = routes.find((route) => route.path === '/');

if (!homeRoute) {
  throw new Error('Missing home route.');
}

const AppWrapper = (await loadExampleFile(manifest.appFile))
  .default as AppWrapperComponentClass;
const request = new Request('http://localhost/');
const url = new URL(request.url);
const ctx = new Context({
  request,
  url,
  info: undefined,
  params: {},
  config: {},
  next: () => Promise.resolve(new Response('Not found', { status: 404 })),
});
const html = await renderContent(AppWrapper, homeRoute, ctx);

if (!html.includes('/assets/limette-route-')) {
  throw new Error('SSR output does not include the Vite route asset.');
}

if (html.includes('/_limette/js/chunk-')) {
  throw new Error('SSR output still includes the old Limette chunk path.');
}

console.log(html);
