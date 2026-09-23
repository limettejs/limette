import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { repositoryRoot } from './_paths.ts';

type Runtime = 'deno' | 'node';
type Combination = {
  runtime: Runtime;
  tailwind: boolean;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function streamText(stream: NodeJS.ReadableStream | null) {
  if (!stream) return Promise.resolve('');
  return new Promise<string>((resolve, reject) => {
    let output = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => output += chunk);
    stream.on('end', () => resolve(output));
    stream.on('error', reject);
  });
}

async function command(
  executable: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
) {
  const child = spawn(executable, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = streamText(child.stdout);
  const stderr = streamText(child.stderr);
  const [status, output, errors] = await Promise.all([
    new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    }),
    stdout,
    stderr,
  ]);
  if (status !== 0) {
    throw new Error(
      `${executable} ${
        args.join(' ')
      } failed in ${cwd}:\n${errors}\n${output}`,
    );
  }
  return output.trim();
}

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'Failed to allocate a port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  );
  return port;
}

async function waitForResponse(
  url: string,
  predicate: (response: Response, body: string) => boolean,
) {
  let lastBody = '';
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url);
      lastBody = await response.text();
      if (predicate(response, lastBody)) return { response, body: lastBody };
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Timed out waiting for ${url}: ${String(lastError)}\n${
      lastBody.slice(0, 500)
    }`,
  );
}

function hasDeclaration(css: string, property: string, value: string) {
  return new RegExp(`${property}:\\s*${value}`).test(css);
}

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const denoExecutable = process.platform === 'win32' ? 'deno.exe' : 'deno';
const temporaryRoot = await mkdtemp(join(tmpdir(), 'limette-init-'));
const packageDirectory = join(temporaryRoot, 'package');
const initializerPackageDirectory = join(temporaryRoot, 'initializer-package');
const packedConsumer = join(temporaryRoot, 'packed-consumer');
const initializerConsumer = join(temporaryRoot, 'initializer-consumer');
const npmCache = join(temporaryRoot, 'npm-cache');
const denoCache = join(temporaryRoot, 'deno-cache');
const combinations: Combination[] = [
  { runtime: 'deno', tailwind: true },
  { runtime: 'deno', tailwind: false },
  { runtime: 'node', tailwind: true },
  { runtime: 'node', tailwind: false },
];
const children = new Set<ChildProcess>();

async function stop(child: ChildProcess) {
  children.delete(child);
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  child.kill('SIGTERM');
  await closed;
}

async function runCombination(
  combination: Combination,
  archive: string,
  localCore: string,
  initializerExecutable: string,
) {
  const { runtime, tailwind } = combination;
  const suffix = tailwind ? 'tailwind' : 'plain';
  const projectName = `${runtime}-${suffix}`;
  const projectRoot = join(temporaryRoot, projectName);
  const initializerOutput = await command(
    initializerExecutable,
    [
      projectName,
      `--runtime=${runtime}`,
      `--tailwind=${tailwind ? 'yes' : 'no'}`,
    ],
    temporaryRoot,
    { LIMETTE_INIT_SKIP_INSTALL: '1' },
  );
  assert(
    initializerOutput.includes(
      runtime === 'deno' ? 'deno task dev' : 'npm run dev',
    ),
    `Initializer printed the wrong instructions for ${projectName}.`,
  );

  const packagePath = join(projectRoot, 'package.json');
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'));
  assert(
    manifest.name === projectName && manifest.private === true &&
      manifest.type === 'module',
    `${projectName} has invalid package metadata.`,
  );
  assert(
    manifest.scripts.dev === 'vite' &&
      manifest.scripts.build === 'vite build' &&
      manifest.scripts.start ===
        (runtime === 'deno' ? 'deno run -A main.ts' : 'node main.js'),
    `${projectName} has invalid scripts.`,
  );
  assert(
    manifest.dependencies.limette === '^0.3.0' &&
      manifest.dependencies.lit &&
      manifest.devDependencies.vite,
    `${projectName} is missing core application dependencies.`,
  );
  assert(
    Boolean(manifest.devDependencies.tailwindcss) === tailwind &&
      Boolean(manifest.devDependencies['@tailwindcss/vite']) === tailwind,
    `${projectName} has incorrect optional Tailwind dependencies.`,
  );
  assert(
    !await exists(join(projectRoot, 'deno.json')),
    `${projectName} duplicated package metadata in deno.json.`,
  );
  assert(
    await exists(
      join(projectRoot, runtime === 'deno' ? 'main.ts' : 'main.js'),
    ),
    `${projectName} is missing its runtime launcher.`,
  );
  assert(
    !await exists(
      join(projectRoot, runtime === 'deno' ? 'main.js' : 'main.ts'),
    ),
    `${projectName} generated both runtime launchers.`,
  );
  assert(
    await exists(join(projectRoot, 'public')),
    `${projectName} is missing its public directory.`,
  );

  const viteConfig = await readFile(
    join(projectRoot, 'vite.config.ts'),
    'utf8',
  );
  const island = await readFile(
    join(projectRoot, 'islands/counter.ts'),
    'utf8',
  );
  const route = await readFile(join(projectRoot, 'routes/index.ts'), 'utf8');
  const appWrapper = await readFile(
    join(projectRoot, 'routes/_app.ts'),
    'utf8',
  );
  const fooRoute = await readFile(
    join(projectRoot, 'routes/foo.ts'),
    'utf8',
  );
  assert(
    viteConfig.includes('limette({') &&
      viteConfig.includes('app: "./app.ts"'),
    `${projectName} is missing the Limette Vite configuration.`,
  );
  assert(
    !island.includes('customElements.define'),
    `${projectName} still manually registers its island.`,
  );
  assert(
    route.includes('component: Counter') && route.includes('ssr: true') &&
      !route.includes('<island-counter ssr'),
    `${projectName} does not use the explicit static-islands SSR policy.`,
  );
  assert(
    island.includes('@click=${() => this.count--}') &&
      island.includes('@click=${() => this.count++}'),
    `${projectName} lost its counter interactions.`,
  );
  assert(
    appWrapper.includes('override head()') &&
      appWrapper.includes('<title>Limette</title>') &&
      appWrapper.includes('${this.outlet}') &&
      fooRoute.includes('override head()') &&
      fooRoute.includes('<title>Foo</title>') &&
      fooRoute.includes('type RouteHandlers') &&
      fooRoute.includes('handler: RouteHandlers'),
    `${projectName} does not use the structural head() API.`,
  );
  assert(
    await exists(join(projectRoot, 'tailwind.css')) === tailwind &&
      viteConfig.includes('@tailwindcss/vite') === tailwind &&
      viteConfig.includes('tailwind: "./tailwind.css"') === tailwind &&
      island.includes('leading-[1.4]') === tailwind,
    `${projectName} generated an inconsistent Tailwind variant.`,
  );

  if (runtime === 'deno') {
    await writeFile(
      join(projectRoot, 'deno.json'),
      `${JSON.stringify({ links: [localCore] }, null, 2)}\n`,
    );
    await command(denoExecutable, ['install'], projectRoot, {
      DENO_DIR: denoCache,
    });
  } else {
    manifest.dependencies.limette = `file:${archive}`;
    await writeFile(
      packagePath,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await command(
      npmExecutable,
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
      ],
      projectRoot,
      { npm_config_cache: npmCache },
    );
  }

  const checkFiles = [
    'app.ts',
    'vite.config.ts',
    'routes/_app.ts',
    'routes/index.ts',
    'routes/foo.ts',
    'islands/counter.ts',
  ];
  if (runtime === 'deno') checkFiles.push('main.ts');
  await command(denoExecutable, ['check', ...checkFiles], projectRoot, {
    DENO_DIR: denoCache,
  });

  const devPort = await availablePort();
  const vitePath = join(projectRoot, 'node_modules/vite/bin/vite.js');
  const devServer = spawn(
    process.execPath,
    [
      vitePath,
      '--host',
      '127.0.0.1',
      '--port',
      String(devPort),
      '--strictPort',
      '--logLevel',
      'error',
    ],
    {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  children.add(devServer);
  const devStdout = streamText(devServer.stdout);
  const devStderr = streamText(devServer.stderr);
  const routePath = join(projectRoot, 'routes/index.ts');
  const originalRoute = await readFile(routePath, 'utf8');
  const updatedRoute = originalRoute.replace(
    'This is SSR content.',
    'This is updated SSR content.',
  );
  await waitForResponse(
    `http://127.0.0.1:${devPort}/`,
    (response, body) => response.ok && body.includes('This is SSR content.'),
  );
  await writeFile(routePath, updatedRoute);
  const updatedDev = await waitForResponse(
    `http://127.0.0.1:${devPort}/`,
    (response, body) =>
      response.ok && body.includes('This is updated SSR content.'),
  );
  assert(
    updatedDev.body.includes('island-counter'),
    `${projectName} lost its island after a dev route reload.`,
  );
  await writeFile(routePath, originalRoute);
  await stop(devServer);
  const devDiagnostics = `${await devStdout}\n${await devStderr}`;
  for (
    const forbidden of [
      'emitFile() is not supported in serve mode',
      'Unable to statically analyze "static islands"',
      'already has "island-counter" defined',
    ]
  ) {
    assert(
      !devDiagnostics.includes(forbidden),
      `${projectName} logged a dev reload failure: ${forbidden}.\n${devDiagnostics}`,
    );
  }

  if (runtime === 'deno') {
    await command(denoExecutable, ['task', 'build'], projectRoot, {
      DENO_DIR: denoCache,
    });
  } else {
    await command(npmExecutable, ['run', 'build'], projectRoot, {
      npm_config_cache: npmCache,
    });
  }
  assert(
    await exists(join(projectRoot, 'dist/client')) &&
      await exists(join(projectRoot, 'dist/server/entry.js')),
    `${projectName} did not produce the shared Vite build.`,
  );

  const port = await availablePort();
  const server = spawn(
    runtime === 'deno' ? denoExecutable : process.execPath,
    runtime === 'deno' ? ['run', '-A', 'main.ts'] : ['main.js'],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT: String(port),
        ...(runtime === 'deno' ? { DENO_DIR: denoCache } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  children.add(server);
  const serverStdout = streamText(server.stdout);
  const serverStderr = streamText(server.stderr);
  const production = await waitForResponse(
    `http://127.0.0.1:${port}/`,
    (response, body) => response.ok && body.includes('This is SSR content.'),
  );
  assert(
    production.body.includes('island-counter') &&
      production.body.includes('Hello,') &&
      production.body.includes('Count:') &&
      production.body.includes('<title>Limette</title>') &&
      production.body.includes(
        '<meta name="description" content="A Limette application">',
      ) &&
      !production.body.includes(' key='),
    `${projectName} returned an unexpected production SSR response.`,
  );
  const scriptUrl = production.body.match(
    /<script type="module" src="([^"]+\.js)"><\/script>/,
  )?.[1];
  assert(scriptUrl, `${projectName} did not emit an island client asset.`);
  const scriptResponse = await fetch(`http://127.0.0.1:${port}${scriptUrl}`);
  assert(
    scriptResponse.ok &&
      scriptResponse.headers.get('content-type')?.includes('javascript'),
    `${projectName} did not serve its generated client asset.`,
  );
  const missing = await fetch(`http://127.0.0.1:${port}/missing-route`);
  assert(
    missing.status === 404,
    `${projectName} did not preserve Limette's missing-route response.`,
  );

  if (tailwind) {
    const tailwindUrl = production.body.match(
      /href="(\/assets\/limette-tailwind-[^"]+\.css)"/,
    )?.[1];
    assert(
      tailwindUrl &&
          production.body.includes(`@import url(&quot;${tailwindUrl}&quot;)`) ||
        tailwindUrl &&
          production.body.includes(`@import url("${tailwindUrl}")`),
      `${projectName} did not share its Tailwind URL with a shadow root.`,
    );
    const tailwindResponse = await fetch(
      `http://127.0.0.1:${port}${tailwindUrl}`,
    );
    const tailwindOutput = await tailwindResponse.text();
    assert(
      tailwindResponse.ok &&
        hasDeclaration(tailwindOutput, 'font-size', '37px') &&
        hasDeclaration(tailwindOutput, 'line-height', '1.4'),
      `${projectName} lost route or island-only Tailwind utilities.`,
    );
  } else {
    assert(
      !production.body.includes('limette-tailwind-'),
      `${projectName} unexpectedly emitted Tailwind assets.`,
    );
  }

  await stop(server);
  const serverDiagnostics = `${await serverStdout}\n${await serverStderr}`;
  assert(
    !serverDiagnostics.includes('Error:'),
    `${projectName} logged a production error:\n${serverDiagnostics}`,
  );
}

try {
  await mkdir(packageDirectory, { recursive: true });
  await mkdir(initializerPackageDirectory, { recursive: true });
  const packOutput = await command(
    npmExecutable,
    [
      'pack',
      '--workspace=limette',
      '--ignore-scripts',
      '--pack-destination',
      packageDirectory,
    ],
    repositoryRoot,
    { npm_config_cache: npmCache },
  );
  const archive = join(
    packageDirectory,
    basename(packOutput.split('\n').at(-1)!),
  );
  const initializerPackOutput = await command(
    npmExecutable,
    [
      'pack',
      '--workspace=create-limette',
      '--ignore-scripts',
      '--pack-destination',
      initializerPackageDirectory,
    ],
    repositoryRoot,
    { npm_config_cache: npmCache },
  );
  const initializerArchive = join(
    initializerPackageDirectory,
    basename(initializerPackOutput.split('\n').at(-1)!),
  );
  await mkdir(packedConsumer, { recursive: true });
  await writeFile(
    join(packedConsumer, 'package.json'),
    `${JSON.stringify({ private: true }, null, 2)}\n`,
  );
  await command(
    npmExecutable,
    [
      'install',
      '--ignore-scripts',
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
      '--no-save',
      archive,
    ],
    packedConsumer,
    { npm_config_cache: npmCache },
  );
  const localCore = join(
    packedConsumer,
    'node_modules/limette',
  );

  await mkdir(initializerConsumer, { recursive: true });
  await writeFile(
    join(initializerConsumer, 'package.json'),
    `${JSON.stringify({ private: true }, null, 2)}\n`,
  );
  await command(
    npmExecutable,
    [
      'install',
      '--ignore-scripts',
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
      '--no-save',
      initializerArchive,
    ],
    initializerConsumer,
    { npm_config_cache: npmCache },
  );
  const initializerExecutable = process.platform === 'win32'
    ? join(initializerConsumer, 'node_modules/.bin/create-limette.cmd')
    : join(initializerConsumer, 'node_modules/.bin/create-limette');
  assert(
    await exists(initializerExecutable),
    'The packed initializer did not install its create-limette binary.',
  );
  const installedInitializerRoot = join(
    initializerConsumer,
    'node_modules/create-limette',
  );
  const installedInitializerManifest = JSON.parse(
    await readFile(join(installedInitializerRoot, 'package.json'), 'utf8'),
  );
  const installedInitializerEntry = await readFile(
    join(installedInitializerRoot, 'dist/index.mjs'),
    'utf8',
  );
  assert(
    installedInitializerManifest.bin?.['create-limette'] ===
        './dist/index.mjs' &&
      installedInitializerEntry.startsWith('#!/usr/bin/env node'),
    'The packed initializer has an invalid executable contract.',
  );

  for (const combination of combinations) {
    await runCombination(
      combination,
      archive,
      localCore,
      initializerExecutable,
    );
  }

  const occupiedProject = join(temporaryRoot, 'occupied-project');
  await mkdir(occupiedProject);
  await writeFile(join(occupiedProject, 'keep.txt'), 'keep\n');
  let rejectedOccupiedDirectory = false;
  try {
    await command(
      initializerExecutable,
      ['occupied-project', '--runtime=node', '--tailwind=no'],
      temporaryRoot,
      { LIMETTE_INIT_SKIP_INSTALL: '1' },
    );
  } catch (error) {
    rejectedOccupiedDirectory = String(error).includes(
      'already exists and is not empty',
    );
  }
  assert(
    rejectedOccupiedDirectory &&
      await readFile(join(occupiedProject, 'keep.txt'), 'utf8') === 'keep\n',
    'The initializer did not protect a non-empty target directory.',
  );
} finally {
  for (const child of children) {
    await stop(child);
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
