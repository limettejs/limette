import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryRoot } from './_paths.ts';
import { viteCommand } from './_vite-command.ts';

const fixtureRoot = fileURLToPath(new URL('../fixtures/server-build/', import.meta.url));
const buildDir = join(fixtureRoot, 'dist');
const clientDir = join(buildDir, 'client');
const wranglerDir = join(fixtureRoot, '.wrangler');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function remove(path: string) {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

async function emittedAsset(path = clientDir): Promise<string | undefined> {
  for await (const entry of Deno.readDir(path)) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory) {
      const nested = await emittedAsset(entryPath);
      if (nested) return nested;
    } else if (entry.isFile && (extname(entry.name) === '.js' || extname(entry.name) === '.css')) {
      return entryPath;
    }
  }
}

function availablePort() {
  const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return port;
}

async function waitForWrangler(
  origin: string,
  child: Deno.ChildProcess,
  status: Promise<Deno.CommandStatus>
) {
  let exited: Deno.CommandStatus | undefined;
  status.then((result) => (exited = result));
  let lastError: unknown;

  for (let attempt = 0; attempt < 150; attempt++) {
    if (exited) {
      throw new Error(`Wrangler exited during startup with code ${exited.code}.`);
    }

    try {
      const response = await fetch(`${origin}/about`);
      if (response.status === 200 && response.headers.get('x-limette-worker') === '1') {
        await response.body?.cancel();
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // Wrangler may already have exited with a startup error.
  }
  throw new Error(
    `Wrangler did not become ready: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

function equalBytes(actual: Uint8Array, expected: Uint8Array) {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}

let child: Deno.ChildProcess | undefined;
let childStatus: Promise<Deno.CommandStatus> | undefined;
let stdout: Promise<string> | undefined;
let stderr: Promise<string> | undefined;
let completed = false;

try {
  await remove(buildDir);
  const build = await viteCommand(
    ['--config', join(fixtureRoot, 'vite.worker.config.ts'), 'build'],
    { cwd: fixtureRoot }
  ).output();
  if (!build.success) {
    throw new Error(new TextDecoder().decode(build.stderr));
  }

  const assetPath = await emittedAsset();
  assert(assetPath, 'Worker build did not emit a JavaScript or CSS asset.');
  const assetUrl = `/${relative(clientDir, assetPath).split(sep).join('/')}`;
  const expectedAsset = await Deno.readFile(assetPath);
  const expectedContentType = extname(assetPath) === '.css' ? 'text/css' : 'javascript';

  const port = availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const wrangler = join(
    repositoryRoot,
    'node_modules',
    '.bin',
    Deno.build.os === 'windows' ? 'wrangler.cmd' : 'wrangler'
  );
  child = new Deno.Command(wrangler, {
    args: [
      'dev',
      '--config',
      join(fixtureRoot, 'wrangler.jsonc'),
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    cwd: fixtureRoot,
    env: {
      CI: 'true',
      WRANGLER_SEND_METRICS: 'false',
      WRANGLER_WRITE_LOGS: 'false',
    },
    stdout: 'piped',
    stderr: 'piped',
  }).spawn();
  childStatus = child.status;
  stdout = new Response(child.stdout).text();
  stderr = new Response(child.stderr).text();
  await waitForWrangler(origin, child, childStatus);

  const assetResponse = await fetch(`${origin}${assetUrl}`);
  const actualAsset = new Uint8Array(await assetResponse.arrayBuffer());
  assert(assetResponse.status === 200, `Asset returned ${assetResponse.status}.`);
  assert(
    (assetResponse.headers.get('content-type') ?? '').includes(expectedContentType),
    `Asset returned unexpected content type: ${assetResponse.headers.get('content-type')}`
  );
  assert(
    equalBytes(actualAsset, expectedAsset),
    'Cloudflare did not return the emitted asset bytes.'
  );
  assert(
    assetResponse.headers.get('x-limette-worker') === null,
    'Matching static asset unexpectedly invoked the Worker.'
  );

  const homeResponse = await fetch(`${origin}/`);
  const homeHtml = await homeResponse.text();
  assert(
    homeResponse.status === 200 && homeHtml.includes('Generated home'),
    'Cloudflare Worker did not render the home route.'
  );
  assert(
    homeResponse.headers.get('x-limette-worker') === '1',
    'Home route did not reach the Worker.'
  );

  const userResponse = await fetch(`${origin}/users/alice`);
  const userHtml = await userResponse.text();
  assert(
    userResponse.status === 200 &&
      userHtml.includes('alice') &&
      userHtml.includes('data-server-layout') &&
      userResponse.headers.get('x-server-middleware') === 'applied',
    'Cloudflare Worker did not render the dynamic route.'
  );
  assert(
    userResponse.headers.get('x-limette-worker') === '1',
    'Dynamic route did not reach the Worker.'
  );

  const missingAssetResponse = await fetch(`${origin}/assets/does-not-exist.js`);
  const missingAssetBody = await missingAssetResponse.text();
  assert(
    missingAssetResponse.status === 404 && missingAssetBody === 'Not Found',
    'Missing static asset did not preserve Limette 404 behavior.'
  );
  assert(
    missingAssetResponse.headers.get('x-limette-worker') === '1',
    'Missing static asset did not fall through to the Worker.'
  );

  const missingRouteResponse = await fetch(`${origin}/definitely-not-a-route`);
  const missingRouteBody = await missingRouteResponse.text();
  assert(
    missingRouteResponse.status === 404 && missingRouteBody === 'Not Found',
    'Application route did not preserve Limette 404 behavior.'
  );
  assert(
    missingRouteResponse.headers.get('x-limette-worker') === '1',
    'Application 404 did not reach the Worker.'
  );
  completed = true;
} finally {
  if (child && childStatus) {
    try {
      child.kill('SIGTERM');
    } catch {
      // Wrangler may already have exited.
    }
    await childStatus;
  }

  const output = (await stdout?.catch(() => '')) ?? '';
  const errors = (await stderr?.catch(() => '')) ?? '';
  if (!completed && (output || errors)) {
    console.log(`${output}${errors}`.trim());
  }
  await remove(buildDir);
  await remove(wranglerDir);
}
