import { resolve } from 'node:path';
import type { LimetteRouteManifest } from './manifest.ts';
import { routeTagName } from './routes.ts';

export const SERVER_ENTRY_MODULE_ID = 'virtual:limette/server-entry';
export const RESOLVED_SERVER_ENTRY_MODULE_ID = `\0${SERVER_ENTRY_MODULE_ID}`;
export const SERVER_RUNTIME_MODULE_ID = 'limette/internal/server-runtime';

export interface ServerEntryRouteAssets {
  readonly scripts: readonly string[];
  readonly styles: readonly string[];
  readonly islandStyles: Readonly<Record<string, readonly string[]>>;
  readonly tailwindStyle?: string;
}

export type ServerEntryAssets = ReadonlyMap<string, ServerEntryRouteAssets>;

export interface GenerateServerEntryOptions {
  readonly root: string;
  readonly appModule: string;
  readonly manifest: LimetteRouteManifest;
  readonly assets: ServerEntryAssets;
  readonly runtimeModule?: string;
}

function jsLiteral(value: unknown) {
  return JSON.stringify(value).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}

function relativeRouteFile(path: string) {
  return path.startsWith('.') ? path : `./${path}`;
}

export function generateServerEntry(options: GenerateServerEntryOptions): string {
  const { root, appModule, manifest, assets } = options;
  const knownRouteIds = new Set(manifest.routes.map((route) => route.id));

  for (const routeId of assets.keys()) {
    if (!knownRouteIds.has(routeId)) {
      throw new Error(`Server entry assets contain unknown Limette route ID "${routeId}".`);
    }
  }

  const modules = new Map<string, string>();
  const addModule = (path: string) => {
    let localName = modules.get(path);
    if (!localName) {
      localName = `routeModule${modules.size}`;
      modules.set(path, localName);
    }
    return localName;
  };

  for (const route of manifest.routes) {
    addModule(route.routeFile);
    for (const layout of route.layouts) addModule(layout);
    for (const middleware of route.middlewares) addModule(middleware);
  }

  const routeDefinitions = manifest.routes.map((route) => {
    const routeAssets = assets.get(route.id);
    if (route.islandImports.length > 0 && (!routeAssets || routeAssets.scripts.length === 0)) {
      throw new Error(
        `Missing server entry client assets for island-bearing Limette route "${route.path}" (${route.id}).`
      );
    }

    return [
      '  {',
      `    id: ${jsLiteral(route.id)},`,
      `    path: ${jsLiteral(route.path)},`,
      `    file: ${jsLiteral(relativeRouteFile(route.routeFile))},`,
      `    tagName: ${jsLiteral(routeTagName(route.path, route.id))},`,
      `    routeModule: ${modules.get(route.routeFile)},`,
      `    layouts: [${route.layouts.map((path) => modules.get(path)).join(', ')}],`,
      `    middlewares: [${route.middlewares.map((path) => modules.get(path)).join(', ')}],`,
      `    islands: ${jsLiteral(route.islandImports.map((island) => island.tagName))},`,
      `    ssrIslands: ${jsLiteral(
        route.islandImports.filter((island) => island.ssr).map((island) => island.tagName)
      )},`,
      '    assets: {',
      `      scripts: ${jsLiteral(routeAssets?.scripts ?? [])},`,
      `      styles: ${jsLiteral(routeAssets?.styles ?? [])},`,
      `      islandStyles: ${jsLiteral(routeAssets?.islandStyles ?? {})},`,
      `      tailwindStyle: ${
        routeAssets?.tailwindStyle === undefined
          ? 'undefined'
          : jsLiteral(routeAssets.tailwindStyle)
      },`,
      '    },',
      '  },',
    ].join('\n');
  });

  const moduleImports = Array.from(
    modules,
    ([path, localName]) => `import * as ${localName} from ${jsLiteral(resolve(root, path))};`
  );

  return [
    `import { app } from ${jsLiteral(appModule)};`,
    `import AppWrapper from ${jsLiteral(resolve(root, manifest.appFile))};`,
    ...moduleImports,
    `import { registerRouteDefinitions } from ${jsLiteral(
      options.runtimeModule ?? SERVER_RUNTIME_MODULE_ID
    )};`,
    '',
    'const routes = [',
    ...routeDefinitions,
    '];',
    '',
    'if (app._hasFsRoutes()) {',
    '  registerRouteDefinitions(app, { appWrapper: AppWrapper, routes });',
    '}',
    '',
    'const handler = app.handler();',
    '',
    'export { app, handler };',
    'export default handler;',
    '',
  ].join('\n');
}
