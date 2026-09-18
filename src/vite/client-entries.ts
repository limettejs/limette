import { discoverRoutes } from './manifest.ts';
import {
  clientEntryName,
  islandEntryModuleId,
  islandEntryName,
} from './client-entry.ts';
import type { DiscoverRoutesOptions } from './manifest.ts';

export type ClientEntryInputsOptions = DiscoverRoutesOptions & {
  includeEmptyRoutes?: boolean;
};

export async function clientEntryInputs(
  options: ClientEntryInputsOptions = {},
) {
  const manifest = await discoverRoutes(options);
  const inputs: Record<string, string> = {};

  for (const route of manifest.routes) {
    const needsClientEntry = route.islandImports.length > 0 ||
      route.styleImports.length > 0;
    if (!options.includeEmptyRoutes && !needsClientEntry) {
      continue;
    }

    inputs[clientEntryName(route.id)] =
      `virtual:limette/client-entry/${route.id}`;

    route.islandImports.forEach((_island, islandIndex) => {
      inputs[islandEntryName(route.id, islandIndex)] = islandEntryModuleId(
        route.id,
        islandIndex,
      );
    });
  }

  return inputs;
}
