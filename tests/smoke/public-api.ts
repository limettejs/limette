import * as core from '../../src/mod.ts';
import * as denoAdapter from '../../src/deno.ts';
import * as nodeAdapter from '../../src/node.ts';
import * as serverRuntime from '../../src/server-runtime.ts';
import * as viteIntegration from '../../src/vite/mod.ts';
import packageJson from '../../package.json' with { type: 'json' };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

for (const name of ['App', 'HttpError', 'PageComponent']) {
  assert(name in core, `@limette/core is missing ${name}.`);
}
for (
  const removed of [
    'fsRoutes',
    'tailwind',
    'staticFiles',
    'serve',
    'serveHandler',
  ]
) {
  assert(!(removed in core), `@limette/core still exports ${removed}.`);
}

assert(
  JSON.stringify(Object.keys(nodeAdapter).sort()) === JSON.stringify(['serve']),
  `Unexpected @limette/core/node exports: ${
    Object.keys(nodeAdapter).join(', ')
  }`,
);
assert(
  JSON.stringify(Object.keys(denoAdapter).sort()) ===
    JSON.stringify(['serve']),
  `Unexpected @limette/core/deno exports: ${
    Object.keys(denoAdapter).join(', ')
  }`,
);
assert(
  JSON.stringify(Object.keys(viteIntegration).sort()) ===
    JSON.stringify(['limette']),
  `Unexpected @limette/core/vite exports: ${
    Object.keys(viteIntegration).join(', ')
  }`,
);
assert(
  JSON.stringify(Object.keys(serverRuntime).sort()) ===
    JSON.stringify(['registerRouteDefinitions']),
  `Unexpected internal server runtime exports: ${
    Object.keys(serverRuntime).join(', ')
  }`,
);

for (
  const path of [
    '.',
    './vite',
    './node',
    './deno',
    './internal/server-runtime',
  ]
) {
  assert(path in packageJson.exports, `Missing package export ${path}.`);
}
