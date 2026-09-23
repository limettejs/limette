import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import {
  discoverIslandImportsForFiles,
  discoverSourceFilesForFiles,
  discoverStyleImportsForFiles,
} from './islands.ts';
import type { IslandImport } from './islands.ts';
import type { ResolveModule } from './islands.ts';

const ROUTE_EXT_PATTERN = /\.(?:ts|js)$/;
const TEST_FILE_PATTERN = /[._]test\.(?:[tj]sx?|[mc][tj]s)$/;
const DECLARATION_FILE_PATTERN = /\.d\.ts$/;
const DYNAMIC_IDENTIFIER_PATTERN =
  /^[$_\p{ID_Start}][$\u200C\u200D_\p{ID_Continue}]*$/u;

type RouteSegment =
  | { kind: 'static'; value: string }
  | { kind: 'required'; name: string }
  | { kind: 'optional'; name: string }
  | { kind: 'catch-all'; name: string };

type RouteFile = {
  relativeFile: string;
  path: string;
  segments: RouteSegment[];
  matcherSignature: string;
};

type SpecialFileKind = 'app' | 'layout' | 'middleware';

export type LimetteRouteManifestEntry = {
  id: string;
  path: string;
  routeFile: string;
  layouts: string[];
  middlewares: string[];
  islandImports: IslandImport[];
  sourceFiles: string[];
  styleImports: string[];
};

export type LimetteRouteManifest = {
  appFile: string;
  routes: LimetteRouteManifestEntry[];
};

export type DiscoverRoutesOptions = {
  root?: string;
  routesDir?: string;
  resolve?: ResolveModule;
};

function normalizePath(path: string) {
  return path.split(sep).join('/');
}

function routeId(path: string) {
  return createHash('sha1').update(path).digest('hex').slice(0, 12);
}

function compareCodePoints(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function dynamicName(
  segment: string,
  match: RegExpMatchArray | null,
  relativeFile: string,
) {
  const name = match?.[1];
  if (!name || !DYNAMIC_IDENTIFIER_PATTERN.test(name)) {
    throw new Error(
      `Invalid dynamic route segment "${segment}" in "${relativeFile}". ` +
        'Use a non-empty identifier in [param], [[param]], or [...param].',
    );
  }
  return name;
}

function parseRouteSegment(
  segment: string,
  relativeFile: string,
): RouteSegment {
  const optional = segment.match(/^\[\[([^\[\]]*)\]\]$/);
  if (optional) {
    return {
      kind: 'optional',
      name: dynamicName(segment, optional, relativeFile),
    };
  }

  const catchAll = segment.match(/^\[\.\.\.([^\[\]]*)\]$/);
  if (catchAll) {
    return {
      kind: 'catch-all',
      name: dynamicName(segment, catchAll, relativeFile),
    };
  }

  const required = segment.match(/^\[([^\[\]]*)\]$/);
  if (required) {
    return {
      kind: 'required',
      name: dynamicName(segment, required, relativeFile),
    };
  }

  if (segment.includes('[') || segment.includes(']')) {
    throw new Error(
      `Invalid route segment "${segment}" in "${relativeFile}". ` +
        'Dynamic syntax must occupy the whole segment and use [param], [[param]], or [...param].',
    );
  }

  return { kind: 'static', value: segment };
}

function routePattern(segments: readonly RouteSegment[]) {
  if (segments.length === 0) return '/';

  return segments.map((segment, index) => {
    switch (segment.kind) {
      case 'static':
        return `/${segment.value}`;
      case 'required':
        return `/:${segment.name}`;
      case 'optional':
        return index === 0 ? `/{:${segment.name}}?` : `{/:${segment.name}}?`;
      case 'catch-all':
        return `/:${segment.name}*`;
    }
  }).join('');
}

function matcherSignature(segments: readonly RouteSegment[]) {
  return JSON.stringify(
    segments.map((segment) =>
      segment.kind === 'static' ? ['static', segment.value] : [segment.kind]
    ),
  );
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

  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => compareCodePoints(a.name, b.name));

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function parseRouteFile(file: string, routesPath: string): RouteFile {
  const relativeFile = normalizePath(relative(routesPath, file));
  const withoutExt = relativeFile.replace(ROUTE_EXT_PATTERN, '');
  const fileSegments = withoutExt.split('/');
  if (fileSegments.at(-1) === 'index') fileSegments.pop();
  const segments = fileSegments.map((segment) =>
    parseRouteSegment(segment, relativeFile)
  );
  const parameterNames = new Set<string>();
  for (const segment of segments) {
    if (segment.kind === 'static') continue;
    if (parameterNames.has(segment.name)) {
      throw new Error(
        `Duplicate route parameter "${segment.name}" in "${relativeFile}". ` +
          'Each filesystem route parameter name must be unique.',
      );
    }
    parameterNames.add(segment.name);
  }
  const catchAllIndex = segments.findIndex((segment) =>
    segment.kind === 'catch-all'
  );

  if (catchAllIndex !== -1 && catchAllIndex !== segments.length - 1) {
    throw new Error(
      `Invalid catch-all route in "${relativeFile}": ` +
        `"${fileSegments[catchAllIndex]}" must be the final route segment.`,
    );
  }

  return {
    relativeFile,
    path: routePattern(segments),
    segments,
    matcherSignature: matcherSignature(segments),
  };
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

function specialFileKind(relativeFile: string): SpecialFileKind | undefined {
  const basename = relativeFile.split('/').at(-1);
  if (basename === '_app.ts' || basename === '_app.js') return 'app';
  if (basename === '_layout.ts' || basename === '_layout.js') return 'layout';
  if (basename === '_middleware.ts' || basename === '_middleware.js') {
    return 'middleware';
  }
}

const SEGMENT_SPECIFICITY: Record<RouteSegment['kind'], number> = {
  static: 0,
  required: 1,
  optional: 2,
  'catch-all': 3,
};

function compareRoutesBySpecificity(a: RouteFile, b: RouteFile) {
  const sharedLength = Math.min(a.segments.length, b.segments.length);

  for (let index = 0; index < sharedLength; index++) {
    const aSegment = a.segments[index];
    const bSegment = b.segments[index];
    const specificity = SEGMENT_SPECIFICITY[aSegment.kind] -
      SEGMENT_SPECIFICITY[bSegment.kind];
    if (specificity !== 0) return specificity;

    if (
      aSegment.kind === 'static' && bSegment.kind === 'static' &&
      aSegment.value !== bSegment.value
    ) {
      return compareCodePoints(a.relativeFile, b.relativeFile);
    }
  }

  return a.segments.length - b.segments.length ||
    compareCodePoints(a.relativeFile, b.relativeFile);
}

function setSpecialFile(
  files: Map<string, string>,
  directory: string,
  file: string,
  kind: 'layout' | 'middleware',
  root: string,
) {
  const existing = files.get(directory);
  if (existing) {
    throw new Error(
      `Duplicate ${kind} files in "${directory || '.'}": ` +
        `"${normalizePath(relative(root, existing))}" and ` +
        `"${normalizePath(relative(root, file))}". Keep only one.`,
    );
  }
  files.set(directory, file);
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
      `Duplicate app wrapper files: "${
        normalizePath(relative(root, appTs))
      }" ` +
        `and "${normalizePath(relative(root, appJs))}". Keep only one.`,
    );
  }

  if (!hasAppTs && !hasAppJs) {
    throw new Error(
      `Missing app wrapper in "${
        normalizePath(relative(root, routesPath))
      }". ` +
        'Create either "_app.ts" or "_app.js".',
    );
  }

  const files = (await walkFiles(routesPath))
    .filter((file) => ROUTE_EXT_PATTERN.test(file))
    .filter((file) => !DECLARATION_FILE_PATTERN.test(file))
    .filter((file) => !TEST_FILE_PATTERN.test(file));
  const layoutFiles = new Map<string, string>();
  const middlewareFiles = new Map<string, string>();

  for (const file of files) {
    const relativeFile = normalizePath(relative(routesPath, file));
    const directory = relativeFile.split('/').slice(0, -1).join('/');

    const kind = specialFileKind(relativeFile);
    if (kind === 'layout') {
      setSpecialFile(layoutFiles, directory, file, kind, root);
    } else if (kind === 'middleware') {
      setSpecialFile(middlewareFiles, directory, file, kind, root);
    }
  }

  const routeFiles = files
    .filter((file) =>
      specialFileKind(normalizePath(relative(routesPath, file))) === undefined
    )
    .map((file) => parseRouteFile(file, routesPath));
  const routesByMatcher = new Map<string, RouteFile>();

  for (const routeFile of routeFiles) {
    const existing = routesByMatcher.get(routeFile.matcherSignature);
    if (existing) {
      throw new Error(
        `Filesystem route conflict between "${existing.relativeFile}" and ` +
          `"${routeFile.relativeFile}": both define the equivalent matcher ` +
          `"${routeFile.path}" (${routeFile.matcherSignature}).`,
      );
    }
    routesByMatcher.set(routeFile.matcherSignature, routeFile);
  }

  routeFiles.sort(compareRoutesBySpecificity);

  const routes: LimetteRouteManifestEntry[] = routeFiles
    .map((routeFile): LimetteRouteManifestEntry => {
      const file = join(routesPath, routeFile.relativeFile);
      const layouts = findInheritedFiles(file, routesPath, layoutFiles).map((
        file,
      ) => normalizePath(relative(root, file)));

      return {
        id: routeId(routeFile.path),
        path: routeFile.path,
        routeFile: normalizePath(relative(root, file)),
        layouts,
        middlewares: findInheritedFiles(file, routesPath, middlewareFiles).map((
          file,
        ) => normalizePath(relative(root, file))),
        islandImports: [],
        sourceFiles: [],
        styleImports: [],
      };
    });

  const appFile = normalizePath(relative(root, hasAppTs ? appTs : appJs));

  for (const route of routes) {
    const sourceFiles = [appFile, ...route.layouts, route.routeFile];
    route.sourceFiles = await discoverSourceFilesForFiles({
      root,
      files: sourceFiles,
      resolve: options.resolve,
    });
    route.islandImports = await discoverIslandImportsForFiles({
      root,
      files: sourceFiles,
      resolve: options.resolve,
    });
    route.styleImports = await discoverStyleImportsForFiles({
      root,
      files: sourceFiles,
      resolve: options.resolve,
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
