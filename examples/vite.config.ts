import { clientEntryInputs, limette } from '../src/vite/mod.ts';

export default async () => ({
  appType: 'custom',
  build: {
    manifest: true,
    rolldownOptions: {
      input: await clientEntryInputs(),
    },
  },
  plugins: [
    limette({ dev: { appModule: './main.ts' } }),
  ],
});
