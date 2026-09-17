import { defineConfig } from 'vite';
import { limette } from '@limette/core/vite';

export default defineConfig({
  plugins: [
    limette({
      app: './app.js',
    }),
  ],
});
