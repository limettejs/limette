import { fileURLToPath } from 'node:url';
import type { EnvironmentOptions, ViteBuilder } from 'vite';
import { limette } from '../../../src/vite/plugin.ts';

const serverRuntimeModule = 'limette/internal/server-runtime';
const serverRuntimeSource = fileURLToPath(
  new URL('../../../src/server-runtime.ts', import.meta.url),
);

function workerServerEnvironment(
  name: string,
  config: EnvironmentOptions,
) {
  if (name !== 'server') return;

  config.keepProcessEnv = false;
  config.resolve ??= {};
  config.resolve.mainFields = ['browser', 'module', 'jsnext:main', 'jsnext'];
  config.resolve.conditions = ['worker', 'browser', 'module', 'production'];
  config.resolve.builtins = [];
  config.resolve.external = [];
  config.resolve.noExternal = true;
  const resolveConfig = config.resolve as typeof config.resolve & {
    alias?:
      | Record<string, string>
      | Array<{ find: string; replacement: string }>;
  };
  resolveConfig.alias = Array.isArray(resolveConfig.alias)
    ? [
      {
        find: serverRuntimeModule,
        replacement: serverRuntimeSource,
      },
      ...resolveConfig.alias,
    ]
    : {
      ...resolveConfig.alias,
      [serverRuntimeModule]: serverRuntimeSource,
    };
  config.build ??= {};
  config.build.target = 'esnext';
}

async function buildWorkerApp(builder: ViteBuilder) {
  await builder.build(builder.environments.client);
  await builder.build(builder.environments.server);
}

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  resolve: {
    alias: [
      {
        find: /^@limette\/core$/,
        replacement: fileURLToPath(
          new URL('../../../src/mod.ts', import.meta.url),
        ),
      },
    ],
  },
  ssr: {
    target: 'webworker',
    noExternal: true,
  },
  builder: {
    buildApp: buildWorkerApp,
  },
  plugins: [
    limette({ app: './app.ts' }),
    {
      name: 'limette-worker-build-test',
      enforce: 'pre',
      configEnvironment: workerServerEnvironment,
      resolveId(id: string) {
        if (
          id === serverRuntimeModule ||
          id === fileURLToPath(
              new URL(
                '../../../dist/internal/server-runtime.mjs',
                import.meta.url,
              ),
            )
        ) {
          return serverRuntimeSource;
        }
      },
    },
  ],
};
