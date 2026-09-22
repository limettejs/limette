import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import type { LimetteRouteManifestEntry } from './manifest.ts';

export const TAILWIND_ENTRY_MODULE_PREFIX = 'virtual:limette/tailwind/';
const TAILWIND_ROUTE_QUERY = 'limette-tailwind-route';

function normalizePath(path: string) {
  return path.split(sep).join('/');
}

function relativeImport(from: string, to: string) {
  const path = normalizePath(relative(from, to));
  return path.startsWith('.') ? path : `./${path}`;
}

export function tailwindEntryName(routeId: string) {
  return `limette-tailwind-${routeId}`;
}

export function tailwindEntryModuleId(routeId: string) {
  return `${TAILWIND_ENTRY_MODULE_PREFIX}${routeId}.css`;
}

export function tailwindEntryDevPath(routeId: string, version?: string) {
  const params = new URLSearchParams({ direct: '' });
  if (version) params.set('v', version);
  return `/@id/${tailwindEntryModuleId(routeId)}?${params}`;
}

export async function tailwindSourceVersion({
  root,
  route,
  tailwindFile,
}: {
  root: string;
  route: LimetteRouteManifestEntry;
  tailwindFile: string;
}) {
  const hash = createHash('sha1');
  for (const sourceFile of [tailwindFile, ...route.sourceFiles]) {
    hash.update(sourceFile);
    hash.update(await readFile(resolve(root, sourceFile)));
  }
  return hash.digest('hex').slice(0, 10);
}

export function tailwindRouteIdFromModuleId(id: string) {
  if (!id.startsWith(TAILWIND_ENTRY_MODULE_PREFIX)) return undefined;
  const identity = id.slice(TAILWIND_ENTRY_MODULE_PREFIX.length)
    .split(/[?#]/, 1)[0];
  return identity.endsWith('.css') ? identity.slice(0, -4) : undefined;
}

export function resolveTailwindEntryId({
  root,
  tailwind,
  routeId,
  query,
}: {
  root: string;
  tailwind: string;
  routeId: string;
  query?: string;
}) {
  const params = new URLSearchParams(query);
  params.set(TAILWIND_ROUTE_QUERY, routeId);
  return `${resolve(root, tailwind)}?${params}`;
}

export function tailwindRouteIdFromResolvedId(
  id: string,
  tailwindFile: string,
) {
  const queryIndex = id.indexOf('?');
  if (queryIndex === -1 || id.slice(0, queryIndex) !== tailwindFile) {
    return undefined;
  }
  return new URLSearchParams(id.slice(queryIndex + 1)).get(
    TAILWIND_ROUTE_QUERY,
  ) ?? undefined;
}

export function generateTailwindEntry({
  root,
  tailwindFile,
  route,
}: {
  root: string;
  tailwindFile: string;
  route: LimetteRouteManifestEntry;
}) {
  const base = dirname(tailwindFile);
  const lines = [
    `@import ${JSON.stringify(`./${basename(tailwindFile)}`)} source(none);`,
  ];
  for (const sourceFile of route.sourceFiles) {
    lines.push(
      `@source ${
        JSON.stringify(relativeImport(base, resolve(root, sourceFile)))
      };`,
    );
  }
  return `${lines.join('\n')}\n`;
}
