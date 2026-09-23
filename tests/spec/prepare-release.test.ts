import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseArguments,
  prepareRelease,
  releaseTagFor,
  resolveNextVersion,
} from '../../scripts/prepare-release.js';

const temporaryRoots: string[] = [];

async function fixture({
  limetteVersion = '0.3.0',
  initializerVersion = '0.1.0',
  generatedLimetteVersion = limetteVersion,
}: {
  limetteVersion?: string;
  initializerVersion?: string;
  generatedLimetteVersion?: string;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'limette-release-'));
  temporaryRoots.push(root);
  await mkdir(join(root, 'packages/limette'), { recursive: true });
  await mkdir(join(root, 'packages/create-limette/src'), { recursive: true });
  await writeFile(
    join(root, 'packages/limette/package.json'),
    `${JSON.stringify({ name: 'limette', version: limetteVersion }, null, 2)}\n`
  );
  await writeFile(
    join(root, 'packages/create-limette/package.json'),
    `${JSON.stringify({ name: 'create-limette', version: initializerVersion }, null, 2)}\n`
  );
  await writeFile(
    join(root, 'packages/create-limette/src/index.ts'),
    `const LIMETTE_VERSION = '${generatedLimetteVersion}';\n`
  );
  await writeFile(
    join(root, 'package-lock.json'),
    `${JSON.stringify(
      {
        lockfileVersion: 3,
        packages: {
          'packages/limette': { version: limetteVersion },
          'packages/create-limette': { version: initializerVersion },
        },
      },
      null,
      2
    )}\n`
  );
  return root;
}

async function updateFixtureLockfile(root: string) {
  const lockPath = join(root, 'package-lock.json');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  for (const packageName of ['limette', 'create-limette']) {
    const manifest = JSON.parse(
      await readFile(join(root, `packages/${packageName}/package.json`), 'utf8')
    );
    lock.packages[`packages/${packageName}`].version = manifest.version;
  }
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe('release version calculation', () => {
  it('calculates Limette patch, minor, major, and explicit versions', () => {
    expect(resolveNextVersion('0.3.0', 'patch')).toBe('0.3.1');
    expect(resolveNextVersion('0.3.0', 'minor')).toBe('0.4.0');
    expect(resolveNextVersion('0.3.0', 'major')).toBe('1.0.0');
    expect(resolveNextVersion('0.3.0', '0.5.0')).toBe('0.5.0');
    expect(releaseTagFor('limette', '0.3.1')).toBe('0.3.1');
  });

  it('calculates the create-limette patch version and tag', () => {
    expect(resolveNextVersion('0.1.0', 'patch')).toBe('0.1.1');
    expect(releaseTagFor('create-limette', '0.1.1')).toBe('create-limette@0.1.1');
  });

  it('rejects invalid packages, requests, and non-increasing versions', () => {
    expect(() => parseArguments([])).toThrow('Expected a package');
    expect(() => parseArguments(['limette'])).toThrow('Expected a package');
    expect(() => parseArguments(['unknown', 'patch'])).toThrow('Unknown package');
    expect(() => parseArguments(['limette', 'banana'])).toThrow('Invalid version or bump');
    expect(() => resolveNextVersion('0.3.0', '0.3.0')).toThrow('must be newer');
    expect(() => resolveNextVersion('0.3.0', '0.2.9')).toThrow('must be newer');
  });
});

describe('release preparation', () => {
  it('updates Limette, its initializer constant, and the lockfile', async () => {
    const root = await fixture();
    const result = await prepareRelease({
      root,
      packageName: 'limette',
      requestedVersion: 'patch',
      updatePackageLock: updateFixtureLockfile,
    });

    expect(result).toMatchObject({
      currentVersion: '0.3.0',
      nextVersion: '0.3.1',
      tag: '0.3.1',
    });
    expect(
      JSON.parse(await readFile(join(root, 'packages/limette/package.json'), 'utf8')).version
    ).toBe('0.3.1');
    expect(await readFile(join(root, 'packages/create-limette/src/index.ts'), 'utf8')).toContain(
      "const LIMETTE_VERSION = '0.3.1';"
    );
    expect(
      JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8')).packages
    ).toMatchObject({ 'packages/limette': { version: '0.3.1' } });
  });

  it('updates only the create-limette version and lock metadata', async () => {
    const root = await fixture();
    const sourcePath = join(root, 'packages/create-limette/src/index.ts');
    const originalSource = await readFile(sourcePath, 'utf8');
    await prepareRelease({
      root,
      packageName: 'create-limette',
      requestedVersion: 'patch',
      updatePackageLock: updateFixtureLockfile,
    });

    expect(
      JSON.parse(await readFile(join(root, 'packages/create-limette/package.json'), 'utf8')).version
    ).toBe('0.1.1');
    expect(
      JSON.parse(await readFile(join(root, 'packages/limette/package.json'), 'utf8')).version
    ).toBe('0.3.0');
    expect(await readFile(sourcePath, 'utf8')).toBe(originalSource);
  });

  it('rejects Limette version drift before modifying files', async () => {
    const root = await fixture({ generatedLimetteVersion: '0.2.9' });
    const manifestPath = join(root, 'packages/limette/package.json');
    const originalManifest = await readFile(manifestPath, 'utf8');

    await expect(
      prepareRelease({
        root,
        packageName: 'limette',
        requestedVersion: 'patch',
        updatePackageLock: updateFixtureLockfile,
      })
    ).rejects.toThrow('version drift');
    expect(await readFile(manifestPath, 'utf8')).toBe(originalManifest);
  });

  it('restores version files when the lockfile refresh fails', async () => {
    const root = await fixture();
    const manifestPath = join(root, 'packages/limette/package.json');
    const sourcePath = join(root, 'packages/create-limette/src/index.ts');
    const originals = await Promise.all([
      readFile(manifestPath, 'utf8'),
      readFile(sourcePath, 'utf8'),
      readFile(join(root, 'package-lock.json'), 'utf8'),
    ]);

    await expect(
      prepareRelease({
        root,
        packageName: 'limette',
        requestedVersion: 'patch',
        updatePackageLock: async () => {
          throw new Error('npm failed');
        },
      })
    ).rejects.toThrow('version files were restored');
    await expect(
      Promise.all([
        readFile(manifestPath, 'utf8'),
        readFile(sourcePath, 'utf8'),
        readFile(join(root, 'package-lock.json'), 'utf8'),
      ])
    ).resolves.toEqual(originals);
  });
});
