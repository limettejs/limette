import { discoverRoutes } from './manifest.ts';
import { clientEntryName } from './client-entry.ts';
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
    if (!options.includeEmptyRoutes && route.islandImports.length === 0) {
      continue;
    }

    inputs[clientEntryName(route.id)] =
      `virtual:limette/client-entry/${route.id}`;
  }

  return inputs;
}
