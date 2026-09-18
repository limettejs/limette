import handler from './dist/server/entry.js';

export default {
  async fetch(request, env, ctx) {
    const response = await handler(request, { env, ctx });
    const headers = new Headers(response.headers);
    headers.set('x-limette-worker', '1');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
