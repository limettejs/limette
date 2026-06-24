import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

type Alias = {
  find: RegExp;
  replacement: string;
};

function packageName(specifier: string) {
  const segments = specifier.split('/');
  return specifier.startsWith('@')
    ? `${segments[0]}/${segments[1]}`
    : segments[0];
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

function resolveFromPackages(
  root: string,
  specifier: string,
  fromSpecifiers: string[],
) {
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

function packageRootFromRoot(
  root: string,
  specifier: string,
  fromSpecifiers: string[] = [],
) {
  const name = packageName(specifier);
  const require = createRequire(resolve(root, 'package.json'));

  try {
    return dirname(resolveWith(require, `${name}/package.json`));
  } catch {
    return findPackageRoot(resolveFromPackages(root, name, fromSpecifiers));
  }
}

function addPackageAlias(aliases: Alias[], root: string, specifier: string) {
  const aliasSources: Record<string, string[]> = {
    'lit-html': ['lit', '@lit-labs/ssr'],
    'lit-element': ['lit'],
    '@lit/reactive-element': ['lit', 'lit-element', '@lit-labs/ssr'],
    '@lit-labs/ssr-dom-shim': ['@lit-labs/ssr', '@lit-labs/ssr-client'],
  };
  const fromSpecifiers = aliasSources[specifier] ?? [];

  try {
    const packageRoot = packageRootFromRoot(root, specifier, fromSpecifiers);
    const pattern = escapeRegExp(specifier);

    aliases.push(
      {
        find: new RegExp(`^${pattern}$`),
        replacement: resolveFromPackages(root, specifier, fromSpecifiers),
      },
      {
        find: new RegExp(`^${pattern}/(.*)$`),
        replacement: `${packageRoot}/$1`,
      },
    );
  } catch {
    // Some package managers do not expose transitive packages at the app root.
    // Vite's dedupe/noExternal settings below still keep SSR bundling coherent.
  }
}

function litAliases(root: string) {
  const aliases: Alias[] = [];

  for (
    const specifier of [
      'lit',
      'lit-html',
      'lit-element',
      '@lit/reactive-element',
      '@lit-labs/ssr',
      '@lit-labs/ssr-dom-shim',
    ]
  ) {
    addPackageAlias(aliases, root, specifier);
  }

  return aliases;
}

export function litResolution(root: string) {
  return {
    resolve: {
      alias: litAliases(root),
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
      noExternal: [
        '@limette/core',
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
