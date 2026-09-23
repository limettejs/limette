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
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

function outputText(output: Deno.CommandOutput) {
  return {
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
}

async function command(
  executable: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
) {
  const output = await new Deno.Command(executable, {
    args,
    cwd,
    env,
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  const text = outputText(output);
  if (!output.success) {
    throw new Error(
      `${executable} ${
        args.join(' ')
      } failed in ${cwd}:\n${text.stderr}\n${text.stdout}`,
    );
  }
  return text.stdout.trim();
}

async function availablePort() {
  const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();
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

const npmExecutable = Deno.build.os === 'windows' ? 'npm.cmd' : 'npm';
const temporaryRoot = await Deno.makeTempDir({ prefix: 'limette-init-' });
const packageDirectory = join(temporaryRoot, 'package');
const packedConsumer = join(temporaryRoot, 'packed-consumer');
const npmCache = join(temporaryRoot, 'npm-cache');
const denoCache = join(temporaryRoot, 'deno-cache');
const combinations: Combination[] = [
  { runtime: 'deno', tailwind: true },
  { runtime: 'deno', tailwind: false },
  { runtime: 'node', tailwind: true },
  { runtime: 'node', tailwind: false },
];
const children = new Set<Deno.ChildProcess>();

async function stop(child: Deno.ChildProcess) {
  children.delete(child);
  try {
    child.kill('SIGTERM');
  } catch {
    // The process may already have exited after a startup failure.
  }
  await child.status;
}

async function runCombination(
  combination: Combination,
  archive: string,
  localCore: string,
) {
  const { runtime, tailwind } = combination;
  const suffix = tailwind ? 'tailwind' : 'plain';
  const projectName = `${runtime}-${suffix}`;
  const projectRoot = join(temporaryRoot, projectName);
  const initializer = await new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      '-A',
      join(repositoryRoot, 'init/src/mod.ts'),
      projectName,
      `--runtime=${runtime}`,
      `--tailwind=${tailwind ? 'yes' : 'no'}`,
    ],
    cwd: temporaryRoot,
    env: { LIMETTE_INIT_SKIP_INSTALL: '1' },
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  const initializerText = outputText(initializer);
  assert(
    initializer.success,
    `Initializer failed for ${projectName}:\n${initializerText.stderr}`,
  );
  assert(
    initializerText.stdout.includes(
      runtime === 'deno' ? 'deno task dev' : 'npm run dev',
    ),
    `Initializer printed the wrong instructions for ${projectName}.`,
  );

  const packagePath = join(projectRoot, 'package.json');
  const manifest = JSON.parse(await Deno.readTextFile(packagePath));
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
    manifest.dependencies.limette && manifest.dependencies.lit &&
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

  const viteConfig = await Deno.readTextFile(
    join(projectRoot, 'vite.config.ts'),
  );
  const island = await Deno.readTextFile(
    join(projectRoot, 'islands/counter.ts'),
  );
  const route = await Deno.readTextFile(join(projectRoot, 'routes/index.ts'));
  const appWrapper = await Deno.readTextFile(
    join(projectRoot, 'routes/_app.ts'),
  );
  const fooRoute = await Deno.readTextFile(join(projectRoot, 'routes/foo.ts'));
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
    await Deno.writeTextFile(
      join(projectRoot, 'deno.json'),
      `${JSON.stringify({ links: [localCore] }, null, 2)}\n`,
    );
    await command(Deno.execPath(), ['install'], projectRoot, {
      DENO_DIR: denoCache,
    });
  } else {
    manifest.dependencies.limette = `file:${archive}`;
    await Deno.writeTextFile(
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
  await command(Deno.execPath(), ['check', ...checkFiles], projectRoot, {
    DENO_DIR: denoCache,
  });

  const devPort = await availablePort();
  const vitePath = join(projectRoot, 'node_modules/vite/bin/vite.js');
  const devServer = new Deno.Command('node', {
    args: [
      vitePath,
      '--host',
      '127.0.0.1',
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
  children.add(devServer);
  const devStdout = new Response(devServer.stdout).text();
  const devStderr = new Response(devServer.stderr).text();
  const routePath = join(projectRoot, 'routes/index.ts');
  const originalRoute = await Deno.readTextFile(routePath);
  const updatedRoute = originalRoute.replace(
    'This is SSR content.',
    'This is updated SSR content.',
  );
  await waitForResponse(
    `http://127.0.0.1:${devPort}/`,
    (response, body) => response.ok && body.includes('This is SSR content.'),
  );
  await Deno.writeTextFile(routePath, updatedRoute);
  const updatedDev = await waitForResponse(
    `http://127.0.0.1:${devPort}/`,
    (response, body) =>
      response.ok && body.includes('This is updated SSR content.'),
  );
  assert(
    updatedDev.body.includes('island-counter'),
    `${projectName} lost its island after a dev route reload.`,
  );
  await Deno.writeTextFile(routePath, originalRoute);
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
    await command(Deno.execPath(), ['task', 'build'], projectRoot, {
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
  const launcher = runtime === 'deno'
    ? new Deno.Command(Deno.execPath(), {
      args: ['run', '-A', 'main.ts'],
      cwd: projectRoot,
      env: { PORT: String(port), DENO_DIR: denoCache },
      stdout: 'piped',
      stderr: 'piped',
    })
    : new Deno.Command('node', {
      args: ['main.js'],
      cwd: projectRoot,
      env: { PORT: String(port) },
      stdout: 'piped',
      stderr: 'piped',
    });
  const server = launcher.spawn();
  children.add(server);
  const serverStdout = new Response(server.stdout).text();
  const serverStderr = new Response(server.stderr).text();
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
  await Deno.mkdir(packageDirectory, { recursive: true });
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
  await Deno.mkdir(packedConsumer, { recursive: true });
  await Deno.writeTextFile(
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

  for (const combination of combinations) {
    await runCombination(combination, archive, localCore);
  }
} finally {
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      // The process may already have exited.
    }
    await child.status;
  }
  await Deno.remove(temporaryRoot, { recursive: true });
}
