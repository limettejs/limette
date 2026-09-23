import * as core from '../../packages/limette/src/mod.ts';
import * as denoAdapter from '../../packages/limette/src/deno.ts';
import * as nodeAdapter from '../../packages/limette/src/node.ts';
import * as browserRuntime from '../../packages/limette/src/runtime/mod.ts';
import * as serverRuntime from '../../packages/limette/src/server-runtime.ts';
import * as viteIntegration from '../../packages/limette/src/vite/mod.ts';
import packageJson from '../../packages/limette/package.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';

function assert(condition: unknown, message: string): asserts condition {
  expect(condition, message).toBeTruthy();
}

describe('public module surfaces', () => {
  it('exports the current core and runtime entry points', () => {
    for (const name of ['App', 'HttpError', 'PageComponent']) {
      assert(name in core, `limette is missing ${name}.`);
    }

    assert(
      JSON.stringify(Object.keys(nodeAdapter).sort()) ===
        JSON.stringify(['serve']),
      `Unexpected limette/node exports: ${Object.keys(nodeAdapter).join(', ')}`,
    );
    assert(
      JSON.stringify(Object.keys(denoAdapter).sort()) ===
        JSON.stringify(['serve']),
      `Unexpected limette/deno exports: ${Object.keys(denoAdapter).join(', ')}`,
    );
    assert(
      JSON.stringify(Object.keys(viteIntegration).sort()) ===
        JSON.stringify(['limette']),
      `Unexpected limette/vite exports: ${
        Object.keys(viteIntegration).join(', ')
      }`,
    );
    assert(
      JSON.stringify(Object.keys(browserRuntime).sort()) ===
        JSON.stringify(['IS_BROWSER']),
      `Unexpected limette/runtime exports: ${
        Object.keys(browserRuntime).join(', ')
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
  });
});
