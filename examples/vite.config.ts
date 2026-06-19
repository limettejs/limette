import { fileURLToPath } from 'node:url';
import { clientEntryInputs, limette } from '@limette/core/vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default async () => ({
  root,
  appType: 'custom',
  build: {
    manifest: true,
    rolldownOptions: {
      input: await clientEntryInputs({ root }),
    },
  },
  plugins: [
    limette({ root, dev: { appModule: './app.js' } }),
  ],
});
