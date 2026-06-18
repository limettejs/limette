import type { IncomingMessage, ServerResponse } from 'node:http';

function requestOrigin(req: IncomingMessage) {
  const proto = req.socket instanceof Object && 'encrypted' in req.socket
    ? 'https'
    : 'http';
  const host = req.headers.host ?? 'localhost';

  return `${proto}://${host}`;
}

async function requestBody(req: IncomingMessage) {
  const chunks: Uint8Array[] = [];
  let length = 0;

  for await (const chunk of req) {
    const bytes = typeof chunk === 'string'
      ? new TextEncoder().encode(chunk)
      : chunk;
    chunks.push(bytes);
    length += bytes.byteLength;
  }

  const body = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body.buffer;
}

export async function incomingMessageToRequest(req: IncomingMessage) {
  const url = new URL(req.url ?? '/', requestOrigin(req));
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else {
      headers.set(name, value);
    }
  }

  const method = req.method ?? 'GET';
  const init: RequestInit = {
    method,
    headers,
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await requestBody(req);
  }

  return new Request(url, init);
}

export async function writeResponseToServerResponse(
  response: Response,
  res: ServerResponse,
) {
  res.statusCode = response.status;
  res.statusMessage = response.statusText;

  response.headers.forEach((value, name) => {
    res.setHeader(name, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  res.end(new Uint8Array(await response.arrayBuffer()));
}
