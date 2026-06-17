import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { discoverRoutes } from './manifest.ts';
import type { DiscoverRoutesOptions } from './manifest.ts';

export type ViteManifestChunk = {
  file: string;
  css?: string[];
  imports?: string[];
  isEntry?: boolean;
  name?: string;
  src?: string;
};

export type ViteManifest = Record<string, ViteManifestChunk>;

export type RouteClientAssets = {
  routeId: string;
  routePath: string;
  entry: string | undefined;
  scripts: string[];
  styles: string[];
};

export type ResolveClientAssetsOptions = DiscoverRoutesOptions & {
  outDir?: string;
  base?: string;
  manifestPath?: string;
};

function joinUrl(base: string, path: string) {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${path}`.replace(/([^:])\/+/g, '$1/');
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
  options: ResolveClientAssetsOptions = {},
) {
  const root = options.root ?? process.cwd();
  const manifestPath = options.manifestPath ??
    join(root, options.outDir ?? 'dist', '.vite/manifest.json');
  const content = await readFile(manifestPath, 'utf8');

  return JSON.parse(content) as ViteManifest;
}

export async function resolveClientAssets(
  options: ResolveClientAssetsOptions = {},
) {
  const base = options.base ?? '/';
  const [routeManifest, viteManifest] = await Promise.all([
    discoverRoutes(options),
    readViteManifest(options),
  ]);

  return routeManifest.routes.map((route): RouteClientAssets => {
    const manifestKey = `virtual:limette/client-entry/${route.id}`;
    const entryChunk = viteManifest[manifestKey];
    const scripts = new Set<string>();
    const styles = new Set<string>();

    if (entryChunk) {
      scripts.add(entryChunk.file);
      collectImportedAssets({
        manifest: viteManifest,
        chunk: entryChunk,
        scripts,
        styles,
        seen: new Set([manifestKey]),
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
