import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  incomingMessageToRequest,
  writeResponseToServerResponse,
} from './adapters/node-http.ts';
import { staticDirectoryHandler } from './adapters/node-static-files.ts';
import type { StaticDirectoryHandlerOptions } from './adapters/static-files.ts';
import type { AppHandler } from './server/app.ts';

export interface ServeOptions {
  port?: number;
  hostname?: string;
  onListen?: (address: { hostname: string; port: number }) => void;
  staticFiles?: StaticDirectoryHandlerOptions;
}

export type { StaticDirectoryHandlerOptions };

function logStarted(t0: number, port: number, hostname = 'localhost') {
  const duration = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(
    `Limette app started (${duration}s)\n\t http://${hostname}:${port}\n`,
  );
}

function listen(server: Server, port: number, hostname?: string) {
  return new Promise<void>((resolve, reject) => {
    function onError(error: Error) {
      server.off('listening', onListening);
      reject(error);
    }

    function onListening() {
      server.off('error', onError);
      resolve();
    }

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, hostname);
  });
}

export async function serve(
  handler: AppHandler,
  { hostname, onListen, port, staticFiles }: ServeOptions = {},
) {
  const t0 = performance.now();
  const serveStatic = staticFiles
    ? staticDirectoryHandler(staticFiles)
    : undefined;
  const createAppServer = () =>
    createServer(async (req, res) => {
      try {
        const request = await incomingMessageToRequest(req);
        const response = await serveStatic?.(request) ??
          await handler(request, {});
        await writeResponseToServerResponse(response, res);
      } catch (error) {
        console.error(error);
        res.statusCode = 500;
        res.end('Internal server error');
      }
    });

  let server = createAppServer();

  if (port) {
    await listen(server, port, hostname);
  } else {
    let firstError;
    for (let candidate = 8000; candidate < 8020; candidate++) {
      try {
        await listen(server, candidate, hostname);
        firstError = undefined;
        break;
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'EADDRINUSE'
        ) {
          if (!firstError) firstError = error;
          server = createAppServer();
          continue;
        }

        throw error;
      }
    }

    if (firstError) throw firstError;
  }

  const address = server.address() as AddressInfo | null;
  const actualPort = address?.port ?? port;

  if (!actualPort) {
    throw new Error('Unable to determine server port.');
  }

  const listenAddress = {
    hostname: hostname ?? 'localhost',
    port: actualPort,
  };

  if (onListen) {
    onListen(listenAddress);
  } else {
    logStarted(t0, listenAddress.port, listenAddress.hostname);
  }

  return server;
}
