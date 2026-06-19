export default {
  entry: {
    index: 'src/mod.ts',
    deno: 'src/deno.ts',
    node: 'src/node.ts',
    dev: 'src/dev/mod.ts',
    vite: 'src/vite/mod.ts',
    runtime: 'src/runtime/mod.ts',
    'runtime/refresh': 'src/runtime/refresh.ts',
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
      'linkedom',
      'tailwindcss',
      'vite',
    ],
  },
  dts: {
    eager: true,
  },
  format: 'esm',
  outDir: 'dist',
  sourcemap: true,
  target: 'es2022',
};
