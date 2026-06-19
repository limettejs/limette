import { clientEntryInputs, limette } from '@limette/core/vite';

export default async () => ({
  appType: 'custom',
  build: {
    manifest: true,
    rolldownOptions: {
      input: await clientEntryInputs(),
    },
  },
  plugins: [
    limette({ dev: { appModule: './main.js' } }),
  ],
});
