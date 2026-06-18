import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  incomingMessageToRequest,
  writeResponseToServerResponse,
} from './adapters/node-http.ts';
import { prepareApp } from './server/serve.ts';
import type { App } from './server/app.ts';

export interface ServeOptions {
  port?: number;
  hostname?: string;
  onListen?: (address: { hostname: string; port: number }) => void;
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
  app: App,
  { hostname, onListen, port = 8000 }: ServeOptions = {},
) {
  await prepareApp(app);

  const handler = app.handler();
  const server = createServer(async (req, res) => {
    try {
      const request = await incomingMessageToRequest(req);
      const response = await handler(request, {});
      await writeResponseToServerResponse(response, res);
    } catch (error) {
      console.error(error);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  await listen(server, port, hostname);

  const address = server.address() as AddressInfo | null;
  onListen?.({
    hostname: hostname ?? 'localhost',
    port: address?.port ?? port,
  });

  return server;
}
