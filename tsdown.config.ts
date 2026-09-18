export default {
  entry: {
    index: 'src/mod.ts',
    deno: 'src/deno.ts',
    node: 'src/node.ts',
    vite: 'src/vite/mod.ts',
    'internal/server-runtime': 'src/server-runtime.ts',
    runtime: 'src/runtime/mod.ts',
    'runtime/ssr-client/lit-element-hydrate-support':
      'src/runtime/ssr-client/lit-element-hydrate-support.ts',
    'runtime/ssr-client/lit-element-hydrate-support-patch':
      'src/runtime/ssr-client/lit-element-hydrate-support-patch.ts',
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
  outDir: 'dist',
  sourcemap: false,
  target: 'es2022',
};
