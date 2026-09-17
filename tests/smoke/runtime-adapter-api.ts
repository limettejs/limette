import { App } from '../../src/mod.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const app = new App().get('/health', () => new Response('ok'));
const response = await app.handler()(new Request('http://localhost/health'));

assert(
  response.status === 200 && await response.text() === 'ok',
  'App.handler() did not remain independently executable.',
);

assert(
  !('listen' in app),
  'App still exposes the removed listen() compatibility API.',
);
