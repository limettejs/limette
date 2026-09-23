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

async function runDenoCheck(path: string, cwd: string) {
  const output = await new Deno.Command(Deno.execPath(), {
    args: ['check', '--node-modules-dir=manual', path],
    cwd,
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr));
  }
}

async function runDeno(path: string, cwd: string) {
  const output = await new Deno.Command(Deno.execPath(), {
    args: ['run', '-A', '--node-modules-dir=manual', path],
    cwd,
    stdout: 'piped',
    stderr: 'piped',
  }).output();
  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr));
  }
}

function dependencyVersions(
  tree: { dependencies?: Record<string, unknown> },
  names: ReadonlySet<string>,
  found = new Map<string, Set<string>>(),
) {
  for (const [name, value] of Object.entries(tree.dependencies ?? {})) {
    if (!value || typeof value !== 'object') continue;
    const dependency = value as {
      version?: string;
      dependencies?: Record<string, unknown>;
    };
    if (names.has(name) && dependency.version) {
      const versions = found.get(name) ?? new Set<string>();
      versions.add(dependency.version);
      found.set(name, versions);
    }
    dependencyVersions(dependency, names, found);
  }
  return found;
}

try {
  await Deno.mkdir(packageDirectory, { recursive: true });
  const packOutput = await command([
    'pack',
    '--workspace=limette',
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
    `import { App } from 'limette';
import { serve } from 'limette/node';
const app = new App()
  .get('/ok', () => new Response('ok'))
  .get('/redirect', (ctx) => ctx.redirect('../login', 307));
const response = await app.handler()(new Request('http://localhost/ok'));
const redirect = await app.handler()(new Request('http://localhost/redirect'));
if (
  await response.text() !== 'ok' ||
  redirect.status !== 307 ||
  redirect.headers.get('location') !== '../login' ||
  typeof serve !== 'function'
) process.exit(1);
`,
  );
  await runNode(runtimeTest, runtimeDirectory);

  const denoRuntimeTest = join(runtimeDirectory, 'deno-test.ts');
  await Deno.writeTextFile(
    denoRuntimeTest,
    `import { App } from 'limette';
import { serve } from 'limette/deno';
const app = new App().get('/ok', () => new Response('deno-ok'));
const response = await app.handler()(new Request('http://localhost/ok'));
if (await response.text() !== 'deno-ok' || typeof serve !== 'function') {
  Deno.exit(1);
}
`,
  );
  await runDeno(denoRuntimeTest, runtimeDirectory);

  const runtimeTypeTest = join(runtimeDirectory, 'types.ts');
  await Deno.writeTextFile(
    runtimeTypeTest,
    `import { App } from 'limette';
import type {
  AppHandler,
  Context,
  Middleware,
  RedirectStatus,
  RenderContext,
  RouteHandler,
  RouteHandlers,
} from 'limette';

interface State { value?: string }
interface Platform { marker: string }

const middleware = ((ctx) => {
  ctx.state.value = ctx.platform.marker;
  return ctx.next();
}) satisfies Middleware<State, Platform>;

const routeHandler = ((ctx) => ctx.render()) satisfies RouteHandler<State, Platform>;
const routeHandlers = {
  GET(ctx) {
    ctx.state.value = ctx.platform.marker;
    return ctx.render();
  },
  POST() {
    return new Response('POST');
  },
} satisfies RouteHandlers<State, Platform>;

const appHandler = ((request, platform) =>
  new Response(request.method + platform?.marker)) satisfies AppHandler<Platform>;

declare const context: Context<State, Platform>;
declare const renderContext: RenderContext<State, Platform>;
const redirectStatus: RedirectStatus = 303;
context.redirect(new URL('https://example.com/path'), redirectStatus);
// @ts-expect-error Unsupported redirect status.
context.redirect('/invalid', 200);
// @ts-expect-error Structural render context has no redirect helper.
renderContext.redirect('/invalid');
const app = new App<State, Platform>();
app.get('/typed', (ctx) => {
  ctx.state.value = ctx.platform.marker;
  return new Response(ctx.state.value);
});
app.post(new URLPattern({ pathname: '/typed' }), routeHandler);
// @ts-expect-error Route registration requires at least one handler.
app.get('/missing-handler');
void [middleware, routeHandler, routeHandlers, appHandler, context, renderContext, app];
`,
  );
  await runDenoCheck(runtimeTypeTest, runtimeDirectory);

  await command([
    'install',
    '--ignore-scripts',
    '--no-package-lock',
    '--no-audit',
    '--no-fund',
    archive,
    'vite@^8.0.0',
    'typescript@^6.0.3',
  ], viteDirectory);
  const litPackages = new Set([
    'lit',
    'lit-html',
    'lit-element',
    '@lit/reactive-element',
    '@lit-labs/ssr',
    '@lit-labs/ssr-client',
  ]);
  const installedTree = JSON.parse(
    await command(['ls', '--all', '--json'], viteDirectory),
  ) as { dependencies?: Record<string, unknown> };
  const installedVersions = dependencyVersions(installedTree, litPackages);
  for (const name of litPackages) {
    const versions = installedVersions.get(name);
    assert(
      versions?.size === 1,
      `Packed Vite consumer resolved incompatible ${name} versions: ${
        versions ? [...versions].join(', ') : 'missing'
      }.`,
    );
  }
  const viteTest = join(viteDirectory, 'test.mjs');
  await Deno.writeTextFile(
    viteTest,
    `import { limette } from 'limette/vite';
const plugin = limette({ app: './app.ts' });
if (plugin.name !== 'limette') process.exit(1);
`,
  );
  await runNode(viteTest, viteDirectory);

  await Deno.writeTextFile(
    join(viteDirectory, 'app.ts'),
    `import { App } from 'limette';
export const app = new App().fsRoutes();
`,
  );
  await Deno.writeTextFile(
    join(viteDirectory, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import { limette } from 'limette/vite';
export default defineConfig({ plugins: [limette({ app: './app.ts' })] });
`,
  );
  await Deno.mkdir(join(viteDirectory, 'routes'), { recursive: true });
  await Deno.writeTextFile(
    join(viteDirectory, 'routes/_app.ts'),
    `import { AppComponent } from 'limette';
import { html } from 'lit';
export default class extends AppComponent {
  render() {
    return html\`<!doctype html><html><head>\${this.assets.styles}</head><body>\${this.outlet}\${this.assets.scripts}</body></html>\`;
  }
}
`,
  );
  await Deno.writeTextFile(
    join(viteDirectory, 'routes/index.ts'),
    `import { PageComponent } from 'limette';
import { html } from 'lit';
import './index.css';
export default class extends PageComponent {
  render() { return html\`<h1>Packed Vite consumer</h1>\`; }
}
`,
  );
  await Deno.writeTextFile(
    join(viteDirectory, 'routes/index.css'),
    'h1 { color: green; }\n',
  );
  await command(['exec', 'vite', '--', 'build'], viteDirectory);
  await Deno.stat(join(viteDirectory, 'dist/server/entry.js'));

  const viteRuntimeTest = join(viteDirectory, 'vite-runtime.mjs');
  await Deno.writeTextFile(
    viteRuntimeTest,
    `import handler from './dist/server/entry.js';
const response = await handler(new Request('http://localhost/'));
if (!response.ok || !(await response.text()).includes('Packed Vite consumer')) {
  process.exit(1);
}
`,
  );
  await runNode(viteRuntimeTest, viteDirectory);

  const typescriptTest = join(viteDirectory, 'types.ts');
  await Deno.writeTextFile(
    typescriptTest,
    `import { App, type AppHandler } from 'limette';
import { serve as nodeServe } from 'limette/node';
import { serve as denoServe } from 'limette/deno';
import { limette } from 'limette/vite';
const handler = new App().handler() satisfies AppHandler;
void [handler, nodeServe, denoServe, limette];
`,
  );
  await command([
    'exec',
    'tsc',
    '--',
    '--noEmit',
    '--target',
    'ES2022',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--skipLibCheck',
    typescriptTest,
  ], viteDirectory);
} finally {
  await Deno.remove(temporaryRoot, { recursive: true });
}
