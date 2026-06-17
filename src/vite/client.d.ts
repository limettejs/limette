declare module 'virtual:limette/routes' {
  import type { LimetteRouteManifest } from '@limette/core/vite';

  export const appFile: LimetteRouteManifest['appFile'];
  export const routes: LimetteRouteManifest['routes'];
  export const manifest: LimetteRouteManifest;
  export default manifest;
}

declare module 'virtual:limette/client-entry/*' {
  import type { IslandImport } from '@limette/core/vite';

  export const routeId: string;
  export const routePath: string;
  export const islandImports: IslandImport[];
}
