import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import {
  discoverIslandImportsForFiles,
  discoverStyleImportsForFiles,
} from './islands.ts';
import type { IslandImport } from './islands.ts';

const ROUTE_EXT_PATTERN = /\.(?:ts|js)$/;
const TEST_FILE_PATTERN = /[._]test\.(?:[tj]sx?|[mc][tj]s)$/;

export type LimetteRouteManifestEntry = {
  id: string;
  path: string;
  routeFile: string;
  layouts: string[];
  middlewares: string[];
  islandImports: IslandImport[];
  styleImports: string[];
};

export type LimetteRouteManifest = {
  appFile: string;
  routes: LimetteRouteManifestEntry[];
};

export type DiscoverRoutesOptions = {
  root?: string;
  routesDir?: string;
};

function normalizePath(path: string) {
  return path.split(sep).join('/');
}

function routeId(path: string) {
  return createHash('sha1').update(path).digest('hex').slice(0, 6);
}

function convertFilenameToPattern(filename: string) {
  let outputString = filename.replace(
    /\[([^\]]+\])\]/g,
    (_match, dynamicPart: string) => {
      if (dynamicPart.startsWith('[') && dynamicPart.endsWith(']')) {
        return `{/:${dynamicPart.slice(1, -1)}}?`;
      }

      return _match;
    },
  );

  outputString = outputString.replace(
    /\[([^\[\]]+)\]/g,
    (_match, dynamicPart: string) => {
      if (dynamicPart.startsWith('...')) {
        return `:${dynamicPart.slice(3)}*`;
      }

      return `:${dynamicPart}`;
    },
  );

  outputString = outputString.replaceAll('/{/', '{/');

  return outputString.startsWith('/') ? outputString : `/${outputString}`;
}

async function exists(path: string) {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

async function walkFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function routePathForFile(file: string, routesPath: string) {
  const relativeFile = normalizePath(relative(routesPath, file));
  const withoutExt = relativeFile.replace(ROUTE_EXT_PATTERN, '');
  const withoutIndex = withoutExt.endsWith('/index')
    ? withoutExt.slice(0, -6)
    : withoutExt;
  const routePath = withoutIndex === 'index' || withoutIndex === ''
    ? '/'
    : `/${withoutIndex}`;

  return convertFilenameToPattern(routePath);
}

function directoriesForRouteFile(file: string, routesPath: string) {
  const relativeFile = normalizePath(relative(routesPath, file));
  const segments = relativeFile.split('/').slice(0, -1);
  const directories: string[] = [''];
  let current = '';

  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    directories.push(current);
  }

  return directories;
}

function findInheritedFiles(
  routeFile: string,
  routesPath: string,
  filesByDirectory: Map<string, string>,
) {
  return directoriesForRouteFile(routeFile, routesPath)
    .map((directory) => filesByDirectory.get(directory))
    .filter((file): file is string => Boolean(file));
}

function routeSpecificity(path: string) {
  const isDynamic = path.includes(':') || path.includes('*') ||
    path.includes('{');
  const wildcardCount = (path.match(/[:*]/g) ?? []).length;

  return { isDynamic, wildcardCount };
}

function compareRoutesBySpecificity(
  a: LimetteRouteManifestEntry,
  b: LimetteRouteManifestEntry,
) {
  const aSpecificity = routeSpecificity(a.path);
  const bSpecificity = routeSpecificity(b.path);

  if (aSpecificity.isDynamic !== bSpecificity.isDynamic) {
    return aSpecificity.isDynamic ? 1 : -1;
  }

  if (!aSpecificity.isDynamic && !bSpecificity.isDynamic) {
    return a.path.length - b.path.length || a.path.localeCompare(b.path);
  }

  return aSpecificity.wildcardCount - bSpecificity.wildcardCount ||
    a.path.localeCompare(b.path);
}

export async function discoverRoutes(
  options: DiscoverRoutesOptions = {},
): Promise<LimetteRouteManifest> {
  const root = options.root ?? process.cwd();
  const routesPath = join(root, options.routesDir ?? 'routes');
  const appTs = join(routesPath, '_app.ts');
  const appJs = join(routesPath, '_app.js');
  const hasAppTs = await exists(appTs);
  const hasAppJs = await exists(appJs);

  if (hasAppTs && hasAppJs) {
    throw new Error(
      'You have two app templates defined: _app.ts and _app.js. Use only one.',
    );
  }

  if (!hasAppTs && !hasAppJs) {
    throw new Error("You don't an app template defined: _app.ts or _app.js.");
  }

  const files = (await walkFiles(routesPath))
    .filter((file) => ROUTE_EXT_PATTERN.test(file))
    .filter((file) => !TEST_FILE_PATTERN.test(file));
  const layoutFiles = new Map<string, string>();
  const middlewareFiles = new Map<string, string>();

  for (const file of files) {
    const relativeFile = normalizePath(relative(routesPath, file));
    const directory = relativeFile.split('/').slice(0, -1).join('/');

    if (relativeFile.endsWith('/_layout.ts') || relativeFile === '_layout.ts') {
      layoutFiles.set(directory, file);
    }

    if (relativeFile.endsWith('/_layout.js') || relativeFile === '_layout.js') {
      layoutFiles.set(directory, file);
    }

    if (
      relativeFile.endsWith('/_middleware.ts') ||
      relativeFile === '_middleware.ts'
    ) {
      middlewareFiles.set(directory, file);
    }

    if (
      relativeFile.endsWith('/_middleware.js') ||
      relativeFile === '_middleware.js'
    ) {
      middlewareFiles.set(directory, file);
    }
  }

  const routes: LimetteRouteManifestEntry[] = files
    .filter((file) => {
      const relativeFile = normalizePath(relative(routesPath, file));
      return !relativeFile.endsWith('_app.ts') &&
        !relativeFile.endsWith('_app.js') &&
        !relativeFile.endsWith('_layout.ts') &&
        !relativeFile.endsWith('_layout.js') &&
        !relativeFile.endsWith('_middleware.ts') &&
        !relativeFile.endsWith('_middleware.js');
    })
    .map((file): LimetteRouteManifestEntry => {
      const path = routePathForFile(file, routesPath);
      const layouts = findInheritedFiles(file, routesPath, layoutFiles).map((
        file,
      ) => normalizePath(relative(root, file)));

      return {
        id: routeId(path),
        path,
        routeFile: normalizePath(relative(root, file)),
        layouts,
        middlewares: findInheritedFiles(file, routesPath, middlewareFiles).map((
          file,
        ) => normalizePath(relative(root, file))),
        islandImports: [],
        styleImports: [],
      };
    })
    .sort(compareRoutesBySpecificity);

  const duplicate = routes.find((route, index) =>
    routes.findIndex((candidate) => candidate.path === route.path) !== index
  );
  if (duplicate) {
    throw new Error(`Route conflict for "${duplicate.path}".`);
  }

  const appFile = normalizePath(relative(root, hasAppTs ? appTs : appJs));

  for (const route of routes) {
    const sourceFiles = [appFile, ...route.layouts, route.routeFile];
    route.islandImports = await discoverIslandImportsForFiles({
      root,
      files: sourceFiles,
    });
    route.styleImports = await discoverStyleImportsForFiles({
      root,
      files: sourceFiles,
      excludeFiles: route.islandImports
        .map((islandImport) => islandImport.resolvedImport)
        .filter((path) => path.startsWith('/'))
        .map((path) => path.slice(1).split(/[?#]/, 1)[0]),
    });
  }

  return {
    appFile,
    routes,
  };
}
