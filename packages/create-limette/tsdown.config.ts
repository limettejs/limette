import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));

export default {
  entry: {
    index: resolve(packageRoot, 'src/index.ts'),
  },
  clean: true,
  dts: false,
  format: 'esm',
  outDir: resolve(packageRoot, 'dist'),
  platform: 'node',
  sourcemap: false,
  target: 'node20.19',
};
