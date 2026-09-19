import { basename, join } from 'node:path';
import { repositoryRoot } from './_paths.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run(
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
) {
  const output = await new Deno.Command(Deno.execPath(), {
    args,
    cwd,
    env,
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  if (!output.success) {
    throw new Error(
      `deno ${args.join(' ')} failed:\n${
        new TextDecoder().decode(output.stderr)
      }`,
    );
  }
}

async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

const temporaryRoot = await Deno.makeTempDir({ prefix: 'limette-init-' });
const projectName = 'generated-app';
const projectRoot = join(temporaryRoot, projectName);
const packageDirectory = join(temporaryRoot, 'package');
const packedConsumer = join(temporaryRoot, 'packed-consumer');
const npmCache = join(temporaryRoot, 'npm-cache');
let server: Deno.ChildProcess | undefined;
let devServer: Deno.ChildProcess | undefined;

async function npm(args: string[], cwd: string) {
  const executable = Deno.build.os === 'windows' ? 'npm.cmd' : 'npm';
  const output = await new Deno.Command(executable, {
    args,
    cwd,
    env: { npm_config_cache: npmCache },
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  if (!output.success) {
    throw new Error(
      `${executable} ${args.join(' ')} failed:\n${
        new TextDecoder().decode(output.stderr)
      }`,
    );
  }
  return new TextDecoder().decode(output.stdout).trim();
}

try {
  const initializer = new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      '-A',
      join(repositoryRoot, 'init/src/mod.ts'),
      projectName,
    ],
    cwd: temporaryRoot,
    env: { LIMETTE_INIT_SKIP_INSTALL: '1' },
    stdout: 'piped',
    stderr: 'piped',
  }).spawn();
  const initializerOutput = await initializer.output();
  assert(
    initializerOutput.success,
    `Initializer failed:\n${
      new TextDecoder().decode(initializerOutput.stderr)
    }`,
  );

  const generatedApp = await Deno.readTextFile(join(projectRoot, 'app.ts'));
  const generatedMain = await Deno.readTextFile(join(projectRoot, 'main.ts'));
  const generatedViteConfig = await Deno.readTextFile(
    join(projectRoot, 'vite.config.ts'),
  );
  const generatedGitignore = await Deno.readTextFile(
    join(projectRoot, '.gitignore'),
  );
  assert(
    generatedApp.includes('new App()') &&
      generatedApp.includes('.fsRoutes()'),
    'Initializer did not generate the filesystem-routing marker.',
  );
  assert(
    generatedViteConfig.includes('limette({') &&
      generatedViteConfig.includes('app: "./app.ts"'),
    'Initializer did not generate the current Limette Vite configuration.',
  );
  assert(
    generatedMain.includes('@limette/core/deno') &&
      generatedMain.includes('./dist/server/entry.js'),
    'Initializer did not generate the explicit Deno runtime launcher.',
  );
  assert(
    generatedGitignore.includes('dist/') &&
      !generatedGitignore.includes('_limette'),
    'Initializer retained the obsolete build output directory.',
  );
  for (const obsolete of ['clientEntryInputs', 'App.listen', 'tailwindcss']) {
    assert(
      !`${generatedApp}\n${generatedMain}\n${generatedViteConfig}`.includes(
        obsolete,
      ),
      `Initializer retained obsolete generated content: ${obsolete}.`,
    );
  }

  await Deno.mkdir(packageDirectory, { recursive: true });
  const packOutput = await npm([
    'pack',
    '--pack-destination',
    packageDirectory,
  ], repositoryRoot);
  const archive = join(
    packageDirectory,
    basename(packOutput.split('\n').at(-1)!),
  );
  await Deno.mkdir(packedConsumer, { recursive: true });
  await Deno.writeTextFile(
    join(packedConsumer, 'package.json'),
    JSON.stringify({ private: true }),
  );
  await npm([
    'install',
    '--ignore-scripts',
    '--no-package-lock',
    '--no-audit',
    '--no-fund',
    '--no-save',
    archive,
  ], packedConsumer);

  const denoConfigPath = join(projectRoot, 'deno.json');
  const denoConfig = JSON.parse(await Deno.readTextFile(denoConfigPath));
  denoConfig.links = ['../packed-consumer/node_modules/@limette/core'];
  await Deno.writeTextFile(
    denoConfigPath,
    `${JSON.stringify(denoConfig, null, 2)}\n`,
  );

  await run(['install', '--allow-scripts'], projectRoot);
  await run(['task', 'build'], projectRoot);
  await run([
    'check',
    'app.ts',
    'main.ts',
    'vite.config.ts',
    'routes/_app.ts',
    'routes/index.ts',
    'routes/foo.ts',
    'islands/counter.ts',
  ], projectRoot);

  assert(
    await exists(join(projectRoot, 'dist/client')),
    'Generated application did not produce dist/client.',
  );
  assert(
    await exists(join(projectRoot, 'dist/server/entry.js')),
    'Generated application did not produce dist/server/entry.js.',
  );

  const generatedRoutePath = join(projectRoot, 'routes/index.ts');
  const originalGeneratedRoute = await Deno.readTextFile(generatedRoutePath);
  const updatedGeneratedRoute = originalGeneratedRoute.replace(
    'This is SSR content.',
    'This is updated SSR content.',
  );
  assert(
    updatedGeneratedRoute !== originalGeneratedRoute,
    'Generated route fixture did not contain the expected SSR content.',
  );
  const devListener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
  const devPort = (devListener.addr as Deno.NetAddr).port;
  devListener.close();
  devServer = new Deno.Command(Deno.execPath(), {
    args: [
      'task',
      'dev',
      '--port',
      String(devPort),
      '--strictPort',
      '--logLevel',
      'error',
    ],
    cwd: projectRoot,
    stdout: 'piped',
    stderr: 'piped',
  }).spawn();
  const devStdout = new Response(devServer.stdout).text();
  const devStderr = new Response(devServer.stderr).text();

  async function waitForDevContent(expected: string) {
    let lastError: unknown;
    let lastHtml = '';
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${devPort}/`);
        lastHtml = await response.text();
        if (response.ok && lastHtml.includes(expected)) return lastHtml;
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(
      `Generated Vite dev server did not render ${JSON.stringify(expected)}: ` +
        `${String(lastError)}\n${lastHtml.slice(0, 300)}`,
    );
  }

  await waitForDevContent('This is SSR content.');
  await Deno.writeTextFile(generatedRoutePath, updatedGeneratedRoute);
  const updatedDevHtml = await waitForDevContent(
    'This is updated SSR content.',
  );
  assert(
    updatedDevHtml.includes('island-counter'),
    'Generated Vite dev server lost the island after a route reload.',
  );
  await Deno.writeTextFile(generatedRoutePath, originalGeneratedRoute);
  devServer.kill('SIGTERM');
  await devServer.status;
  devServer = undefined;
  const devDiagnostics = `${await devStdout}\n${await devStderr}`;
  for (
    const forbidden of [
      'emitFile() is not supported in serve mode',
      'Unable to statically analyze "static islands"',
      'node_modules/.vite/deps/@limette_core.js',
      'already has "island-counter" defined',
    ]
  ) {
    assert(
      !devDiagnostics.includes(forbidden),
      `Generated Vite dev server logged an obsolete reload failure: ${forbidden}.\n${devDiagnostics}`,
    );
  }

  const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();
  server = new Deno.Command(Deno.execPath(), {
    args: ['task', 'start'],
    cwd: projectRoot,
    env: { PORT: String(port) },
    stdout: 'piped',
    stderr: 'piped',
  }).spawn();
  const serverStdout = new Response(server.stdout).text();
  const serverStderr = new Response(server.stderr).text();

  let response: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) break;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!response?.ok) {
    server.kill('SIGTERM');
    await server.status;
    throw new Error(
      `Generated application did not start: ${
        String(lastError)
      }\n${await serverStdout}\n${await serverStderr}`,
    );
  }
  const html = await response.text();
  assert(
    html.includes('This is SSR content.') && html.includes('island-counter'),
    'Generated application returned an unexpected SSR response.',
  );
} finally {
  if (devServer) {
    try {
      devServer.kill('SIGTERM');
    } catch {
      // The process may already have exited after a startup failure.
    }
    await devServer.status;
  }
  if (server) {
    try {
      server.kill('SIGTERM');
    } catch {
      // The process may already have exited after a startup failure.
    }
    await server.status;
  }
  await Deno.remove(temporaryRoot, { recursive: true });
}
