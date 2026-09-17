import { dirname, join } from 'node:path';
import { discoverRoutes } from '../../src/vite/manifest.ts';

const root = await Deno.makeTempDir({ prefix: 'limette-routes-' });

async function writeRoute(path: string) {
  const file = join(root, 'routes', path);
  await Deno.mkdir(dirname(file), { recursive: true });
  await Deno.writeTextFile(file, 'export default class Route {}');
}

function assertBefore(paths: string[], first: string, second: string) {
  const firstIndex = paths.indexOf(first);
  const secondIndex = paths.indexOf(second);

  if (firstIndex === -1 || secondIndex === -1 || firstIndex >= secondIndex) {
    throw new Error(
      `Expected route "${first}" before "${second}", got: ${paths.join(', ')}`,
    );
  }
}

try {
  await writeRoute('_app.js');
  await writeRoute('[id].js');
  await writeRoute('about.js');
  await writeRoute('blog/[slug].js');
  await writeRoute('blog/archive.js');
  await writeRoute('docs/[...path].js');
  await writeRoute('docs/getting-started.js');
  await writeRoute('files/[name].js');
  await writeRoute('files/[...path].js');
  await writeRoute('reference/[[version]].js');
  await writeRoute('reference/api.js');

  const manifest = await discoverRoutes({ root });
  const paths = manifest.routes.map((route) => route.path);

  assertBefore(paths, '/about', '/:id');
  assertBefore(paths, '/blog/archive', '/blog/:slug');
  assertBefore(paths, '/docs/getting-started', '/docs/:path*');
  assertBefore(paths, '/files/:name', '/files/:path*');
  assertBefore(paths, '/reference/api', '/reference{/:version}?');
} finally {
  await Deno.remove(root, { recursive: true });
}
