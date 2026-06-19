import { join } from 'node:path';
import { exampleRoot } from './_paths.ts';

const port = 5179;
const origin = `http://127.0.0.1:${port}`;
const homeRoutePath = join(exampleRoot, 'routes/index.js');
const originalHomeRoute = await Deno.readTextFile(homeRoutePath);
let homeRouteChanged = false;
const command = new Deno.Command(Deno.execPath(), {
  args: [
    'run',
    '-A',
    'npm:vite@^8.0.0',
    '--config',
    'vite.config.ts',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
    '--logLevel',
    'error',
  ],
  cwd: exampleRoot,
  stdout: 'null',
  stderr: 'piped',
});
const child = command.spawn();
const stderr = new Response(child.stderr).text();

try {
  let pageResponse: Response | undefined;
  let lastError: unknown;

  for (let i = 0; i < 40; i++) {
    try {
      pageResponse = await fetch(`${origin}/`);
      if (pageResponse.ok) break;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!pageResponse?.ok) {
    try {
      child.kill('SIGTERM');
    } catch {
      // The process may already have exited if startup failed.
    }

    throw new Error(
      `Expected Vite dev server to render the page. Last error: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }\nVite stderr:\n${await stderr}`,
    );
  }

  const html = await pageResponse.text();
  const scriptPath = html.match(/<script type="module" src="([^"]+)"/)?.[1];

  if (!scriptPath?.startsWith('/@limette/client-entry/')) {
    throw new Error('Expected SSR output to include a same-origin Vite entry.');
  }

  const entryResponse = await fetch(`${origin}${scriptPath}`);

  if (!entryResponse.ok) {
    throw new Error(
      `Expected Vite entry to load, got ${entryResponse.status}.`,
    );
  }

  const code = await entryResponse.text();

  if (!code.includes('/@vite/client') || !code.includes('island-foo')) {
    throw new Error('Expected Vite dev entry to include HMR and island code.');
  }

  const missingResponse = await fetch(`${origin}/missing-chunk.js`);

  if (missingResponse.status !== 404) {
    throw new Error(
      `Expected missing chunk request to return 404, got ${missingResponse.status}.`,
    );
  }

  const recoveryResponse = await fetch(`${origin}/`);

  if (!recoveryResponse.ok) {
    throw new Error('Expected dev server to keep running after a 404.');
  }

  const updatedHomeRoute = originalHomeRoute.replace(
    'SSR content',
    'SSR content changed by Vite dev smoke',
  );

  if (updatedHomeRoute === originalHomeRoute) {
    throw new Error('Expected home route fixture to contain SSR content.');
  }

  await Deno.writeTextFile(homeRoutePath, updatedHomeRoute);
  homeRouteChanged = true;

  let updatedHtml = '';

  for (let i = 0; i < 40; i++) {
    const updatedResponse = await fetch(`${origin}/`);
    updatedHtml = await updatedResponse.text();

    if (
      updatedResponse.ok &&
      updatedHtml.includes('SSR content changed by Vite dev smoke')
    ) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!updatedHtml.includes('SSR content changed by Vite dev smoke')) {
    throw new Error('Expected changed server route code to be reloaded.');
  }
} finally {
  if (homeRouteChanged) {
    await Deno.writeTextFile(homeRoutePath, originalHomeRoute);
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // The process may already have exited if startup failed.
  }
  await child.status;
  await stderr;
}
