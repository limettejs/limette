import { fileURLToPath } from 'node:url';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function moduleGraph(relativeEntry: string) {
  const entry = fileURLToPath(
    new URL(`../../${relativeEntry}`, import.meta.url),
  );
  const output = await new Deno.Command(Deno.execPath(), {
    args: ['info', '--json', entry],
    stdout: 'piped',
    stderr: 'piped',
  }).output();

  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr));
  }

  return new TextDecoder().decode(output.stdout);
}

function assertMissing(
  name: string,
  graph: string,
  forbidden: readonly string[],
) {
  for (const dependency of forbidden) {
    assert(
      !graph.includes(dependency),
      `${name} unexpectedly reaches ${dependency}.`,
    );
  }
}

const neutralForbidden = [
  '"node:',
  '/src/node.ts',
  '/src/deno.ts',
  '/src/vite/',
  'npm:vite',
];
const coreGraph = await moduleGraph('src/mod.ts');
const serverRuntimeGraph = await moduleGraph('src/server-runtime.ts');
assertMissing('@limette/core', coreGraph, neutralForbidden);
assertMissing(
  '@limette/core/internal/server-runtime',
  serverRuntimeGraph,
  neutralForbidden,
);

const nodeGraph = await moduleGraph('src/node.ts');
assert(
  nodeGraph.includes('"node:http"') &&
    nodeGraph.includes('"node:fs/promises"') &&
    nodeGraph.includes('"node:path"'),
  'The Node adapter graph is missing its expected host dependencies.',
);
assertMissing('@limette/core/node', nodeGraph, [
  '/src/deno.ts',
  '/src/vite/',
  'npm:vite',
]);

const denoGraph = await moduleGraph('src/deno.ts');
assertMissing('@limette/core/deno', denoGraph, [
  '"node:',
  '/src/node.ts',
  '/src/vite/',
  'npm:vite',
]);

const viteGraph = await moduleGraph('src/vite/mod.ts');
assert(
  viteGraph.includes('/src/vite/') &&
    viteGraph.includes('"node:fs') &&
    viteGraph.includes('"node:path"'),
  'The Vite integration graph is missing its expected build dependencies.',
);
assertMissing('@limette/core/vite', viteGraph, [
  '/src/node.ts',
  '/src/deno.ts',
]);
