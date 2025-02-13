import type { BuildRoute } from "./build.ts";

/**
 *
 * Sorting Logic:
 *      Exact paths (e.g., /about, /blog) should come first.
 *      Paths with wildcards (e.g., /blog/:slug, /old/:path*) should come after exact paths.
 *      Paths with optional parameters (e.g., /docs{/:version}?) should be placed accordingly.
 *
 *
 * Wildcard Check:
 *      The function checks if the path contains wildcard characters (:, *, {).
 *      aIsWildcard and bIsWildcard determine if the paths are wildcards.
 *
 * Sorting Logic:
 *      Exact paths are placed before wildcard paths.
 *      If both paths are exact, they are sorted by length.
 *      Wildcard paths are further sorted by the number of wildcard characters they contain
 *      to ensure more specific routes come first.
 */
export const sortRoutesBySpecificity = (routes: BuildRoute[]): BuildRoute[] => {
  return routes.sort((a, b) => {
    // Exact paths should come before wildcard paths
    const aIsWildcard =
      a.path.includes(":") || a.path.includes("*") || a.path.includes("{");
    const bIsWildcard =
      b.path.includes(":") || b.path.includes("*") || b.path.includes("{");

    if (aIsWildcard && !bIsWildcard) return 1;
    if (!aIsWildcard && bIsWildcard) return -1;

    // If both are exact paths or both are wildcard paths, compare by length
    if (!aIsWildcard && !bIsWildcard) {
      return a.path.length - b.path.length;
    }

    // Compare by specificity within wildcards (e.g., :slug vs :path*)
    const aSpecificity = (a.path.match(/[:*]/g) || []).length;
    const bSpecificity = (b.path.match(/[:*]/g) || []).length;

    if (aSpecificity !== bSpecificity) {
      return aSpecificity - bSpecificity;
    }

    // If all else is equal, maintain the original order
    return 0;
  });
};
