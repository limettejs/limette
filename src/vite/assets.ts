import { readFile } from 'node:fs/promises';
import { clientEntryName, islandEntryName } from './client-entry.ts';
import { tailwindEntryName } from './tailwind.ts';
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
  islandStyles: Record<string, string[]>;
  tailwindStyle?: string;
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

function matchingEntry(
  viteManifest: ViteManifest,
  entryName: string,
  manifestPath: string,
  description: string,
) {
  const matchingEntries = Object.entries(viteManifest).filter(([, chunk]) =>
    chunk.isEntry && chunk.name === entryName
  );

  if (matchingEntries.length > 1) {
    throw new Error(
      `Vite manifest "${manifestPath}" contains multiple entries named "${entryName}" for ${description}.`,
    );
  }

  return matchingEntries[0];
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
  tailwind: boolean;
}

function resolveRouteClientAssets(
  options: ResolveRouteClientAssetsOptions,
): RouteClientAssets[] {
  const { routeManifest, viteManifest, base, manifestPath, tailwind } = options;
  const routesById = new Map(
    routeManifest.routes.map((route) => [route.id, route]),
  );
  const expectedRouteIds = new Set(
    routeManifest.routes
      .filter((route) =>
        route.islandImports.length > 0 || route.styleImports.length > 0
      )
      .map((route) => route.id),
  );
  const expectedIslandEntries = new Map<string, string>();
  for (const route of routeManifest.routes) {
    route.islandImports.forEach((island, index) => {
      expectedIslandEntries.set(
        islandEntryName(route.id, index),
        `island "${island.tagName}" on Limette route "${route.path}" (${route.id})`,
      );
    });
  }

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
        `Unexpected Limette client entry "${chunk.name}" for route without client assets "${route.path}" (${routeId}) in Vite manifest "${manifestPath}".`,
      );
    }
  }

  const expectedTailwindEntries = new Set(
    tailwind
      ? routeManifest.routes.map((route) => tailwindEntryName(route.id))
      : [],
  );
  for (const chunk of Object.values(viteManifest)) {
    if (!chunk.isEntry || !chunk.name?.startsWith('limette-tailwind-')) {
      continue;
    }
    if (!expectedTailwindEntries.has(chunk.name)) {
      throw new Error(
        `Unknown or stale Limette Tailwind entry "${chunk.name}" in Vite manifest "${manifestPath}".`,
      );
    }
  }

  for (const chunk of Object.values(viteManifest)) {
    if (!chunk.isEntry || !chunk.name?.startsWith('limette-island-')) continue;

    if (!expectedIslandEntries.has(chunk.name)) {
      throw new Error(
        `Unknown, stale, or malformed Limette island entry "${chunk.name}" in Vite manifest "${manifestPath}".`,
      );
    }
  }

  return routeManifest.routes.map((route): RouteClientAssets => {
    const expectedEntryName = clientEntryName(route.id);
    const [entryManifestKey, entryChunk] = matchingEntry(
      viteManifest,
      expectedEntryName,
      manifestPath,
      `Limette route "${route.path}" (${route.id})`,
    ) ?? [];

    const needsClientEntry = route.islandImports.length > 0 ||
      route.styleImports.length > 0;
    if (needsClientEntry && !entryChunk) {
      throw new Error(
        `Missing Vite client entry "${expectedEntryName}" for Limette route "${route.path}" (${route.id}) in manifest "${manifestPath}". ` +
          'Build the application with the Limette Vite plugin before resolving route assets.',
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

    const islandStyles: Record<string, string[]> = {};
    route.islandImports.forEach((island, islandIndex) => {
      const expectedIslandEntryName = islandEntryName(route.id, islandIndex);
      const [islandManifestKey, islandEntryChunk] = matchingEntry(
        viteManifest,
        expectedIslandEntryName,
        manifestPath,
        `island "${island.tagName}" on Limette route "${route.path}" (${route.id})`,
      ) ?? [];

      if (!islandEntryChunk) {
        throw new Error(
          `Missing Vite island entry "${expectedIslandEntryName}" for island "${island.tagName}" on Limette route "${route.path}" (${route.id}) in manifest "${manifestPath}". ` +
            'Build the application with the Limette Vite plugin before resolving route assets.',
        );
      }

      const islandCss = new Set<string>();
      collectImportedAssets({
        manifest: viteManifest,
        chunk: islandEntryChunk,
        scripts: new Set<string>(),
        styles: islandCss,
        seen: new Set(islandManifestKey ? [islandManifestKey] : []),
      });
      const existingStyles = islandStyles[island.tagName] ?? [];
      islandStyles[island.tagName] = Array.from(
        new Set([
          ...existingStyles,
          ...Array.from(islandCss).map((asset) => joinUrl(base, asset)),
        ]),
      );
    });

    const tailwindEntry = tailwind
      ? matchingEntry(
        viteManifest,
        tailwindEntryName(route.id),
        manifestPath,
        `Tailwind stylesheet for Limette route "${route.path}" (${route.id})`,
      )?.[1]
      : undefined;
    if (tailwind && !tailwindEntry) {
      throw new Error(
        `Missing Vite Tailwind entry "${
          tailwindEntryName(route.id)
        }" for Limette route "${route.path}" (${route.id}) in manifest "${manifestPath}".`,
      );
    }

    return {
      routeId: route.id,
      routePath: route.path,
      entry: route.islandImports.length > 0 && entryChunk?.file
        ? joinUrl(base, entryChunk.file)
        : undefined,
      scripts: Array.from(scripts).map((asset) => joinUrl(base, asset)),
      styles: Array.from(styles).map((asset) => joinUrl(base, asset)),
      islandStyles,
      tailwindStyle: tailwindEntry
        ? joinUrl(base, tailwindEntry.file)
        : undefined,
    };
  });
}

export interface ResolveServerEntryAssetsOptions {
  readonly manifest: ViteManifest;
  readonly routes: LimetteRouteManifest;
  readonly base?: string;
  readonly manifestPath: string;
  readonly tailwind?: boolean;
}

export function resolveServerEntryAssets(
  options: ResolveServerEntryAssetsOptions,
): ServerEntryAssets {
  const routeAssets = resolveRouteClientAssets({
    routeManifest: options.routes,
    viteManifest: options.manifest,
    base: options.base ?? '/',
    manifestPath: options.manifestPath,
    tailwind: options.tailwind ?? false,
  });

  return new Map(
    routeAssets.map((assets) => [
      assets.routeId,
      {
        scripts: assets.entry ? [assets.entry] : [],
        styles: assets.styles,
        islandStyles: assets.islandStyles,
        tailwindStyle: assets.tailwindStyle,
      },
    ]),
  );
}
