import { dirname, join } from 'node:path';
import { discoverRoutes } from '../../src/vite/mod.ts';

const root = await Deno.makeTempDir({ prefix: 'limette-islands-' });

async function writeFile(path: string, content: string) {
  const file = join(root, path);
  await Deno.mkdir(dirname(file), { recursive: true });
  await Deno.writeTextFile(file, content);
}

try {
  await writeFile(
    'routes/_app.js',
    `
      import { AppComponent } from '@limette/core';
      import { html } from 'lit';
      import { AppIsland } from '../islands/app.js';

      export default class App extends AppComponent {
        static islands = {
          'app-island': AppIsland,
        };

        render() {
          return html\`\${this.page}\`;
        }
      }
    `,
  );

  await writeFile(
    'routes/_layout.js',
    `
      import { LayoutComponent } from '@limette/core';
      import { html } from 'lit';
      import { LayoutIsland } from '../islands/layout.js';

      export default class RootLayout extends LayoutComponent {
        static islands = {
          'layout-island': LayoutIsland,
        };

        render() {
          return html\`\${this.child}\`;
        }
      }
    `,
  );

  await writeFile(
    'routes/index.js',
    `
      import { PageComponent } from '@limette/core';
      import { html } from 'lit';
      import { ServerCard } from './components/server-card.js';

      export default class Home extends PageComponent {
        render() {
          return html\`<server-card></server-card>\`;
        }
      }
    `,
  );

  await writeFile(
    'routes/components/server-card.js',
    `
      import { ServerComponent } from '@limette/core';
      import { html } from 'lit';
      import { CardIsland } from '../../islands/card.js';

      export class ServerCard extends ServerComponent {
        static islands = {
          'card-island': CardIsland,
        };

        render() {
          return html\`<card-island></card-island>\`;
        }
      }
    `,
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
    'export class CardIsland extends HTMLElement {}',
  );

  const manifest = await discoverRoutes({ root });
  const homeRoute = manifest.routes.find((route) => route.path === '/');

  if (!homeRoute) {
    throw new Error('Expected fixture home route to be discovered.');
  }

  if (!homeRoute.layouts.includes('routes/_layout.js')) {
    throw new Error('Expected root layout to be inherited by home route.');
  }

  const islandImports = homeRoute.islandImports.map((islandImport) =>
    islandImport.resolvedImport
  );

  for (
    const expectedImport of [
      '/islands/app.js',
      '/islands/layout.js',
      '/islands/card.js',
    ]
  ) {
    if (!islandImports.includes(expectedImport)) {
      throw new Error(`Missing island import: ${expectedImport}`);
    }
  }
} finally {
  await Deno.remove(root, { recursive: true });
}
