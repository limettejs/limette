import { limette } from '../../../src/vite/plugin.ts';
import { fileURLToPath } from 'node:url';

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/my-app/',
  plugins: [limette({ app: './app.ts' })],
};
