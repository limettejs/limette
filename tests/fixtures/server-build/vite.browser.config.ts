import { fileURLToPath } from 'node:url';
import { limette } from '../../../src/vite/plugin.ts';

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  plugins: [limette({ app: './app.ts' })],
};
