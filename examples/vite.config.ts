import { limette } from '../src/vite/mod.ts';

export default {
  appType: 'custom',
  build: {
    rolldownOptions: {
      external: [/^lit(?:\/.*)?$/, /^@lit-labs\/ssr-client(?:\/.*)?$/],
    },
  },
  plugins: [limette()],
};
