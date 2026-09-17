import { readFile } from 'node:fs/promises';
import { clientEntryName } from './client-entry.ts';
import type { LimetteRouteManifest } from './manifest.ts';
import type { ServerEntryAssets } from './server-entry.ts';

export type ViteManifestChunk = {
  file: string;
  css?: string[];
  imports?: string[];
  isEntry?: boolean;
  name?: string;
  src?: string;
};

export type ViteManifest = Record<string, ViteManifestChunk>;

type RouteClientAssets = {
  routeId: string;
  routePath: string;
  entry: string | undefined;
  scripts: string[];
  styles: string[];
};

export type ReadViteManifestOptions = {
  manifestPath: string;
};

function joinUrl(base: string, path: string) {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${path.replace(/^\/+/, '')}`;
}

function collectImportedAssets({
  manifest,
  chunk,
  scripts,
  styles,
  seen,
}: {
  manifest: ViteManifest;
  chunk: ViteManifestChunk;
  scripts: Set<string>;
  styles: Set<string>;
  seen: Set<string>;
}) {
  for (const css of chunk.css ?? []) {
    styles.add(css);
  }

  for (const importKey of chunk.imports ?? []) {
    if (seen.has(importKey)) continue;
    seen.add(importKey);

    const importedChunk = manifest[importKey];
    if (!importedChunk) continue;

    scripts.add(importedChunk.file);
    collectImportedAssets({
      manifest,
      chunk: importedChunk,
      scripts,
      styles,
      seen,
    });
  }
}

export async function readViteManifest(
  options: ReadViteManifestOptions,
) {
  const content = await readFile(options.manifestPath, 'utf8');

  return JSON.parse(content) as ViteManifest;
}

interface ResolveRouteClientAssetsOptions {
  routeManifest: LimetteRouteManifest;
  viteManifest: ViteManifest;
  base: string;
  manifestPath: string;
}

function resolveRouteClientAssets(
  options: ResolveRouteClientAssetsOptions,
): RouteClientAssets[] {
  const { routeManifest, viteManifest, base, manifestPath } = options;
  const routesById = new Map(
    routeManifest.routes.map((route) => [route.id, route]),
  );
  const expectedRouteIds = new Set(
    routeManifest.routes
      .filter((route) => route.islandImports.length > 0)
      .map((route) => route.id),
  );

  for (const chunk of Object.values(viteManifest)) {
    if (!chunk.isEntry || !chunk.name?.startsWith('limette-route-')) continue;

    const routeId = chunk.name.slice('limette-route-'.length);
    if (!routeId || !/^[a-zA-Z0-9_-]+$/.test(routeId)) {
      throw new Error(
        `Malformed Limette client entry identity "${chunk.name}" in Vite manifest "${manifestPath}".`,
      );
    }

    const route = routesById.get(routeId);
    if (!route) {
      throw new Error(
        `Unknown or stale Limette client entry "${chunk.name}" for route ID "${routeId}" in Vite manifest "${manifestPath}".`,
      );
    }

    if (!expectedRouteIds.has(routeId)) {
      throw new Error(
        `Unexpected Limette client entry "${chunk.name}" for non-island route "${route.path}" (${routeId}) in Vite manifest "${manifestPath}".`,
      );
    }
  }

  return routeManifest.routes.map((route): RouteClientAssets => {
    const expectedEntryName = clientEntryName(route.id);
    const matchingEntries = Object.entries(viteManifest).filter(([, chunk]) =>
      chunk.isEntry && chunk.name === expectedEntryName
    );

    if (matchingEntries.length > 1) {
      throw new Error(
        `Vite manifest "${manifestPath}" contains multiple entries named "${expectedEntryName}" for Limette route "${route.path}" (${route.id}).`,
      );
    }

    const [entryManifestKey, entryChunk] = matchingEntries[0] ?? [];

    if (route.islandImports.length > 0 && !entryChunk) {
      throw new Error(
        `Missing Vite client entry "${expectedEntryName}" for Limette route "${route.path}" (${route.id}) in manifest "${manifestPath}". ` +
          'Build with clientEntryInputs() and resolve assets from the resulting Vite manifest.',
      );
    }

    const scripts = new Set<string>();
    const styles = new Set<string>();

    if (entryChunk) {
      scripts.add(entryChunk.file);
      collectImportedAssets({
        manifest: viteManifest,
        chunk: entryChunk,
        scripts,
        styles,
        seen: new Set(entryManifestKey ? [entryManifestKey] : []),
      });
    }

    return {
      routeId: route.id,
      routePath: route.path,
      entry: entryChunk?.file ? joinUrl(base, entryChunk.file) : undefined,
      scripts: Array.from(scripts).map((asset) => joinUrl(base, asset)),
      styles: Array.from(styles).map((asset) => joinUrl(base, asset)),
    };
  });
}

export interface ResolveServerEntryAssetsOptions {
  readonly manifest: ViteManifest;
  readonly routes: LimetteRouteManifest;
  readonly base?: string;
  readonly manifestPath: string;
}

export function resolveServerEntryAssets(
  options: ResolveServerEntryAssetsOptions,
): ServerEntryAssets {
  const routeAssets = resolveRouteClientAssets({
    routeManifest: options.routes,
    viteManifest: options.manifest,
    base: options.base ?? '/',
    manifestPath: options.manifestPath,
  });

  return new Map(
    routeAssets.map((assets) => [
      assets.routeId,
      {
        scripts: assets.entry ? [assets.entry] : [],
        styles: assets.styles,
      },
    ]),
  );
}
