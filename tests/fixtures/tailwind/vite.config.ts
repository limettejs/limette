import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { limette } from '../../../packages/limette/src/vite/plugin.ts';

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    tailwindcss(),
    limette({
      app: './app.ts',
      tailwind: './tailwind.css',
    }),
  ],
};
