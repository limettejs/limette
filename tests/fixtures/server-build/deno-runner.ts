import { serve } from '@limette/core/deno';
// @ts-ignore Generated into the isolated deployment before this runner starts.
import handler from './server/entry.js';

const port = Number(Deno.args[0]);

if (!Number.isInteger(port)) {
  throw new Error('Expected a numeric port argument.');
}

await serve(handler, {
  hostname: '127.0.0.1',
  port,
  staticFiles: {
    root: await Deno.realPath(new URL('./client/', import.meta.url)),
    base: '/my-app/',
  },
});
