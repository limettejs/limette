import { clientEntryInputs, limette } from '../src/vite/mod.ts';

export default async () => ({
  appType: 'custom',
  build: {
    manifest: true,
    rolldownOptions: {
      external: [/^lit(?:\/.*)?$/, /^@lit-labs\/ssr-client(?:\/.*)?$/],
      input: await clientEntryInputs(),
    },
  },
  plugins: [limette()],
});
