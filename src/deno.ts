import { staticDirectoryHandler } from './adapters/deno-static-files.ts';
import type { StaticDirectoryHandlerOptions } from './adapters/static-files.ts';
import type { AppHandler } from './server/app.ts';

export type ServeOptions =
  & Partial<
    Deno.ServeTcpOptions & Deno.TlsCertifiedKeyPem
  >
  & {
    staticFiles?: StaticDirectoryHandlerOptions;
  };

export type { StaticDirectoryHandlerOptions };

function logStarted(t0: number, port: number) {
  const duration = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(
    `Limette app started (${duration}s)\n\t http://localhost:${port}\n`,
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

export async function serve(
  handler: AppHandler,
  options: ServeOptions = {},
) {
  const t0 = performance.now();
  const { staticFiles, ...denoOptions } = options;
  const serveOptions = normalizeOptions(denoOptions);
  const serveStatic = staticFiles
    ? staticDirectoryHandler(staticFiles)
    : undefined;
  const hostedHandler: Deno.ServeHandler = async (request, platform) =>
    await serveStatic?.(request) ?? await handler(request, platform);

  if (serveOptions.port) {
    const server = Deno.serve(serveOptions, hostedHandler);
    logStarted(t0, serveOptions.port);
    return server;
  }

  let firstError;
  for (let port = 8000; port < 8020; port++) {
    try {
      const server = Deno.serve({ ...serveOptions, port }, hostedHandler);
      firstError = undefined;
      logStarted(t0, port);
      return server;
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
