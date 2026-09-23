import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));
const fromPackage = (path: string) => resolve(packageRoot, path);

export default {
  entry: {
    index: fromPackage('src/mod.ts'),
    deno: fromPackage('src/deno.ts'),
    node: fromPackage('src/node.ts'),
    vite: fromPackage('src/vite/mod.ts'),
    'internal/server-runtime': fromPackage('src/server-runtime.ts'),
    runtime: fromPackage('src/runtime/mod.ts'),
    'runtime/ssr-client/lit-element-hydrate-support': fromPackage(
      'src/runtime/ssr-client/lit-element-hydrate-support.ts'
    ),
    'runtime/ssr-client/lit-element-hydrate-support-patch': fromPackage(
      'src/runtime/ssr-client/lit-element-hydrate-support-patch.ts'
    ),
  },
  clean: true,
  deps: {
    neverBundle: [
      /^node:/,
      /^lit(?:\/.*)?$/,
      /^@lit-labs\/ssr(?:\/.*)?$/,
      /^@lit-labs\/ssr-client(?:\/.*)?$/,
      /^@lit-labs\/ssr-dom-shim(?:\/.*)?$/,
      'linkedom',
      'vite',
    ],
  },
  dts: {
    eager: true,
  },
  format: 'esm',
  outDir: fromPackage('dist'),
  sourcemap: false,
  target: 'es2022',
};
