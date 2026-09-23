import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

const PACKAGES = {
  limette: 'packages/limette/package.json',
  'create-limette': 'packages/create-limette/package.json',
};
const BUMPS = new Set(['patch', 'minor', 'major']);
const LIMETTE_SOURCE = 'packages/create-limette/src/index.ts';
const LOCKFILE = 'package-lock.json';
const LIMETTE_VERSION_PATTERN = /const LIMETTE_VERSION = (['"])([^'"]+)\1;/g;

export const usage = `Usage:
  npm run release:prepare -- <package> <version-or-bump>

Packages:
  limette | create-limette

Version or bump:
  patch | minor | major | <semver>`;

function fail(message) {
  throw new Error(message);
}

function isSupportedPackage(packageName) {
  return Object.hasOwn(PACKAGES, packageName);
}

export function parseVersion(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      version
    );
  if (!match) return;

  const prerelease = match[4]?.split('.') ?? [];
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    return;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
    version,
  };
}

function compareIdentifiers(left, right) {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : undefined;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : undefined;
  if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber - rightNumber;
  if (leftNumber !== undefined) return -1;
  if (rightNumber !== undefined) return 1;
  return left === right ? 0 : left < right ? -1 : 1;
}

export function compareVersions(leftVersion, rightVersion) {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);
  if (!left || !right) fail('Cannot compare invalid semantic versions.');

  for (const key of ['major', 'minor', 'patch']) {
    const difference = left[key] - right[key];
    if (difference !== 0) return Math.sign(difference);
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return left.prerelease.length === right.prerelease.length
      ? 0
      : left.prerelease.length === 0
        ? 1
        : -1;
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index++) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const difference = compareIdentifiers(left.prerelease[index], right.prerelease[index]);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function isVersionCoveredByCaretBaseline(baselineVersion, version) {
  const baseline = parseVersion(baselineVersion);
  if (!baseline || baseline.prerelease.length > 0) {
    fail(`Invalid stable Limette caret baseline "${baselineVersion}".`);
  }
  const candidate = parseVersion(version);
  if (!candidate) fail(`Invalid semantic version "${version}".`);
  if (candidate.prerelease.length > 0) return false;
  if (compareVersions(version, baselineVersion) < 0) return false;

  const upperBound =
    baseline.major > 0
      ? `${baseline.major + 1}.0.0`
      : baseline.minor > 0
        ? `0.${baseline.minor + 1}.0`
        : `0.0.${baseline.patch + 1}`;

  return compareVersions(version, upperBound) < 0;
}

export function parseArguments(args) {
  if (args.length !== 2) fail('Expected a package and a version or bump.');
  const [packageName, requestedVersion] = args;
  if (!isSupportedPackage(packageName)) fail(`Unknown package "${packageName}".`);
  if (!BUMPS.has(requestedVersion) && !parseVersion(requestedVersion)) {
    fail(`Invalid version or bump "${requestedVersion}".`);
  }
  return { packageName, requestedVersion };
}

export function resolveNextVersion(currentVersion, requestedVersion) {
  const current = parseVersion(currentVersion);
  if (!current) fail(`Current package version "${currentVersion}" is not valid semver.`);

  if (!BUMPS.has(requestedVersion)) {
    if (!parseVersion(requestedVersion)) fail(`Invalid version or bump "${requestedVersion}".`);
    if (compareVersions(requestedVersion, currentVersion) <= 0) {
      fail(`Requested version ${requestedVersion} must be newer than ${currentVersion}.`);
    }
    return requestedVersion;
  }

  if (requestedVersion === 'major') {
    return current.prerelease.length > 0 && current.minor === 0 && current.patch === 0
      ? `${current.major}.0.0`
      : `${current.major + 1}.0.0`;
  }
  if (requestedVersion === 'minor') {
    return current.prerelease.length > 0 && current.patch === 0
      ? `${current.major}.${current.minor}.0`
      : `${current.major}.${current.minor + 1}.0`;
  }
  return current.prerelease.length > 0
    ? `${current.major}.${current.minor}.${current.patch}`
    : `${current.major}.${current.minor}.${current.patch + 1}`;
}

export function releaseTagFor(packageName, version) {
  if (!isSupportedPackage(packageName)) fail(`Unknown package "${packageName}".`);
  return packageName === 'limette' ? version : `create-limette@${version}`;
}

function readLimetteVersionConstant(source) {
  const matches = [...source.matchAll(LIMETTE_VERSION_PATTERN)];
  if (matches.length !== 1) {
    fail(`Expected exactly one LIMETTE_VERSION declaration in ${LIMETTE_SOURCE}.`);
  }

  return { baselineVersion: matches[0][2], match: matches[0] };
}

export function updateLimetteVersionConstant(source, nextVersion) {
  const { match } = readLimetteVersionConstant(source);

  return `${source.slice(0, match.index)}const LIMETTE_VERSION = ${match[1]}${nextVersion}${match[1]};${source.slice(
    match.index + match[0].length
  )}`;
}

async function readJson(path, description) {
  let source;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    fail(`Could not read ${description} at ${path}: ${error.message}`);
  }
  try {
    return { source, value: JSON.parse(source) };
  } catch (error) {
    fail(`Could not parse ${description} at ${path}: ${error.message}`);
  }
}

async function refreshPackageLock(root) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  await execFileAsync(
    npm,
    ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: root }
  );
}

async function restoreFiles(files) {
  for (const [path, source] of files) await writeFile(path, source);
}

export async function prepareRelease({
  root = process.cwd(),
  packageName,
  requestedVersion,
  updatePackageLock = refreshPackageLock,
}) {
  if (!isSupportedPackage(packageName)) fail(`Unknown package "${packageName}".`);

  const packagePath = resolve(root, PACKAGES[packageName]);
  const lockfilePath = resolve(root, LOCKFILE);
  const packageFile = await readJson(packagePath, `${packageName} package manifest`);
  if (packageFile.value.name !== packageName) {
    fail(`${PACKAGES[packageName]} must declare name "${packageName}".`);
  }
  const currentVersion = packageFile.value.version;
  const nextVersion = resolveNextVersion(currentVersion, requestedVersion);
  const lockfile = await readJson(lockfilePath, LOCKFILE);
  const lockPackagePath = PACKAGES[packageName].replace('/package.json', '');
  const currentLockPackage = lockfile.value.packages?.[lockPackagePath];
  if (!currentLockPackage) {
    fail(`${LOCKFILE} is missing workspace metadata for ${packageName}.`);
  }
  if (currentLockPackage.version !== currentVersion) {
    fail(
      `${LOCKFILE} version drift: ${packageName} is ${currentVersion}, but its workspace lock entry is ${currentLockPackage.version ?? '<missing>'}.`
    );
  }

  const originals = [
    [packagePath, packageFile.source],
    [lockfilePath, lockfile.source],
  ];
  const updates = [PACKAGES[packageName]];
  let initializerUpdate;
  let baselineChange;
  if (packageName === 'limette') {
    const initializerPath = resolve(root, LIMETTE_SOURCE);
    const initializerSource = await readFile(initializerPath, 'utf8').catch((error) =>
      fail(`Could not read ${LIMETTE_SOURCE}: ${error.message}`)
    );
    const { baselineVersion } = readLimetteVersionConstant(initializerSource);
    const current = parseVersion(currentVersion);
    const currentIsCovered = isVersionCoveredByCaretBaseline(baselineVersion, currentVersion);
    const currentIsValid =
      current.prerelease.length > 0
        ? compareVersions(currentVersion, baselineVersion) > 0
        : currentIsCovered;
    if (!currentIsValid) {
      fail(
        `Limette version drift: create-limette targets ^${baselineVersion}, but the current Limette package is ${currentVersion}.`
      );
    }

    const next = parseVersion(nextVersion);
    if (
      next.prerelease.length === 0 &&
      !isVersionCoveredByCaretBaseline(baselineVersion, nextVersion)
    ) {
      initializerUpdate = {
        path: initializerPath,
        source: updateLimetteVersionConstant(initializerSource, nextVersion),
      };
      originals.push([initializerPath, initializerSource]);
      updates.push(LIMETTE_SOURCE);
      baselineChange = { from: baselineVersion, to: nextVersion };
    }
  }

  packageFile.value.version = nextVersion;
  try {
    await writeFile(packagePath, `${JSON.stringify(packageFile.value, null, 2)}\n`);
    if (initializerUpdate) await writeFile(initializerUpdate.path, initializerUpdate.source);
    await updatePackageLock(root);

    const updatedLockfile = await readJson(lockfilePath, LOCKFILE);
    const lockPackage = updatedLockfile.value.packages?.[lockPackagePath];
    if (lockPackage?.version !== nextVersion) {
      fail(`${LOCKFILE} was not updated to ${packageName} ${nextVersion}.`);
    }
  } catch (error) {
    try {
      await restoreFiles(originals);
    } catch (restoreError) {
      throw new Error(
        `Release preparation failed (${error.message}) and restoring files also failed: ${restoreError.message}`
      );
    }
    throw new Error(`Release preparation failed; version files were restored: ${error.message}`);
  }

  updates.push(LOCKFILE);
  return {
    currentVersion,
    nextVersion,
    packageName,
    tag: releaseTagFor(packageName, nextVersion),
    updates,
    baselineChange,
  };
}

export function formatSummary(result) {
  const addPaths = result.updates.join(' ');
  const note = result.baselineChange
    ? `\n\nNote:\n  create-limette source now targets Limette ^${result.baselineChange.to}.\n  The currently published create-limette package will continue generating\n  its previous Limette range until create-limette is released separately.`
    : '';
  return `Prepared ${result.packageName} release

  Version: ${result.currentVersion} -> ${result.nextVersion}
  Tag:     ${result.tag}

Updated:
${result.updates.map((path) => `  ${path}`).join('\n')}${note}

Next steps:

  git status --short
  git diff
  git add ${addPaths}
  git commit -m "chore: prepare ${result.packageName} ${result.nextVersion}"

  # after the commit is merged / on the commit you want to release:
  git tag '${result.tag}'
  git push origin '${result.tag}'

  Then create and publish a GitHub Release for tag:
    ${result.tag}`;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(usage);
    return;
  }
  const options = parseArguments(args);
  console.log(formatSummary(await prepareRelease(options)));
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(`Error: ${error.message}\n\n${usage}`);
    process.exitCode = 1;
  });
}
