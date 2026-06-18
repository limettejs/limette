import { Spinner } from '@std/cli/unstable-spinner';
import { bgGreen, blue } from '@std/fmt/colors';
import { prepareApp } from './server/serve.ts';
import type { App } from './server/app.ts';

export type ServeOptions =
  & Partial<
    Deno.ServeTcpOptions & Deno.TlsCertifiedKeyPem
  >
  & {
    remoteAddress?: string;
  };

function logStarted(t0: number, port: number) {
  const duration = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(
    `🟢 ${bgGreen(' Limette ')} app started (${duration}s) \n\t ${
      blue(`http://localhost:${port}`)
    }\n`,
  );
}

function normalizeOptions(options: ServeOptions): ServeOptions {
  if (options.onListen) return options;

  return {
    ...options,
    onListen(params) {
      const protocol = 'key' in options && options.key && options.cert
        ? 'https:'
        : 'http:';
      let hostname = params.hostname;

      if (
        Deno.build.os === 'windows' &&
        (hostname === '0.0.0.0' || hostname === '::')
      ) {
        hostname = 'localhost';
      }

      hostname = hostname.startsWith('::') ? `[${hostname}]` : hostname;
      void `${protocol}//${hostname}:${params.port}/`;
    },
  };
}

export async function serve(app: App, options: ServeOptions = {}) {
  const t0 = performance.now();
  const spinner = new Spinner({ message: 'Starting...', color: 'blue' });
  spinner.start();

  await prepareApp(app);

  const handler = app.handler();
  const serveOptions = normalizeOptions(options);

  if (serveOptions.port) {
    Deno.serve(serveOptions, handler);
    spinner.stop();
    logStarted(t0, serveOptions.port);
    return;
  }

  let firstError;
  for (let port = 8000; port < 8020; port++) {
    try {
      Deno.serve({ ...serveOptions, port }, handler);
      firstError = undefined;
      spinner.stop();
      logStarted(t0, port);
      return;
    } catch (err) {
      if (err instanceof Deno.errors.AddrInUse) {
        if (!firstError) firstError = err;
        continue;
      }

      throw err;
    }
  }

  if (firstError) throw firstError;
}
