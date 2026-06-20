import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

function packageName(specifier: string) {
  const segments = specifier.split('/');
  return specifier.startsWith('@')
    ? `${segments[0]}/${segments[1]}`
    : segments[0];
}

function packageSubpath(specifier: string) {
  const name = packageName(specifier);
  return specifier.slice(name.length).replace(/^\/+/, '');
}

function denoNodeModulePath(root: string, specifier: string) {
  const name = packageName(specifier);
  const subpath = packageSubpath(specifier);
  return resolve(
    root,
    'node_modules/.deno/node_modules',
    name,
    subpath,
  );
}

function resolveFromRoot(root: string, specifier: string) {
  const require = createRequire(resolve(root, 'package.json'));

  try {
    return require.resolve(specifier);
  } catch {
    return denoNodeModulePath(root, specifier);
  }
}

function findPackageRoot(path: string) {
  if (existsSync(resolve(path, 'package.json'))) {
    return path;
  }

  let current = dirname(path);

  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'package.json'))) {
      return current;
    }

    current = dirname(current);
  }

  return dirname(path);
}

function packageRootFromRoot(root: string, specifier: string) {
  const name = packageName(specifier);
  const require = createRequire(resolve(root, 'package.json'));

  try {
    const packageJsonPath = require.resolve(`${name}/package.json`);
    return packageJsonPath.slice(0, -'/package.json'.length);
  } catch {
    try {
      return findPackageRoot(resolveFromRoot(root, name));
    } catch {
      return denoNodeModulePath(root, name);
    }
  }
}

export function litResolution(root: string) {
  const litRoot = packageRootFromRoot(root, 'lit');
  const litHtmlRoot = packageRootFromRoot(root, 'lit-html');
  const litElementRoot = packageRootFromRoot(root, 'lit-element');
  const reactiveElementRoot = packageRootFromRoot(
    root,
    '@lit/reactive-element',
  );
  const ssrRoot = packageRootFromRoot(root, '@lit-labs/ssr');
  const ssrClientRoot = packageRootFromRoot(root, '@lit-labs/ssr-client');
  const ssrDomShimRoot = packageRootFromRoot(
    root,
    '@lit-labs/ssr-dom-shim',
  );

  return {
    resolve: {
      alias: [
        {
          find: /^lit$/,
          replacement: resolveFromRoot(root, 'lit'),
        },
        {
          find: /^lit\/(.*)$/,
          replacement: `${litRoot}/$1`,
        },
        {
          find: /^lit-html$/,
          replacement: resolveFromRoot(root, 'lit-html'),
        },
        {
          find: /^lit-html\/(.*)$/,
          replacement: `${litHtmlRoot}/$1`,
        },
        {
          find: /^lit-element$/,
          replacement: resolveFromRoot(root, 'lit-element'),
        },
        {
          find: /^lit-element\/(.*)$/,
          replacement: `${litElementRoot}/$1`,
        },
        {
          find: /^@lit\/reactive-element$/,
          replacement: resolveFromRoot(root, '@lit/reactive-element'),
        },
        {
          find: /^@lit\/reactive-element\/(.*)$/,
          replacement: `${reactiveElementRoot}/$1`,
        },
        {
          find: /^@lit-labs\/ssr$/,
          replacement: resolveFromRoot(root, '@lit-labs/ssr'),
        },
        {
          find: /^@lit-labs\/ssr\/(.*)$/,
          replacement: `${ssrRoot}/$1`,
        },
        {
          find: /^@lit-labs\/ssr-client$/,
          replacement: resolveFromRoot(root, '@lit-labs/ssr-client'),
        },
        {
          find: /^@lit-labs\/ssr-client\/(.*)$/,
          replacement: `${ssrClientRoot}/$1`,
        },
        {
          find: /^@lit-labs\/ssr-dom-shim$/,
          replacement: resolveFromRoot(root, '@lit-labs/ssr-dom-shim'),
        },
        {
          find: /^@lit-labs\/ssr-dom-shim\/(.*)$/,
          replacement: `${ssrDomShimRoot}/$1`,
        },
      ],
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
