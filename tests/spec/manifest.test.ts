import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverRoutes } from '../../src/vite/manifest.ts';

function assert(condition: unknown, message: string): asserts condition {
  expect(condition, message).toBeTruthy();
}

async function withRoutes<T>(
  files: readonly string[],
  run: (root: string) => Promise<T>,
) {
  const root = await mkdtemp(join(tmpdir(), 'limette-routes-'));
  try {
    for (const path of ['_app.ts', ...files]) {
      const file = join(root, 'routes', path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, 'export default class Route {}');
    }
    return await run(root);
  } finally {
    await rm(root, { recursive: true });
  }
}

async function manifestFor(files: readonly string[]) {
  return await withRoutes(files, (root) => discoverRoutes({ root }));
}

function assertBefore(paths: string[], first: string, second: string) {
  const firstIndex = paths.indexOf(first);
  const secondIndex = paths.indexOf(second);
  assert(
    firstIndex !== -1 && secondIndex !== -1 && firstIndex < secondIndex,
    `Expected route "${first}" before "${second}", got: ${paths.join(', ')}`,
  );
}

function assertMatches(
  pathnamePattern: string,
  matches: readonly string[],
  misses: readonly string[],
) {
  const pattern = new URLPattern({ pathname: pathnamePattern });
  for (const pathname of matches) {
    assert(
      pattern.test({ pathname }),
      `Expected "${pathnamePattern}" to match "${pathname}".`,
    );
  }
  for (const pathname of misses) {
    assert(
      !pattern.test({ pathname }),
      `Expected "${pathnamePattern}" not to match "${pathname}".`,
    );
  }
}

async function assertDiscoveryError(
  files: readonly string[],
  expected: readonly string[],
) {
  let error: unknown;
  try {
    await manifestFor(files);
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error, `Expected discovery to fail for ${files}.`);
  for (const text of expected) {
    assert(
      error.message.includes(text),
      `Expected error to contain "${text}", got: ${error.message}`,
    );
  }
}

describe('filesystem route manifest', () => {
  it('maps filesystem syntax to URLPattern paths', async () => {
    const mappingManifest = await manifestFor([
      'index.ts',
      'about.ts',
      'blog/index.ts',
      'blog/[slug].ts',
      'blog/[slug]/comments.ts',
      'old/[...path].ts',
      'docs/[[version]]/index.ts',
      '[[name]].ts',
    ]);
    const mappings = new Map(
      mappingManifest.routes.map((route) => [route.routeFile, route.path]),
    );
    for (
      const [file, expectedPath] of [
        ['routes/index.ts', '/'],
        ['routes/about.ts', '/about'],
        ['routes/blog/index.ts', '/blog'],
        ['routes/blog/[slug].ts', '/blog/:slug'],
        ['routes/blog/[slug]/comments.ts', '/blog/:slug/comments'],
        ['routes/old/[...path].ts', '/old/:path*'],
        ['routes/docs/[[version]]/index.ts', '/docs{/:version}?'],
        ['routes/[[name]].ts', '/{:name}?'],
      ]
    ) {
      assert(
        mappings.get(file) === expectedPath,
        `Expected ${file} to map to ${expectedPath}, got ${
          mappings.get(file)
        }.`,
      );
    }

    const nestedIndexManifest = await manifestFor([
      'blog/[slug]/comments/index.ts',
    ]);
    assert(
      nestedIndexManifest.routes[0]?.path === '/blog/:slug/comments',
      'A nested index route did not remove only its terminal index segment.',
    );

    assertMatches('/blog/:slug', ['/blog/one'], ['/blog', '/blog/one/two']);
    assertMatches(
      '/old/:path*',
      ['/old', '/old/one', '/old/one/two'],
      ['/older/one'],
    );
    assertMatches('/{:name}?', ['/', '/foo', '/bar'], ['/foo/bar']);
    assertMatches(
      '/docs{/:version}?',
      ['/docs', '/docs/latest', '/docs/canary'],
      ['/', '/docs/latest/api'],
    );
  });

  it('orders routes by specificity', async () => {
    const specificityManifest = await manifestFor([
      'users/new.ts',
      'users/[id].ts',
      'users/new/[tab].ts',
      'users/[id]/settings.ts',
      'docs/[version].ts',
      'docs/[[version]]/index.ts',
      'files/[name].ts',
      'files/[...path].ts',
    ]);
    const specificityPaths = specificityManifest.routes.map((route) =>
      route.path
    );
    assertBefore(specificityPaths, '/users/new', '/users/:id');
    assertBefore(
      specificityPaths,
      '/users/new/:tab',
      '/users/:id/settings',
    );
    assertBefore(specificityPaths, '/docs/:version', '/docs{/:version}?');
    assertBefore(specificityPaths, '/files/:name', '/files/:path*');
  });

  it('rejects ambiguous and invalid route files', async () => {
    await assertDiscoveryError(
      ['blog.ts', 'blog/index.ts'],
      ['blog.ts', 'blog/index.ts', 'equivalent matcher', '/blog'],
    );
    await assertDiscoveryError(
      ['blog/[id].ts', 'blog/[slug].ts'],
      ['blog/[id].ts', 'blog/[slug].ts', 'equivalent matcher'],
    );
    await assertDiscoveryError(
      ['docs/[[release]].ts', 'docs/[[version]].ts'],
      ['docs/[[release]].ts', 'docs/[[version]].ts', 'equivalent matcher'],
    );
    await assertDiscoveryError(
      ['old/[...rest].ts', 'old/[...path].ts'],
      ['old/[...path].ts', 'old/[...rest].ts', 'equivalent matcher'],
    );

    for (
      const invalid of [
        '[].ts',
        '[[ ]].ts',
        '[...].ts',
        '[[name].ts',
        '[name]].ts',
        'foo-[id].ts',
      ]
    ) {
      await assertDiscoveryError([invalid], [invalid, 'Invalid']);
    }
    await assertDiscoveryError(
      ['old/[...path]/edit.ts'],
      ['old/[...path]/edit.ts', 'must be the final route segment'],
    );
    for (
      const duplicateParams of [
        '[id]/[id].ts',
        '[id]/[[id]].ts',
        '[[path]]/[...path].ts',
      ]
    ) {
      await assertDiscoveryError(
        [duplicateParams],
        [
          duplicateParams,
          'Duplicate route parameter "',
          duplicateParams.includes('path') ? 'path' : 'id',
        ],
      );
    }

    const classificationManifest = await manifestFor([
      'my_layout.ts',
      'account_middleware.ts',
      'custom_app.ts',
      'foo.d.ts',
      'ignored.test.ts',
    ]);
    const classificationPaths = classificationManifest.routes.map((route) =>
      route.path
    );
    for (const path of ['/my_layout', '/account_middleware', '/custom_app']) {
      assert(
        classificationPaths.includes(path),
        `${path} was treated as special.`,
      );
    }
    assert(
      !classificationPaths.includes('/foo.d') &&
        !classificationPaths.includes('/ignored.test'),
      'A declaration or test file became a route.',
    );

    await assertDiscoveryError(
      ['nested/_layout.ts', 'nested/_layout.js', 'nested/index.ts'],
      ['Duplicate layout', 'nested/_layout.js', 'nested/_layout.ts'],
    );
    await assertDiscoveryError(
      ['nested/_middleware.ts', 'nested/_middleware.js', 'nested/index.ts'],
      [
        'Duplicate middleware',
        'nested/_middleware.js',
        'nested/_middleware.ts',
      ],
    );
    await assertDiscoveryError(
      ['_app.js'],
      ['Duplicate app wrapper', 'routes/_app.js', 'routes/_app.ts'],
    );

    const missingAppRoot = await mkdtemp(
      join(tmpdir(), 'limette-routes-missing-app-'),
    );
    try {
      await mkdir(join(missingAppRoot, 'routes'), { recursive: true });
      await writeFile(
        join(missingAppRoot, 'routes/index.ts'),
        'export default class Route {}',
      );
      let missingAppError: unknown;
      try {
        await discoverRoutes({ root: missingAppRoot });
      } catch (error) {
        missingAppError = error;
      }
      assert(
        missingAppError instanceof Error &&
          missingAppError.message.includes('Missing app wrapper') &&
          missingAppError.message.includes('routes'),
        `Expected an actionable missing app error, got ${missingAppError}.`,
      );
    } finally {
      await rm(missingAppRoot, { recursive: true });
    }
  });

  it('produces deterministic route identities', async () => {
    const deterministicFiles = [
      'zeta.ts',
      'alpha.ts',
      'users/[id].ts',
      'users/new.ts',
      'nested/_layout.ts',
      'nested/_middleware.ts',
      'nested/index.ts',
    ];
    const firstManifest = await manifestFor(deterministicFiles);
    const secondManifest = await manifestFor([...deterministicFiles].reverse());
    const manifestIdentity = (manifest: typeof firstManifest) =>
      manifest.routes.map((route) => ({
        id: route.id,
        path: route.path,
        routeFile: route.routeFile,
        layouts: route.layouts,
        middlewares: route.middlewares,
      }));
    assert(
      JSON.stringify(manifestIdentity(firstManifest)) ===
        JSON.stringify(manifestIdentity(secondManifest)),
      'Manifest identity depended on filesystem creation/enumeration order.',
    );
    assert(
      firstManifest.routes.every((route) => /^[0-9a-f]{12}$/.test(route.id)),
      'Route IDs are not deterministic 48-bit hexadecimal identities.',
    );
    assert(
      new Set(firstManifest.routes.map((route) => route.id)).size ===
        firstManifest.routes.length,
      'Distinct fixture routes did not receive distinct route IDs.',
    );
  });
});
