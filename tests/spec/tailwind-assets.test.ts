import { describe, expect, it } from 'vitest';
import {
  resolveServerEntryAssets,
  type ViteManifest,
} from '../../packages/limette/src/vite/assets.ts';
import type { LimetteRouteManifest } from '../../packages/limette/src/vite/manifest.ts';

const routes: LimetteRouteManifest = {
  appFile: 'routes/_app.ts',
  routes: ['login', 'signup'].map((id) => ({
    id,
    path: `/${id}`,
    routeFile: `routes/${id}.ts`,
    layouts: [],
    middlewares: [],
    islandImports: [],
    sourceFiles: ['routes/_app.ts', `routes/${id}.ts`],
    styleImports: [],
  })),
};
const manifestPath = '/build/client/.vite/manifest.json';
const sharedEntry = {
  file: 'assets/shared.css',
  name: 'limette-tailwind-signup',
  src: 'tailwind.css?limette-tailwind-route=login',
  isEntry: true,
};

function resolve(manifest: ViteManifest, tailwind = true) {
  return resolveServerEntryAssets({ manifest, routes, manifestPath, tailwind, base: '/app/' });
}

describe('Tailwind manifest assets', () => {
  it('uses each manifest key when Vite deduplicates name, src, and file', () => {
    const assets = resolve({
      'tailwind.css?limette-tailwind-route=login': sharedEntry,
      'tailwind.css?limette-tailwind-route=signup': sharedEntry,
    });
    for (const id of ['login', 'signup']) {
      expect(assets.get(id)?.tailwindStyle).toBe('/app/assets/shared.css');
    }
  });

  it('falls back to source identity when the key has no route query', () => {
    const assets = resolve({
      login: sharedEntry,
      signup: { ...sharedEntry, src: 'tailwind.css?limette-tailwind-route=signup' },
    });
    expect(assets.get('login')?.tailwindStyle).toBe('/app/assets/shared.css');
    expect(assets.get('signup')?.tailwindStyle).toBe('/app/assets/shared.css');
  });

  it('supports manifests containing only entry names', () => {
    const assets = resolve({
      login: { file: 'assets/login.css', name: 'limette-tailwind-login', isEntry: true },
      signup: { file: 'assets/signup.css', name: 'limette-tailwind-signup', isEntry: true },
    });
    expect(assets.get('login')?.tailwindStyle).toBe('/app/assets/login.css');
    expect(assets.get('signup')?.tailwindStyle).toBe('/app/assets/signup.css');
  });

  it('rejects stale source identities even when the output name is valid', () => {
    expect(() => resolve({ 'tailwind.css?limette-tailwind-route=stale': sharedEntry })).toThrow(
      'Unknown or stale Limette Tailwind entry "limette-tailwind-stale"'
    );
    expect(() => resolve({ stale: { ...sharedEntry, name: 'limette-tailwind-stale' } })).toThrow(
      'Unknown or stale Limette Tailwind entry "limette-tailwind-stale"'
    );
    expect(() =>
      resolve({ 'tailwind.css?limette-tailwind-route=login': sharedEntry }, false)
    ).toThrow('Unknown or stale Limette Tailwind entry');
  });

  it('rejects multiple entries for the same route identity', () => {
    expect(() =>
      resolve({
        'tailwind.css?limette-tailwind-route=login': sharedEntry,
        'other.css?limette-tailwind-route=login': { ...sharedEntry, file: 'assets/other.css' },
      })
    ).toThrow('multiple entries named "limette-tailwind-login"');
  });

  it('rejects missing or non-entry Tailwind assets', () => {
    expect(() => resolve({})).toThrow('Missing Vite Tailwind entry "limette-tailwind-login"');
    expect(() =>
      resolve({
        'tailwind.css?limette-tailwind-route=login': { ...sharedEntry, isEntry: false },
      })
    ).toThrow('Missing Vite Tailwind entry "limette-tailwind-login"');
  });
});
