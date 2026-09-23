import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRoot } from './_paths.ts';
import { viteCommand } from './_vite-command.ts';

const fixtureRoot = fileURLToPath(new URL('../fixtures/server-build/', import.meta.url));
const buildDir = join(fixtureRoot, 'dist');
const deploymentDir = join(repositoryRoot, '.vite-limette-production');
const hiddenSources: Array<{ source: string; hidden: string }> = [];

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

async function remove(path: string) {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

async function copyDirectory(
  source: string,
  destination: string,
  exclude: ReadonlySet<string> = new Set()
) {
  await Deno.mkdir(destination, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    if (exclude.has(entry.name)) continue;
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory) {
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile) {
      await Deno.mkdir(dirname(destinationPath), { recursive: true });
      await Deno.copyFile(sourcePath, destinationPath);
    }
  }
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(current)) {
    const path = join(current, entry.name);
    if (entry.isDirectory) {
      files.push(...(await listFiles(root, path)));
    } else if (entry.isFile) {
      files.push(relative(root, path));
    }
  }
  return files.sort();
}

async function waitForServer(origin: string, child: Deno.ChildProcess) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${origin}/about`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // The runtime may already have exited with a startup error.
  }
  throw new Error(
    `Production server did not start: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function verifyRuntime(runtime: 'Deno' | 'Node', command: Deno.Command, port: number) {
  const child = command.spawn();
  const stderr = new Response(child.stderr).text();
  const origin = `http://127.0.0.1:${port}`;

  try {
    await waitForServer(origin, child);

    const homeResponse = await fetch(`${origin}/`);
    const homeHtml = await homeResponse.text();
    assert(homeResponse.status === 200, `${runtime} home returned ${homeResponse.status}.`);
    assert(
      homeResponse.headers.get('x-server-middleware') === 'applied',
      `${runtime} home did not execute middleware.`
    );
    assert(
      homeResponse.headers.get('x-runtime-info') === (runtime === 'Deno' ? 'deno' : 'generic'),
      `${runtime} did not preserve its handler metadata semantics.`
    );
    assert(
      homeHtml.includes('Generated home') && homeHtml.includes('data-server-layout'),
      `${runtime} home lost page or layout rendering.`
    );

    const scriptPath = homeHtml.match(/<script type="module" src="([^"]+)"/)?.[1];
    assert(
      scriptPath?.startsWith('/my-app/assets/limette-route-'),
      `${runtime} home did not emit the generated island script URL.`
    );
    const assetResponse = await fetch(`${origin}${scriptPath}`);
    const assetBody = await assetResponse.text();
    assert(
      assetResponse.status === 200 &&
        assetBody.length > 0 &&
        (assetResponse.headers.get('content-type') ?? '').includes('application/javascript'),
      `${runtime} adapter did not serve the generated client asset.`
    );

    const stylePath = homeHtml.match(/<link rel="stylesheet" href="([^"]+\.css)"/)?.[1];
    assert(
      stylePath?.startsWith('/my-app/assets/'),
      `${runtime} home did not emit the generated stylesheet URL.`
    );
    const styleResponse = await fetch(`${origin}${stylePath}`);
    assert(
      styleResponse.status === 200 &&
        (styleResponse.headers.get('content-type') ?? '').includes('text/css'),
      `${runtime} adapter did not serve the generated stylesheet.`
    );

    const headResponse = await fetch(`${origin}${scriptPath}`, {
      method: 'HEAD',
    });
    assert(
      headResponse.status === 200 && (await headResponse.text()) === '',
      `${runtime} adapter did not preserve static HEAD behavior.`
    );

    const missingAsset = await fetch(`${origin}/my-app/assets/missing-client-file.js`);
    assert(
      missingAsset.status === 404,
      `${runtime} missing static asset did not fall through to the handler.`
    );

    const traversalResponse = await fetch(`${origin}/my-app/..%2fsecret.txt`);
    assert(
      (await traversalResponse.text()) !== 'secret',
      `${runtime} static adapter allowed a root escape.`
    );

    const aboutResponse = await fetch(`${origin}/about`);
    const aboutHtml = await aboutResponse.text();
    assert(
      aboutResponse.status === 200 && aboutHtml.includes('Generated about'),
      `${runtime} about route did not render.`
    );
    assert(
      !aboutHtml.includes('<script type="module"'),
      `${runtime} no-island route received a client script.`
    );

    const userResponse = await fetch(`${origin}/users/alice`);
    const userHtml = await userResponse.text();
    assert(
      userResponse.status === 200 && userHtml.includes('alice'),
      `${runtime} dynamic route did not receive route params.`
    );
    assert(
      userResponse.headers.get('x-server-middleware') === 'applied' &&
        userHtml.includes('data-server-layout'),
      `${runtime} dynamic route lost middleware or layout behavior.`
    );
  } catch (error) {
    try {
      child.kill('SIGTERM');
    } catch {
      // The runtime may already have exited with a startup error.
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n` +
        `${runtime} stderr:\n${await stderr}`
    );
  } finally {
    try {
      child.kill('SIGTERM');
    } catch {
      // The runtime may already have exited.
    }
    await child.status;
    await stderr;
  }
}

try {
  await remove(buildDir);
  await remove(deploymentDir);

  const build = viteCommand(['--config', join(fixtureRoot, 'vite.config.ts'), 'build'], {
    cwd: fixtureRoot,
  });
  const buildOutput = await build.output();
  if (!buildOutput.success) {
    throw new Error(new TextDecoder().decode(buildOutput.stderr));
  }

  await copyDirectory(join(buildDir, 'server'), join(deploymentDir, 'server'));
  await copyDirectory(join(buildDir, 'client'), join(deploymentDir, 'client'), new Set(['.vite']));
  await Deno.copyFile(join(fixtureRoot, 'deno-runner.ts'), join(deploymentDir, 'deno-runner.ts'));
  await Deno.copyFile(join(fixtureRoot, 'node-runner.mjs'), join(deploymentDir, 'node-runner.mjs'));
  await remove(buildDir);

  assert(
    !(await exists(join(deploymentDir, 'client/.vite/manifest.json'))),
    'Production deployment unexpectedly contains the client manifest.'
  );
  const deploymentFiles = await listFiles(deploymentDir);
  assert(
    deploymentFiles.every(
      (path) =>
        path === 'server/entry.js' ||
        path === 'deno-runner.ts' ||
        path === 'node-runner.mjs' ||
        path.startsWith('client/assets/')
    ),
    `Production deployment contains unexpected files: ${deploymentFiles.join(', ')}`
  );
  const runtimeSource =
    (await Deno.readTextFile(join(deploymentDir, 'server/entry.js'))) +
    (await Deno.readTextFile(join(deploymentDir, 'deno-runner.ts'))) +
    (await Deno.readTextFile(join(deploymentDir, 'node-runner.mjs')));
  assert(
    !runtimeSource.includes('limette/vite') &&
      !/from\s*["']vite["']|import\s*\(\s*["']vite["']\s*\)/.test(runtimeSource),
    'Production deployment unexpectedly imports Vite tooling.'
  );
  for (const forbidden of [
    'prepareApp',
    'setFsRoutes',
    'discoverRoutes',
    'runtime-serve',
    'serveHandler',
  ]) {
    assert(
      !runtimeSource.includes(forbidden),
      `Production deployment unexpectedly contains runtime preparation code: ${forbidden}`
    );
  }

  const coreEntrySource = await Deno.readTextFile(
    join(repositoryRoot, 'packages/limette/dist/index.mjs')
  );
  assert(
    !coreEntrySource.includes('runtime-serve') &&
      !/from\s*["'][^"']*(?:node|deno)\.mjs["']/.test(coreEntrySource),
    'The core App entry still reaches a host adapter or runtime auto-detection.'
  );

  await Deno.writeTextFile(join(deploymentDir, 'secret.txt'), 'secret');

  for (const name of ['app.ts', 'routes', 'islands']) {
    const source = join(fixtureRoot, name);
    const hidden = join(fixtureRoot, `.${name}.unavailable`);
    await Deno.rename(source, hidden);
    hiddenSources.push({ source, hidden });
  }

  await verifyRuntime(
    'Deno',
    new Deno.Command(Deno.execPath(), {
      args: [
        'run',
        '-A',
        '--config',
        join(repositoryRoot, 'examples/deno.json'),
        join(deploymentDir, 'deno-runner.ts'),
        '5181',
      ],
      cwd: deploymentDir,
      stdout: 'null',
      stderr: 'piped',
    }),
    5181
  );

  await verifyRuntime(
    'Node',
    new Deno.Command('node', {
      args: [join(deploymentDir, 'node-runner.mjs'), '5182'],
      cwd: deploymentDir,
      stdout: 'null',
      stderr: 'piped',
    }),
    5182
  );
} finally {
  for (const { source, hidden } of hiddenSources.reverse()) {
    await Deno.rename(hidden, source);
  }
  await remove(buildDir);
  await remove(deploymentDir);
}
