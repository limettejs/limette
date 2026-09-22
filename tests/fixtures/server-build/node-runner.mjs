import { fileURLToPath } from 'node:url';
import { serve } from 'limette/node';
import handler from './server/entry.js';

const port = Number(process.argv[2]);

if (!Number.isInteger(port)) {
  throw new Error('Expected a numeric port argument.');
}

await serve(handler, {
  hostname: '127.0.0.1',
  port,
  staticFiles: {
    root: fileURLToPath(new URL('./client/', import.meta.url)),
    base: '/my-app/',
  },
});
