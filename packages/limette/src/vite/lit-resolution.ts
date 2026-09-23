import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

type Alias = {
  find: RegExp;
  replacement: string;
};

const PACKAGE_ENTRIES: Readonly<Record<string, string>> = {
  lit: 'index.js',
  'lit-html': 'lit-html.js',
  'lit-element': 'lit-element.js',
  '@lit/reactive-element': 'reactive-element.js',
  '@lit-labs/ssr': 'index.js',
  '@lit-labs/ssr-client': 'index.js',
  '@lit-labs/ssr-dom-shim': 'index.js',
};

const CONDITIONAL_LIT_PACKAGES = [
  'lit',
  'lit-html',
  'lit-element',
  '@lit/reactive-element',
] as const;

const ALIAS_SOURCES: Readonly<Record<string, string[]>> = {
  'lit-html': ['lit', '@lit-labs/ssr'],
  'lit-element': ['lit'],
  '@lit/reactive-element': ['lit', 'lit-element', '@lit-labs/ssr'],
  '@lit-labs/ssr': ['limette'],
  '@lit-labs/ssr-client': ['limette', '@lit-labs/ssr'],
  '@lit-labs/ssr-dom-shim': ['limette', '@lit-labs/ssr', '@lit-labs/ssr-client'],
};

function packageName(specifier: string) {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveWith(require: NodeRequire, specifier: string) {
  return realpathSync(require.resolve(specifier));
}

function findPackageRoot(path: string) {
  if (existsSync(resolve(path, 'package.json'))) {
    return realpathSync(path);
  }

  let current = dirname(path);

  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'package.json'))) {
      return realpathSync(current);
    }

    current = dirname(current);
  }

  return realpathSync(dirname(path));
}

function resolveFromRoot(root: string, specifier: string) {
  const require = createRequire(resolve(root, 'package.json'));
  return resolveWith(require, specifier);
}

function resolveFromPackages(root: string, specifier: string, fromSpecifiers: string[]) {
  try {
    return resolveFromRoot(root, specifier);
  } catch (rootError) {
    for (const fromSpecifier of fromSpecifiers) {
      try {
        const fromRoot = packageRootFromRoot(root, fromSpecifier);
        const require = createRequire(resolve(fromRoot, 'package.json'));
        return resolveWith(require, specifier);
      } catch {
        // Try the next importer package.
      }
    }

    throw rootError;
  }
}

function packageRootFromRoot(root: string, specifier: string, fromSpecifiers: string[] = []) {
  const name = packageName(specifier);
  const require = createRequire(resolve(root, 'package.json'));

  try {
    return dirname(resolveWith(require, `${name}/package.json`));
  } catch {
    return findPackageRoot(resolveFromPackages(root, name, fromSpecifiers));
  }
}

function addPackageAlias(aliases: Alias[], root: string, specifier: string) {
  const fromSpecifiers = ALIAS_SOURCES[specifier] ?? [];

  try {
    const packageRoot = packageRootFromRoot(root, specifier, fromSpecifiers);
    const pattern = escapeRegExp(specifier);
    aliases.push(
      {
        find: new RegExp(`^${pattern}$`),
        replacement: resolve(packageRoot, PACKAGE_ENTRIES[specifier]!),
      },
      {
        find: new RegExp(`^${pattern}/(.*)$`),
        replacement: `${packageRoot}/$1`,
      }
    );
  } catch {
    // Some package managers do not expose transitive packages at the app root.
    // Vite's dedupe/noExternal settings below still keep SSR bundling coherent.
  }
}

function litAliases(root: string, includeCore: boolean) {
  const aliases: Alias[] = [];

  for (const specifier of [
    ...(includeCore ? CONDITIONAL_LIT_PACKAGES : []),
    '@lit-labs/ssr',
    '@lit-labs/ssr-client',
    '@lit-labs/ssr-dom-shim',
  ]) {
    addPackageAlias(aliases, root, specifier);
  }

  return aliases;
}

export function resolveLitPackageId(root: string, id: string, server: boolean) {
  const [specifier, query] = id.split('?', 2);
  const packageSpecifier = CONDITIONAL_LIT_PACKAGES.find(
    (candidate) => specifier === candidate || specifier.startsWith(`${candidate}/`)
  );
  if (!packageSpecifier) return;

  const fromSpecifiers = ALIAS_SOURCES[packageSpecifier] ?? [];
  let resolved: string;
  if (server) {
    // Resolve only core Lit through its server exports. A global `node`
    // condition makes other packages, notably ssr-client, import Node APIs.
    resolved = resolveFromPackages(root, specifier, fromSpecifiers);
  } else {
    const packageRoot = packageRootFromRoot(root, packageSpecifier, fromSpecifiers);
    const subpath = specifier.slice(packageSpecifier.length + 1);
    resolved = subpath
      ? resolve(packageRoot, subpath)
      : resolve(packageRoot, PACKAGE_ENTRIES[packageSpecifier]!);
  }

  return query ? `${resolved}?${query}` : resolved;
}

export function litResolution(root: string, includeCoreAliases = true) {
  return {
    resolve: {
      alias: litAliases(root, includeCoreAliases),
      dedupe: [
        '@lit-labs/ssr',
        '@lit-labs/ssr-client',
        '@lit/reactive-element',
        'lit',
        'lit-element',
        'lit-html',
      ],
    },
    ssr: {
      resolve: {
        conditions: ['module', 'development|production'],
      },
      noExternal: [
        'limette',
        '@lit-labs/ssr',
        '@lit-labs/ssr-client',
        '@lit/reactive-element',
        'lit',
        'lit-element',
        'lit-html',
        'parse5',
        '@parse5/tools',
        'entities',
      ],
    },
  };
}
