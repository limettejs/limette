import { basename, join } from 'node:path';
import { repositoryRoot } from './_paths.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const npm = Deno.build.os === 'windows' ? 'npm.cmd' : 'npm';
const temporaryRoot = await Deno.makeTempDir({ prefix: 'limette-package-' });
const packageDirectory = join(temporaryRoot, 'package');
const runtimeDirectory = join(temporaryRoot, 'runtime-consumer');
const viteDirectory = join(temporaryRoot, 'vite-consumer');
const npmCache = join(temporaryRoot, 'npm-cache');

async function command(
  args: string[],
  cwd: string,
  env?: Record<string, string>,
) {
  const output = await new Deno.Command(npm, {
    args,
    cwd,
    env: { npm_config_cache: npmCache, ...env },
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  if (!output.success) {
    throw new Error(
      `${npm} ${args.join(' ')} failed:\n${
        new TextDecoder().decode(output.stderr)
      }`,
    );
  }
  return new TextDecoder().decode(output.stdout).trim();
}

async function runNode(path: string, cwd: string) {
  const output = await new Deno.Command('node', {
    args: [path],
    cwd,
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr));
  }
}

try {
  await Deno.mkdir(packageDirectory, { recursive: true });
  const packOutput = await command([
    'pack',
    '--ignore-scripts',
    '--pack-destination',
    packageDirectory,
  ], repositoryRoot);
  const archive = join(
    packageDirectory,
    basename(packOutput.split('\n').at(-1)!),
  );

  for (const directory of [runtimeDirectory, viteDirectory]) {
    await Deno.mkdir(directory, { recursive: true });
    await Deno.writeTextFile(
      join(directory, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    );
  }

  await command([
    'install',
    '--ignore-scripts',
    '--no-package-lock',
    '--no-audit',
    '--no-fund',
    '--omit=optional',
    archive,
  ], runtimeDirectory);
  for (const absent of ['vite', 'typescript', 'tailwindcss']) {
    let exists = true;
    try {
      await Deno.stat(join(runtimeDirectory, 'node_modules', absent));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) exists = false;
      else throw error;
    }
    assert(!exists, `Runtime-only install unexpectedly contains ${absent}.`);
  }
  const runtimeTest = join(runtimeDirectory, 'test.mjs');
  await Deno.writeTextFile(
    runtimeTest,
    `import { App } from '@limette/core';
import { serve } from '@limette/core/node';
const app = new App().get('/ok', () => new Response('ok'));
const response = await app.handler()(new Request('http://localhost/ok'));
if (await response.text() !== 'ok' || typeof serve !== 'function') process.exit(1);
`,
  );
  await runNode(runtimeTest, runtimeDirectory);

  await command([
    'install',
    '--ignore-scripts',
    '--no-package-lock',
    '--no-audit',
    '--no-fund',
    archive,
    'vite@^8.0.0',
  ], viteDirectory);
  const viteTest = join(viteDirectory, 'test.mjs');
  await Deno.writeTextFile(
    viteTest,
    `import { limette } from '@limette/core/vite';
const plugin = limette({ app: './app.ts' });
if (plugin.name !== 'limette') process.exit(1);
`,
  );
  await runNode(viteTest, viteDirectory);
} finally {
  await Deno.remove(temporaryRoot, { recursive: true });
}
