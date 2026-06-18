export interface StartViteDevServerOptions {
  root?: string;
  configFile?: string;
  devServerOrigin?: string;
  devServerHost?: string;
  devServerPort?: number;
  logLevel?: 'info' | 'warn' | 'error' | 'silent';
  mode?: string;
  startupTimeoutMs?: number;
  strictPort?: boolean;
  viteSpecifier?: string;
}

export interface ViteDevServerProcess {
  origin: string;
  child: Deno.ChildProcess;
  close: () => Promise<void>;
}

export interface WaitForViteDevServerOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

function devServerAddress(options: StartViteDevServerOptions) {
  if (options.devServerOrigin) {
    const url = new URL(options.devServerOrigin);
    return {
      origin: url.origin,
      host: options.devServerHost ?? url.hostname,
      port: options.devServerPort ?? Number(url.port || 5173),
    };
  }

  const host = options.devServerHost ?? 'localhost';
  const port = options.devServerPort ?? 5173;

  return {
    origin: `http://${host}:${port}`,
    host,
    port,
  };
}

export function startViteDevServer(
  options: StartViteDevServerOptions = {},
): ViteDevServerProcess {
  const root = options.root ?? Deno.cwd();
  const address = devServerAddress(options);
  const args = [
    'run',
    '-A',
    options.viteSpecifier ?? 'npm:vite@^8.0.0',
    '--config',
    options.configFile ?? 'vite.config.ts',
    '--host',
    address.host,
    '--port',
    String(address.port),
    '--clearScreen',
    'false',
    '--logLevel',
    options.logLevel ?? 'error',
  ];

  if (options.strictPort !== false) {
    args.push('--strictPort');
  }

  if (options.mode) {
    args.push('--mode', options.mode);
  }

  const child = new Deno.Command(Deno.execPath(), {
    args,
    cwd: root,
    stdin: 'null',
    stdout: 'inherit',
    stderr: 'inherit',
  }).spawn();

  return {
    origin: address.origin,
    child,
    async close() {
      try {
        child.kill('SIGTERM');
      } catch {
        // The process may already have exited.
      }

      await child.status;
    },
  };
}

export async function waitForViteDevServer(
  server: ViteDevServerProcess,
  options: WaitForViteDevServerOptions = {},
) {
  const intervalMs = options.intervalMs ?? 100;
  const startedAt = performance.now();
  const timeoutMs = options.timeoutMs ?? 10_000;
  let status: Deno.CommandStatus | undefined;
  const statusPromise = server.child.status.then((result) => {
    status = result;
    return result;
  });

  while (performance.now() - startedAt < timeoutMs) {
    if (status) {
      throw new Error(`Vite dev server exited with code ${status.code}.`);
    }

    try {
      const response = await fetch(server.origin);
      await response.body?.cancel();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    await Promise.race([
      statusPromise,
      new Promise((resolve) => setTimeout(resolve, 0)),
    ]);
  }

  throw new Error(`Vite dev server did not start within ${timeoutMs}ms.`);
}
