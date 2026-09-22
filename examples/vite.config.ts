import { defineConfig } from 'vite';
import { limette } from 'limette/vite';

export default defineConfig({
  plugins: [
    limette({
      app: './app.js',
    }),
  ],
});
