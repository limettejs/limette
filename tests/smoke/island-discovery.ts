import { dirname, join } from 'node:path';
import { createServer } from 'vite';
import { discoverRoutes } from '../../src/vite/manifest.ts';
import { discoverStyleImportsForFiles } from '../../src/vite/islands.ts';

const root = await Deno.makeTempDir({ prefix: 'limette-islands-' });

async function writeFile(path: string, content: string) {
  const file = join(root, path);
  await Deno.mkdir(dirname(file), { recursive: true });
  await Deno.writeTextFile(file, content);
}

try {
  await writeFile(
    'routes/_app.ts',
    `
      import { AppComponent } from '@limette/core';
      import type { IslandsDefinition } from '@limette/core';
      import { html } from 'lit';
      import { AppIsland } from '../islands/app.js';

      export default class App extends AppComponent {
        static islands: IslandsDefinition = {
          'app-island': AppIsland,
        };

        render() {
          return html\`\${this.page}\`;
        }
      }
    `,
  );

  await writeFile(
    'routes/_layout.ts',
    `
      import { LayoutComponent } from '@limette/core';
      import type { IslandsDefinition } from '@limette/core';
      import { html } from 'lit';
      import { LayoutIsland } from '../islands/layout.js';

      export default class RootLayout extends LayoutComponent {
        static islands = {
          'layout-island': {
            component: LayoutIsland,
          },
        } satisfies IslandsDefinition;

        render() {
          return html\`\${this.child}\`;
        }
      }
    `,
  );

  await writeFile(
    'routes/index.ts',
    `
      import { PageComponent } from '@limette/core';
      import { html } from 'lit';
      import {
        ServerCard,
      } from '@shared/server-card.js';
      import { shared } from '@shared/page-shared.js';
      import 'generated-output';

      // import './fake.css';
      const example = 'import "./also-fake.css"';

      export default class Home extends PageComponent {
        render() {
          return html\`<server-card data-shared=\${shared}></server-card>\`;
        }
      }
    `,
  );

  await writeFile(
    'shared/server-card.js',
    `
      import { ServerComponent } from '@limette/core';
      import { html } from 'lit';
      import { CardIsland } from './island-barrel.js';

      export class ServerCard extends ServerComponent {
        static islands = {
          'card-island': {
            component: CardIsland,
            ssr: true,
          },
        };

        render() {
          return html\`<card-island></card-island>\`;
        }
      }
    `,
  );

  await writeFile(
    'shared/island-barrel.js',
    `export { CardIsland } from '../islands/card.js';
     export * from './star-reexport.js';`,
  );
  await writeFile(
    'shared/star-reexport.js',
    `export * from './star-target.js';`,
  );
  await writeFile(
    'shared/star-target.js',
    `import StarIsland from '../islands/star.js';
     export class StarServerComponent {
       static islands = { 'star-island': StarIsland };
     }`,
  );
  await writeFile(
    'shared/page-shared.js',
    `import '../styles/page-shared.css';
     import './cycle-a.js';
     export const shared = 'shared';`,
  );
  await writeFile(
    'shared/cycle-a.js',
    `import './cycle-b.js';
     export const cycleA = true;`,
  );
  await writeFile(
    'shared/cycle-b.js',
    `import './cycle-a.js';
     export const cycleB = true;`,
  );

  await writeFile(
    'islands/app.js',
    'export class AppIsland extends HTMLElement {}',
  );
  await writeFile(
    'islands/layout.js',
    'export class LayoutIsland extends HTMLElement {}',
  );
  await writeFile(
    'islands/card.js',
    `import './card.css';
     import { NestedIsland } from './nested.js';
     export class CardIsland extends HTMLElement {
       static islands = { 'nested-island': NestedIsland };
     }`,
  );
  await writeFile(
    'islands/nested.js',
    'export class NestedIsland extends HTMLElement {}',
  );
  await writeFile(
    'islands/star.js',
    'export default class StarIsland extends HTMLElement {}',
  );
  await writeFile('islands/card.css', '.card {}');
  await writeFile('styles/page-shared.css', '.page-shared {}');
  await writeFile(
    'node_modules/.vite/deps/@limette_core.js',
    `export class CompiledFrameworkCode {
       static islands = createRuntimeIslandMap();
     }`,
  );
  await writeFile(
    'dist/generated.js',
    `import '../styles/generated.css';
     export const generated = true;`,
  );
  await writeFile('styles/generated.css', '.generated {}');

  const vite = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    resolve: {
      alias: {
        '@limette/core': join(
          root,
          'node_modules/.vite/deps/@limette_core.js',
        ),
        '@shared': join(root, 'shared'),
      },
    },
    server: { middlewareMode: true },
  });
  const resolve = (id: string, importer: string) =>
    vite.pluginContainer.resolveId(id, importer);
  const manifest = await discoverRoutes({
    root,
    resolve,
  });
  const reexportStyles = await discoverStyleImportsForFiles({
    root,
    files: ['shared/island-barrel.js'],
    resolve,
  });
  const generatedStyles = await discoverStyleImportsForFiles({
    root,
    files: ['routes/index.ts'],
    resolve: async (id, importer) => {
      if (id === 'generated-output') {
        return { id: join(root, 'dist/generated.js') };
      }
      return await resolve(id, importer);
    },
  });
  const unsupportedRoute = join(root, 'routes/unsupported.ts');
  await Deno.writeTextFile(
    unsupportedRoute,
    `export default class Unsupported {
       static islands = createIslands();
     }`,
  );
  let unsupportedError = '';
  try {
    await discoverRoutes({ root, resolve });
  } catch (error) {
    unsupportedError = error instanceof Error ? error.message : String(error);
  }
  await Deno.remove(unsupportedRoute);
  const dynamicSsrRoute = join(root, 'routes/dynamic-ssr.ts');
  await Deno.writeTextFile(
    dynamicSsrRoute,
    `import { AppIsland } from '../islands/app.js';
     const enabled = true;
     export default class Unsupported {
       static islands = {
         'dynamic-ssr-island': { component: AppIsland, ssr: enabled },
       };
     }`,
  );
  let dynamicSsrError = '';
  try {
    await discoverRoutes({ root, resolve });
  } catch (error) {
    dynamicSsrError = error instanceof Error ? error.message : String(error);
  }
  await Deno.remove(dynamicSsrRoute);
  await vite.close();

  if (!unsupportedError.includes('Unable to statically analyze')) {
    throw new Error('Dynamic static island maps did not fail clearly.');
  }
  if (
    !dynamicSsrError.includes('Unable to statically analyze "ssr"') ||
    !dynamicSsrError.includes('boolean literal')
  ) {
    throw new Error('Dynamic island SSR policy did not fail clearly.');
  }
  const homeRoute = manifest.routes.find((route) => route.path === '/');

  if (!homeRoute) {
    throw new Error('Expected fixture home route to be discovered.');
  }

  if (!homeRoute.layouts.includes('routes/_layout.ts')) {
    throw new Error('Expected root layout to be inherited by home route.');
  }

  const islandImports = homeRoute.islandImports.map((islandImport) =>
    islandImport.resolvedImport
  );

  for (
    const [tagName, exportName] of [
      ['app-island', 'AppIsland'],
      ['card-island', 'CardIsland'],
      ['star-island', 'default'],
    ] as const
  ) {
    const island = homeRoute.islandImports.find((entry) =>
      entry.tagName === tagName
    );
    if (island?.exportName !== exportName) {
      throw new Error(
        `Expected ${tagName} to use export ${exportName}; found ${island?.exportName}.`,
      );
    }
  }

  const policies = new Map(
    homeRoute.islandImports.map((island) => [island.tagName, island.ssr]),
  );
  if (
    policies.get('app-island') !== false ||
    policies.get('layout-island') !== false ||
    policies.get('card-island') !== true
  ) {
    throw new Error(`Unexpected discovered SSR policies: ${
      JSON.stringify([
        ...policies,
      ])
    }`);
  }

  for (
    const expectedImport of [
      '/islands/app.js',
      '/islands/layout.js',
      '/shared/island-barrel.js',
      '/islands/nested.js',
      '/islands/star.js',
    ]
  ) {
    if (!islandImports.includes(expectedImport)) {
      throw new Error(
        `Missing island import: ${expectedImport}. Found: ${islandImports}`,
      );
    }
  }

  if (!homeRoute.styleImports.includes('/styles/page-shared.css')) {
    throw new Error('Missing CSS reached through a Vite alias.');
  }
  if (!reexportStyles.includes('/islands/card.css')) {
    throw new Error('Missing CSS reached through a named re-export.');
  }
  if (generatedStyles.includes('/styles/generated.css')) {
    throw new Error('Discovery traversed generated build output.');
  }
  if (
    homeRoute.styleImports.some((style) =>
      style.includes('fake.css') || style.includes('card.css')
    )
  ) {
    throw new Error(
      'Discovery included a false-positive or island-owned stylesheet.',
    );
  }
} finally {
  await Deno.remove(root, { recursive: true });
}
