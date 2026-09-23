import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { viteCommand } from './_vite-command.ts';

const fixtureRoot = fileURLToPath(new URL('../fixtures/server-build/', import.meta.url));
const buildDir = join(fixtureRoot, 'dist');
const serverDir = join(buildDir, 'server');

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

async function readJavaScript(path: string): Promise<string> {
  let source = '';
  for await (const entry of Deno.readDir(path)) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory) {
      source += await readJavaScript(entryPath);
    } else if (entry.isFile && entry.name.endsWith('.js')) {
      source += `\n${await Deno.readTextFile(entryPath)}`;
    }
  }
  return source;
}

function runtimeSpecifierPattern(specifier: string) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:from\\s*|import\\s*(?:\\(\\s*)?|require\\s*\\(\\s*|__require\\s*\\(\\s*)["']${escaped}(?:\\/[^"']*)?["']`
  );
}

try {
  await remove(buildDir);
  const output = await viteCommand(
    ['--config', join(fixtureRoot, 'vite.worker.config.ts'), 'build'],
    { cwd: fixtureRoot }
  ).output();
  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr));
  }

  const emittedSource = await readJavaScript(serverDir);
  for (const specifier of [
    'node:fs',
    'node:http',
    'node:https',
    'node:stream',
    'node:buffer',
    'node:zlib',
    'node:net',
    'node:url',
  ]) {
    assert(
      !runtimeSpecifierPattern(specifier).test(emittedSource),
      `Worker server artifact imports ${specifier}.`
    );
  }
  assert(
    !emittedSource.includes('node-fetch'),
    'Worker server artifact still contains node-fetch.'
  );
  assert(
    !runtimeSpecifierPattern('buffer').test(emittedSource),
    'Worker server artifact imports the Node buffer module.'
  );
  assert(
    !emittedSource.includes('createRequire'),
    'Worker server artifact contains createRequire.'
  );
  assert(
    !/(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*|__require\s*\(\s*)["']node:/.test(
      emittedSource
    ),
    'Worker server artifact contains a Node runtime import.'
  );
  assert(
    !/\bDeno\./.test(emittedSource),
    'Worker server artifact contains a Deno runtime reference.'
  );
  assert(
    !runtimeSpecifierPattern('limette').test(emittedSource),
    'Worker server artifact externalized limette.'
  );
  for (const forbidden of [
    'src/vite/',
    'discoverRoutes',
    'loadViteBuildRoutes',
    'resolveClientAssets',
    'setFsRoutes',
    'prepareApp',
    '.vite/manifest.json',
  ]) {
    assert(
      !emittedSource.includes(forbidden),
      `Worker server artifact contains build/runtime preparation code: ${forbidden}`
    );
  }
  assert(
    !/from\s*["']vite["']|import\s*\(\s*["']vite["']\s*\)/.test(emittedSource),
    'Worker server artifact imports Vite.'
  );

  type WorkerEnv = { readonly TEST_VALUE: string };
  type WorkerContext = {
    waitUntil(promise: Promise<unknown>): void;
  };
  type WorkerHandler = (
    request: Request,
    env: WorkerEnv,
    ctx: WorkerContext
  ) => Response | Promise<Response>;
  type AppHandler = (request: Request, platform?: unknown) => Response | Promise<Response>;

  const entryUrl = pathToFileURL(join(serverDir, 'entry.js'));
  entryUrl.searchParams.set('test', crypto.randomUUID());
  const serverModule = (await import(entryUrl.href)) as {
    default: AppHandler;
    handler: AppHandler;
  };
  assert(
    serverModule.default === serverModule.handler,
    'Worker artifact default export is not its AppHandler.'
  );

  const worker: { fetch: WorkerHandler } = {
    fetch(request, env, ctx) {
      return serverModule.default(request, { env, ctx });
    },
  };
  const routeEnv: WorkerEnv = { TEST_VALUE: 'worker-env' };
  let envReads = 0;
  const env: WorkerEnv = {
    get TEST_VALUE() {
      envReads++;
      return 'worker-env';
    },
  };
  const backgroundTasks: Promise<unknown>[] = [];
  const workerContext: WorkerContext = {
    waitUntil(promise) {
      assert(this === workerContext, 'Route received a different Worker context.');
      backgroundTasks.push(promise);
    },
  };

  const homeResponse = await worker.fetch(
    new Request('https://worker.test/'),
    routeEnv,
    workerContext
  );
  const homeHtml = await homeResponse.text();
  assert(
    homeResponse.status === 200 && homeHtml.includes('Generated home'),
    'Worker wrapper did not render the home route.'
  );
  assert(
    homeResponse.headers.get('x-server-middleware') === 'applied' &&
      homeHtml.includes('data-server-layout'),
    'Worker home route lost middleware or layout behavior.'
  );

  const userResponse = await worker.fetch(
    new Request('https://worker.test/users/worker-user'),
    routeEnv,
    workerContext
  );
  const userHtml = await userResponse.text();
  assert(
    userResponse.status === 200 && userHtml.includes('worker-user'),
    'Worker wrapper did not render the dynamic route.'
  );
  assert(
    userResponse.headers.get('x-server-middleware') === 'applied' &&
      userHtml.includes('data-server-layout'),
    'Worker dynamic route lost middleware or layout behavior.'
  );

  const metadataResponse = await worker.fetch(
    new Request('https://worker.test/worker-info'),
    env,
    workerContext
  );
  const metadata = (await metadataResponse.json()) as { testValue?: string };
  assert(
    metadataResponse.status === 200 && metadata.testValue === 'worker-env',
    'Worker environment metadata did not reach the route.'
  );
  assert(envReads === 1, 'Route did not read from the original Worker environment.');
  assert(
    backgroundTasks.length === 1,
    'Route did not receive the original Worker execution context.'
  );
  await Promise.all(backgroundTasks);

  const entry = await Deno.stat(join(serverDir, 'entry.js'));
  console.log(`Worker server entry: ${entry.size} bytes`);
  console.log(
    emittedSource.includes('from "node:module"') || emittedSource.includes("from 'node:module'")
      ? 'Worker server entry retains node:module.'
      : 'Worker server entry contains no node:module import.'
  );
} finally {
  await remove(buildDir);
}
