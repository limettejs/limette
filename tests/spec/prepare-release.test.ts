import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatSummary,
  isVersionCoveredByCaretBaseline,
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
  lockLimetteVersion = limetteVersion,
  lockInitializerVersion = initializerVersion,
}: {
  limetteVersion?: string;
  initializerVersion?: string;
  generatedLimetteVersion?: string;
  lockLimetteVersion?: string;
  lockInitializerVersion?: string;
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
          'packages/limette': { version: lockLimetteVersion },
          'packages/create-limette': { version: lockInitializerVersion },
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
  it('uses npm caret compatibility boundaries', () => {
    expect(isVersionCoveredByCaretBaseline('0.3.0', '0.3.9')).toBe(true);
    expect(isVersionCoveredByCaretBaseline('0.3.0', '0.4.0')).toBe(false);
    expect(isVersionCoveredByCaretBaseline('0.3.0', '0.4.0-beta.1')).toBe(false);
    expect(isVersionCoveredByCaretBaseline('0.0.3', '0.0.3')).toBe(true);
    expect(isVersionCoveredByCaretBaseline('0.0.3', '0.0.4')).toBe(false);
    expect(isVersionCoveredByCaretBaseline('1.2.0', '1.9.9')).toBe(true);
    expect(isVersionCoveredByCaretBaseline('1.2.0', '2.0.0')).toBe(false);
    expect(isVersionCoveredByCaretBaseline('1.2.0', '2.0.0-beta.1')).toBe(false);
  });

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
  it('keeps a compatible Limette baseline for a patch release', async () => {
    const root = await fixture({
      limetteVersion: '0.3.1',
      generatedLimetteVersion: '0.3.0',
    });
    const result = await prepareRelease({
      root,
      packageName: 'limette',
      requestedVersion: 'patch',
      updatePackageLock: updateFixtureLockfile,
    });

    expect(result).toMatchObject({
      currentVersion: '0.3.1',
      nextVersion: '0.3.2',
      tag: '0.3.2',
    });
    expect(result.updates).not.toContain('packages/create-limette/src/index.ts');
    expect(
      JSON.parse(await readFile(join(root, 'packages/limette/package.json'), 'utf8')).version
    ).toBe('0.3.2');
    expect(await readFile(join(root, 'packages/create-limette/src/index.ts'), 'utf8')).toContain(
      "const LIMETTE_VERSION = '0.3.0';"
    );
    expect(
      JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8')).packages
    ).toMatchObject({ 'packages/limette': { version: '0.3.2' } });
  });

  it.each([
    {
      name: 'updates a 0.x baseline for a minor release',
      current: '0.3.5',
      baseline: '0.3.0',
      bump: 'minor',
      next: '0.4.0',
      expectedBaseline: '0.4.0',
      changesBaseline: true,
    },
    {
      name: 'updates a 0.x baseline for a major release',
      current: '0.4.5',
      baseline: '0.4.0',
      bump: 'major',
      next: '1.0.0',
      expectedBaseline: '1.0.0',
      changesBaseline: true,
    },
    {
      name: 'keeps a compatible 1.x baseline for a minor release',
      current: '1.2.5',
      baseline: '1.2.0',
      bump: 'minor',
      next: '1.3.0',
      expectedBaseline: '1.2.0',
      changesBaseline: false,
    },
    {
      name: 'updates a 1.x baseline for a major release',
      current: '1.9.0',
      baseline: '1.2.0',
      bump: 'major',
      next: '2.0.0',
      expectedBaseline: '2.0.0',
      changesBaseline: true,
    },
  ])('$name', async ({ current, baseline, bump, next, expectedBaseline, changesBaseline }) => {
    const root = await fixture({
      limetteVersion: current,
      generatedLimetteVersion: baseline,
    });
    const result = await prepareRelease({
      root,
      packageName: 'limette',
      requestedVersion: bump,
      updatePackageLock: updateFixtureLockfile,
    });

    expect(result.nextVersion).toBe(next);
    expect(result.updates.includes('packages/create-limette/src/index.ts')).toBe(changesBaseline);
    expect(await readFile(join(root, 'packages/create-limette/src/index.ts'), 'utf8')).toContain(
      `const LIMETTE_VERSION = '${expectedBaseline}';`
    );
  });

  it.each([
    {
      name: 'keeps the stable baseline for a first 0.x prerelease',
      current: '0.3.5',
      baseline: '0.3.0',
      next: '0.4.0-beta.1',
      expectedBaseline: '0.3.0',
      changesBaseline: false,
    },
    {
      name: 'accepts a subsequent 0.x prerelease',
      current: '0.4.0-beta.1',
      baseline: '0.3.0',
      next: '0.4.0-beta.2',
      expectedBaseline: '0.3.0',
      changesBaseline: false,
    },
    {
      name: 'advances the stable baseline after a 0.x prerelease',
      current: '0.4.0-beta.2',
      baseline: '0.3.0',
      next: '0.4.0',
      expectedBaseline: '0.4.0',
      changesBaseline: true,
    },
    {
      name: 'keeps the stable baseline for a 1.x major prerelease',
      current: '1.9.0',
      baseline: '1.2.0',
      next: '2.0.0-beta.1',
      expectedBaseline: '1.2.0',
      changesBaseline: false,
    },
    {
      name: 'advances the stable baseline after a major prerelease',
      current: '2.0.0-beta.1',
      baseline: '1.2.0',
      next: '2.0.0',
      expectedBaseline: '2.0.0',
      changesBaseline: true,
    },
  ])('$name', async ({ current, baseline, next, expectedBaseline, changesBaseline }) => {
    const root = await fixture({
      limetteVersion: current,
      generatedLimetteVersion: baseline,
    });
    const result = await prepareRelease({
      root,
      packageName: 'limette',
      requestedVersion: next,
      updatePackageLock: updateFixtureLockfile,
    });

    expect(result.nextVersion).toBe(next);
    expect(result.updates.includes('packages/create-limette/src/index.ts')).toBe(changesBaseline);
    expect(await readFile(join(root, 'packages/create-limette/src/index.ts'), 'utf8')).toContain(
      `const LIMETTE_VERSION = '${expectedBaseline}';`
    );
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

  it('rejects incompatible Limette baseline drift before modifying files', async () => {
    const root = await fixture({
      limetteVersion: '0.4.0',
      generatedLimetteVersion: '0.3.0',
    });
    const manifestPath = join(root, 'packages/limette/package.json');
    const originalManifest = await readFile(manifestPath, 'utf8');

    await expect(
      prepareRelease({
        root,
        packageName: 'limette',
        requestedVersion: 'patch',
        updatePackageLock: updateFixtureLockfile,
      })
    ).rejects.toThrow('Limette version drift');
    expect(await readFile(manifestPath, 'utf8')).toBe(originalManifest);
  });

  it('rejects a prerelease that does not come after the stable baseline', async () => {
    const root = await fixture({
      limetteVersion: '0.3.0-beta.1',
      generatedLimetteVersion: '0.4.0',
    });
    const manifestPath = join(root, 'packages/limette/package.json');
    const originalManifest = await readFile(manifestPath, 'utf8');

    await expect(
      prepareRelease({
        root,
        packageName: 'limette',
        requestedVersion: '0.3.0-beta.2',
        updatePackageLock: updateFixtureLockfile,
      })
    ).rejects.toThrow('Limette version drift');
    expect(await readFile(manifestPath, 'utf8')).toBe(originalManifest);
  });

  it('accepts a compatible lagging Limette baseline', async () => {
    const root = await fixture({
      limetteVersion: '0.3.4',
      generatedLimetteVersion: '0.3.0',
    });

    await expect(
      prepareRelease({
        root,
        packageName: 'limette',
        requestedVersion: 'patch',
        updatePackageLock: updateFixtureLockfile,
      })
    ).resolves.toMatchObject({ nextVersion: '0.3.5', baselineChange: undefined });
  });

  it('rejects current package-lock drift before modifying files', async () => {
    const root = await fixture({
      limetteVersion: '0.3.1',
      generatedLimetteVersion: '0.3.0',
      lockLimetteVersion: '0.3.0',
    });
    const manifestPath = join(root, 'packages/limette/package.json');
    const originalManifest = await readFile(manifestPath, 'utf8');

    await expect(
      prepareRelease({
        root,
        packageName: 'limette',
        requestedVersion: 'patch',
        updatePackageLock: updateFixtureLockfile,
      })
    ).rejects.toThrow('package-lock.json version drift');
    expect(await readFile(manifestPath, 'utf8')).toBe(originalManifest);
  });

  it('prints the baseline note conditionally and includes git status', async () => {
    const changingRoot = await fixture({
      limetteVersion: '0.3.5',
      generatedLimetteVersion: '0.3.0',
    });
    const changingResult = await prepareRelease({
      root: changingRoot,
      packageName: 'limette',
      requestedVersion: 'minor',
      updatePackageLock: updateFixtureLockfile,
    });
    const changingSummary = formatSummary(changingResult);
    expect(changingSummary).toContain('create-limette source now targets Limette ^0.4.0.');
    expect(changingSummary).toContain('git status --short\n  git diff');

    const compatibleRoot = await fixture({
      limetteVersion: '0.3.1',
      generatedLimetteVersion: '0.3.0',
    });
    const compatibleResult = await prepareRelease({
      root: compatibleRoot,
      packageName: 'limette',
      requestedVersion: 'patch',
      updatePackageLock: updateFixtureLockfile,
    });
    expect(formatSummary(compatibleResult)).not.toContain('create-limette source now targets');
  });

  it('restores version files when the lockfile refresh fails', async () => {
    const root = await fixture({
      limetteVersion: '0.3.5',
      generatedLimetteVersion: '0.3.0',
    });
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
        requestedVersion: 'minor',
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
