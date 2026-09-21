import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'npm:playwright-core@1.63.0';
import { viteCommand } from './_vite-command.ts';

const fixtureRoot = fileURLToPath(
  new URL('../fixtures/server-build/', import.meta.url),
);
const buildDir = join(fixtureRoot, 'dist');

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

async function availablePort() {
  const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return port;
}

async function waitForServer(origin: string, child: Deno.ChildProcess) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`${origin}/`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return await response.text();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  try {
    child.kill('SIGTERM');
  } catch {
    // The server may already have exited.
  }
  throw new Error(
    `Server did not start: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function assertServerHtml(html: string, label: string) {
  assert(
    (html.match(/<test-counter(?:\s|>)/g) ?? []).length === 1,
    `${label} did not render exactly one SSR island host.`,
  );
  assert(
    html.split('Count:').length - 1 === 1,
    `${label} did not contain exactly one server-rendered counter UI.`,
  );
  assert(
    (html.match(/<test-client-only(?:\s|>)/g) ?? []).length === 1 &&
      !html.includes('Client count:'),
    `${label} did not preserve CSR-only server behavior.`,
  );
}

async function verifyBfcacheRecovery(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  origin: string,
) {
  const routePath = join(fixtureRoot, 'routes/index.ts');
  const originalRoute = await Deno.readTextFile(routePath);
  const changedRoute = originalRoute.replace(
    'Generated home',
    'Generated home after BFCache',
  );
  assert(
    changedRoute !== originalRoute,
    'BFCache route fixture did not change.',
  );

  const page = await browser.newPage();
  await page.addInitScript(() => {
    const loadKey = '__limetteBfcacheLoads';
    const restoreKey = '__limetteBfcacheRestores';
    sessionStorage.setItem(
      loadKey,
      String(Number(sessionStorage.getItem(loadKey) ?? '0') + 1),
    );
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        sessionStorage.setItem(
          restoreKey,
          String(Number(sessionStorage.getItem(restoreKey) ?? '0') + 1),
        );
      }
    });
  });

  const state = () =>
    page.evaluate(() => ({
      loads: Number(sessionStorage.getItem('__limetteBfcacheLoads') ?? '0'),
      restores: Number(
        sessionStorage.getItem('__limetteBfcacheRestores') ?? '0',
      ),
    }));

  try {
    await page.goto(`${origin}/`, { waitUntil: 'load' });
    assert(
      (await state()).loads === 1,
      'Initial dev page loaded more than once.',
    );
    assert(
      await page.locator('[data-limette-bfcache-recovery]').count() === 1,
      'Dev HTML did not contain exactly one BFCache recovery hook.',
    );

    await page.goto(`${origin}/about`, { waitUntil: 'load' });
    assert(
      (await state()).loads === 2,
      'Normal forward navigation unexpectedly triggered a reload.',
    );

    await page.goBack({ waitUntil: 'commit' }).catch(() => undefined);
    await page.waitForURL(`${origin}/`);
    await page.waitForLoadState('load').catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 250));

    let restored = await state();
    const usedNativeBfcache = restored.restores > 0;
    if (restored.restores === 0) {
      // Headless browser BFCache eligibility varies by platform. Exercise the
      // same browser lifecycle branch deterministically when it was bypassed.
      const loadsBeforeSyntheticRestore = restored.loads;
      await page.evaluate(() =>
        window.dispatchEvent(
          new PageTransitionEvent('pageshow', { persisted: true }),
        )
      );
      await page.waitForFunction(
        (loads) =>
          Number(sessionStorage.getItem('__limetteBfcacheLoads') ?? '0') >
            loads,
        loadsBeforeSyntheticRestore,
      );
      restored = await state();
    } else {
      await page.waitForFunction(() =>
        Number(sessionStorage.getItem('__limetteBfcacheLoads') ?? '0') >= 3
      );
      restored = await state();
    }

    assert(
      restored.restores === 1,
      'BFCache restoration was handled more than once.',
    );
    console.log(
      `browser hydration: BFCache lifecycle ${
        usedNativeBfcache ? 'restored natively' : 'used deterministic fallback'
      }`,
    );
    const stableLoadCount = restored.loads;
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert(
      (await state()).loads === stableLoadCount,
      'BFCache recovery entered a reload loop.',
    );

    await Deno.writeTextFile(routePath, changedRoute);
    await page.waitForFunction(() =>
      document.body.textContent?.includes('Generated home after BFCache')
    );
    assert(
      (await state()).loads === stableLoadCount + 1,
      'Vite full reload did not recover after BFCache restoration.',
    );
  } finally {
    await Deno.writeTextFile(routePath, originalRoute);
    await page.close();
  }
}

async function verifyMixedPage(
  page: Page,
  origin: string,
  entryUrlFragment: string,
  label: string,
  serverHtml: string,
) {
  page.setDefaultTimeout(10_000);
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  const entryScript = serverHtml.match(
    /<script type="module" src="[^"]+"><\/script>/g,
  )
    ?.find((script) => script.includes(entryUrlFragment));
  assert(entryScript, `${label} did not emit its generated client entry.`);
  const marker = `<script>
    const ssrHost = document.querySelector('test-counter');
    const csrHost = document.querySelector('test-client-only');
    window.__limetteSsrButton = ssrHost?.shadowRoot?.querySelector('button');
    window.__limetteBefore = {
      ssrHosts: document.querySelectorAll('test-counter').length,
      ssrCountTexts: [...(ssrHost?.shadowRoot?.querySelectorAll('span') ?? [])]
        .filter((node) => node.textContent?.includes('Count:')).length,
      csrHosts: document.querySelectorAll('test-client-only').length,
      csrCountTexts: [...(csrHost?.shadowRoot?.querySelectorAll('span') ?? [])]
        .filter((node) => node.textContent?.includes('Client count:')).length,
    };
  </script>`;
  const instrumentedHtml = serverHtml.replace(
    entryScript,
    `${marker}${entryScript}`,
  );
  await page.route(`${origin}/`, (route) =>
    route.fulfill({
      body: instrumentedHtml,
      contentType: 'text/html',
      status: 200,
    }));

  await page.goto(`${origin}/`, { waitUntil: 'load' });
  console.log(`browser hydration: ${label} entry loaded`);
  const beforeBootstrap = await page.evaluate(() =>
    (window as typeof window & {
      __limetteBefore?: {
        ssrHosts: number;
        ssrCountTexts: number;
        csrHosts: number;
        csrCountTexts: number;
      };
    }).__limetteBefore
  );
  assert(beforeBootstrap, `${label} did not run its pre-bootstrap marker.`);
  assert(
    beforeBootstrap.ssrHosts === 1 && beforeBootstrap.ssrCountTexts === 1,
    `${label} SSR UI was not present exactly once before bootstrap.`,
  );
  assert(
    beforeBootstrap.csrHosts === 1 && beforeBootstrap.csrCountTexts === 0,
    `${label} executed the CSR-only component before browser bootstrap: ${
      JSON.stringify(beforeBootstrap)
    }.`,
  );

  try {
    await page.waitForFunction(
      async () => {
        await Promise.all([
          customElements.whenDefined('test-counter'),
          customElements.whenDefined('test-client-only'),
        ]);
        const ssr = document.querySelector('test-counter') as
          | (HTMLElement & { updateComplete?: Promise<unknown> })
          | null;
        const csr = document.querySelector('test-client-only') as
          | (HTMLElement & { updateComplete?: Promise<unknown> })
          | null;
        await Promise.all([ssr?.updateComplete, csr?.updateComplete]);
        return csr?.shadowRoot?.textContent?.includes('Client count: 0');
      },
      undefined,
      { timeout: 10_000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      ssrDefined: Boolean(customElements.get('test-counter')),
      csrDefined: Boolean(customElements.get('test-client-only')),
      ssrText: document.querySelector('test-counter')?.shadowRoot?.textContent,
      csrText: document.querySelector('test-client-only')?.shadowRoot
        ?.textContent,
    }));
    throw new Error(
      `${label} did not finish browser bootstrap: ${
        error instanceof Error ? error.message : String(error)
      }\nState: ${JSON.stringify(state)}\nErrors: ${browserErrors.join('\n')}`,
    );
  }

  const hydrated = await page.evaluate(() => {
    const ssrHost = document.querySelector('test-counter');
    const csrHost = document.querySelector('test-client-only');
    const firstSsrButton = ssrHost?.shadowRoot?.querySelector('button');
    return {
      ssrHosts: document.querySelectorAll('test-counter').length,
      ssrCountTexts: [...(ssrHost?.shadowRoot?.querySelectorAll('span') ?? [])]
        .filter((node) => node.textContent?.includes('Count:')).length,
      csrHosts: document.querySelectorAll('test-client-only').length,
      csrCountTexts: [...(csrHost?.shadowRoot?.querySelectorAll('span') ?? [])]
        .filter((node) => node.textContent?.includes('Client count:')).length,
      reusedSsrNode:
        (window as typeof window & { __limetteSsrButton?: Element })
          .__limetteSsrButton === firstSsrButton,
      deferHydration: ssrHost?.hasAttribute('defer-hydration'),
      litElementRuntimeCount:
        (globalThis as typeof globalThis & { litElementVersions?: string[] })
          .litElementVersions?.length,
      litHtmlRuntimeCount:
        (globalThis as typeof globalThis & { litHtmlVersions?: string[] })
          .litHtmlVersions?.length,
    };
  });
  assert(
    hydrated.ssrHosts === 1 && hydrated.ssrCountTexts === 1,
    `${label} duplicated the SSR island during hydration: ${
      JSON.stringify(hydrated)
    }. Errors: ${browserErrors.join('\n')}`,
  );
  assert(
    hydrated.reusedSsrNode,
    `${label} replaced instead of hydrating SSR DOM.`,
  );
  assert(
    hydrated.deferHydration === false,
    `${label} left defer-hydration on the hydrated island.`,
  );
  assert(
    hydrated.litElementRuntimeCount === 1 &&
      hydrated.litHtmlRuntimeCount === 1,
    `${label} loaded duplicate Lit runtimes: ${JSON.stringify(hydrated)}.`,
  );
  assert(
    hydrated.csrHosts === 1 && hydrated.csrCountTexts === 1,
    `${label} did not client-render the CSR-only island exactly once.`,
  );
  console.log(`browser hydration: ${label} bootstrap verified`);

  const interaction = await page.evaluate(async () => {
    const ssr = document.querySelector('test-counter') as
      | (HTMLElement & { updateComplete?: Promise<unknown> })
      | null;
    const csr = document.querySelector('test-client-only') as
      | (HTMLElement & { updateComplete?: Promise<unknown> })
      | null;
    (ssr?.shadowRoot?.querySelectorAll('button')[1] as
      | HTMLButtonElement
      | undefined)?.click();
    (csr?.shadowRoot?.querySelectorAll('button')[1] as
      | HTMLButtonElement
      | undefined)?.click();
    await Promise.all([ssr?.updateComplete, csr?.updateComplete]);
    return {
      ssrText: ssr?.shadowRoot?.textContent,
      csrText: csr?.shadowRoot?.textContent,
    };
  });
  assert(
    interaction.ssrText?.includes('Count: 1') &&
      interaction.csrText?.includes('Client count: 1'),
    `${label} islands were not both interactive: ${
      JSON.stringify(interaction)
    }.`,
  );
  console.log(`browser hydration: ${label} interaction verified`);

  assert(
    browserErrors.length === 0,
    `${label} logged browser errors:\n${browserErrors.join('\n')}`,
  );
}

async function stop(
  child: Deno.ChildProcess | undefined,
  output: Promise<string> | undefined,
) {
  if (!child) return;
  try {
    child.kill('SIGTERM');
  } catch {
    // The process may already have exited.
  }
  const stopped = await Promise.race([
    child.status.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!stopped) {
    try {
      child.kill('SIGKILL');
    } catch {
      // The process may have exited between the timeout and signal.
    }
    await child.status;
  }
  await output;
}

const chromeExecutable = Deno.env.get('CHROME_PATH') ??
  (Deno.build.os === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : Deno.build.os === 'windows'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome');

try {
  await Deno.stat(chromeExecutable);
} catch {
  throw new Error(
    `A real Chrome browser is required. Set CHROME_PATH (looked for ${chromeExecutable}).`,
  );
}

let devChild: Deno.ChildProcess | undefined;
let devStderr: Promise<string> | undefined;
let productionChild: Deno.ChildProcess | undefined;
let productionStderr: Promise<string> | undefined;
const browser = await chromium.launch({
  args: ['--disable-features=LocalNetworkAccessChecks'],
  executablePath: chromeExecutable,
  headless: true,
});

try {
  console.log('browser hydration: starting Vite dev');
  const devPort = await availablePort();
  const devOrigin = `http://127.0.0.1:${devPort}`;
  console.log(`browser hydration: Vite dev at ${devOrigin}`);
  devChild = viteCommand([
    '--config',
    join(fixtureRoot, 'vite.browser.config.ts'),
    '--host',
    '127.0.0.1',
    '--port',
    String(devPort),
    '--strictPort',
    '--logLevel',
    'error',
  ], { cwd: fixtureRoot, stderr: 'inherit' }).spawn();
  const devHtml = await waitForServer(devOrigin, devChild);
  assertServerHtml(devHtml, 'Vite dev');
  console.log('browser hydration: checking Vite dev page');
  const devPage = await browser.newPage();
  await verifyMixedPage(
    devPage,
    devOrigin,
    '/@limette/client-entry/',
    'Vite dev',
    devHtml,
  );
  await devPage.close();
  console.log('browser hydration: checking BFCache recovery');
  await verifyBfcacheRecovery(browser, devOrigin);
  console.log('browser hydration: BFCache recovery verified');
  await stop(devChild, devStderr);
  devChild = undefined;
  devStderr = undefined;

  console.log('browser hydration: building production fixture');
  await remove(buildDir);
  const build = await viteCommand([
    '--config',
    join(fixtureRoot, 'vite.config.ts'),
    'build',
  ], { cwd: fixtureRoot }).output();
  if (!build.success) {
    throw new Error(new TextDecoder().decode(build.stderr));
  }
  await Deno.copyFile(
    join(fixtureRoot, 'deno-runner.ts'),
    join(buildDir, 'deno-runner.ts'),
  );

  const productionPort = await availablePort();
  const productionOrigin = `http://127.0.0.1:${productionPort}`;
  productionChild = new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      '-A',
      '--config',
      join(fixtureRoot, '../../../examples/deno.json'),
      join(buildDir, 'deno-runner.ts'),
      String(productionPort),
    ],
    cwd: fixtureRoot,
    stdout: 'null',
    stderr: 'inherit',
  }).spawn();
  const productionHtml = await waitForServer(
    productionOrigin,
    productionChild,
  );
  assertServerHtml(productionHtml, 'Production');
  assert(
    !productionHtml.includes('data-limette-bfcache-recovery') &&
      !productionHtml.includes('event.persisted'),
    'Production HTML contained the development BFCache recovery hook.',
  );
  console.log('browser hydration: checking production page');
  const productionPage = await browser.newPage();
  await verifyMixedPage(
    productionPage,
    productionOrigin,
    '/assets/limette-route-',
    'Production',
    productionHtml,
  );
  await productionPage.close();
  console.log('browser hydration: passed');
} catch (error) {
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}\n` +
      `Vite dev stderr:\n${await devStderr ?? ''}\n` +
      `Production stderr:\n${await productionStderr ?? ''}`,
  );
} finally {
  await browser.close();
  await stop(devChild, devStderr);
  await stop(productionChild, productionStderr);
  await remove(buildDir);
}
