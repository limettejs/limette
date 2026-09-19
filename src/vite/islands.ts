import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'vite';

export type IslandImport = {
  tagName: string;
  local: string;
  sourceFile: string;
  moduleSpecifier: string;
  resolvedImport: string;
};

export type ModuleResolution =
  | string
  | {
    id: string;
    external?: boolean | 'absolute' | 'relative';
  }
  | null
  | undefined;
export type ResolveModule = (
  moduleSpecifier: string,
  importer: string,
) => ModuleResolution | Promise<ModuleResolution>;

type AstNode = { type: string; [key: string]: unknown };
type ImportBinding = { local: string; moduleSpecifier: string };
type SourceReference = { moduleSpecifier: string; typeOnly: boolean };
type ParsedModule = {
  bindings: ImportBinding[];
  references: SourceReference[];
  islandEntries: Array<{ tagName: string; local: string }>;
};
type ResolvedReference = { importId: string; localFile?: string };

const MODULE_EXTENSIONS = ['', '.ts', '.js'];
const INDEX_MODULES = ['index.ts', 'index.js'];
const NON_SOURCE_DIRECTORIES = new Set(['node_modules', '.vite']);

function normalizePath(path: string) {
  return path.split(sep).join('/');
}

function stripImportQuery(specifier: string) {
  return specifier.split(/[?#]/, 1)[0];
}

function importQuery(specifier: string) {
  return specifier.slice(stripImportQuery(specifier).length);
}

function isCssImport(specifier: string) {
  return stripImportQuery(specifier).endsWith('.css');
}

function isSourceModule(specifier: string) {
  return /\.(?:ts|js)$/.test(stripImportQuery(specifier));
}

function isNode(value: unknown): value is AstNode {
  return Boolean(
    value && typeof value === 'object' &&
      typeof (value as { type?: unknown }).type === 'string',
  );
}

function stringValue(node: unknown) {
  return isNode(node) && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function identifierName(node: unknown) {
  return isNode(node) && node.type === 'Identifier' &&
      typeof node.name === 'string'
    ? node.name
    : undefined;
}

function walk(node: unknown, visit: (node: AstNode) => void) {
  if (!isNode(node)) return;
  visit(node);
  for (const [key, child] of Object.entries(node)) {
    if (key === 'type' || key === 'parent') continue;
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visit);
    } else {
      walk(child, visit);
    }
  }
}

function unwrapExpression(node: unknown): unknown {
  if (!isNode(node)) return node;
  if (
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSAsExpression' ||
    node.type === 'TSTypeAssertion' ||
    node.type === 'ParenthesizedExpression'
  ) {
    return unwrapExpression(node.expression);
  }
  return node;
}

function parseIslandEntries(property: AstNode, file: string) {
  const expression = unwrapExpression(property.value);
  if (!isNode(expression) || expression.type !== 'ObjectExpression') {
    throw new Error(
      `Unable to statically analyze "static islands" in ${file}. ` +
        'Use an object literal whose values are imported island classes.',
    );
  }
  const entries: Array<{ tagName: string; local: string }> = [];
  for (const entry of expression.properties as unknown[] ?? []) {
    if (
      !isNode(entry) || entry.type !== 'Property' || entry.computed ||
      entry.kind !== 'init'
    ) {
      throw new Error(
        `Unable to statically analyze an island entry in ${file}. ` +
          'Computed keys, spreads, and methods are not supported.',
      );
    }
    const tagName = stringValue(entry.key) ?? identifierName(entry.key);
    const local = identifierName(unwrapExpression(entry.value));
    if (!tagName || !local) {
      throw new Error(
        `Unable to statically analyze an island entry in ${file}. ` +
          'Use a string or identifier tag name and an imported class identifier.',
      );
    }
    entries.push({ tagName, local });
  }
  return entries;
}

function isTypeOnlyImport(node: AstNode) {
  if (node.importKind === 'type') return true;
  const specifiers = node.specifiers as AstNode[] ?? [];
  return specifiers.length > 0 &&
    specifiers.every((specifier) => specifier.importKind === 'type');
}

function isTypeOnlyExport(node: AstNode) {
  if (node.exportKind === 'type') return true;
  const specifiers = node.specifiers as AstNode[] ?? [];
  return specifiers.length > 0 &&
    specifiers.every((specifier) => specifier.exportKind === 'type');
}

function parseModule(file: string, code: string): ParsedModule {
  const result = parseSync(file, code);
  if (result.errors.length > 0) {
    throw new Error(
      `Unable to parse ${file} for Limette discovery: ${
        result.errors.map((error: { message: string }) => error.message).join(
          '; ',
        )
      }`,
    );
  }

  const bindings: ImportBinding[] = [];
  const references: SourceReference[] = [];
  const islandEntries: Array<{ tagName: string; local: string }> = [];
  for (const statement of result.program.body as unknown as AstNode[]) {
    if (statement.type === 'ImportDeclaration') {
      const moduleSpecifier = stringValue(statement.source);
      if (!moduleSpecifier) continue;
      const typeOnly = isTypeOnlyImport(statement);
      references.push({ moduleSpecifier, typeOnly });
      if (typeOnly) continue;
      for (const specifier of statement.specifiers as AstNode[] ?? []) {
        if (specifier.importKind === 'type') continue;
        const local = identifierName(specifier.local);
        if (local) bindings.push({ local, moduleSpecifier });
      }
      continue;
    }
    if (
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportAllDeclaration'
    ) {
      const moduleSpecifier = stringValue(statement.source);
      if (moduleSpecifier) {
        references.push({
          moduleSpecifier,
          typeOnly: isTypeOnlyExport(statement),
        });
      }
    }
  }

  walk(result.program, (node) => {
    if (node.type !== 'PropertyDefinition' || node.static !== true) return;
    const key = stringValue(node.key) ?? identifierName(node.key);
    if (key === 'islands') {
      islandEntries.push(...parseIslandEntries(node, file));
    }
  });
  return { bindings, references, islandEntries };
}

async function fileExists(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function isInsideRoot(root: string, path: string) {
  const relativePath = relative(root, path);
  return relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isApplicationSourcePath(path: string) {
  const segments = normalizePath(path).split('/');
  return !segments.some((segment) => NON_SOURCE_DIRECTORIES.has(segment)) &&
    segments[0] !== 'dist';
}

async function localFileFor(root: string, path: string) {
  if (!isAbsolute(path) || !await fileExists(path)) return undefined;
  const [realRoot, realPath] = await Promise.all([
    realpath(root),
    realpath(path),
  ]);
  if (!isInsideRoot(realRoot, realPath)) return undefined;
  const relativePath = normalizePath(relative(realRoot, realPath));
  return isApplicationSourcePath(relativePath) ? relativePath : undefined;
}

async function resolveLocalFallback(
  root: string,
  sourceFile: string,
  moduleSpecifier: string,
) {
  const specifier = stripImportQuery(moduleSpecifier);
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return;
  const resolved = specifier.startsWith('/')
    ? join(root, specifier)
    : resolve(dirname(sourceFile), specifier);
  if (!isInsideRoot(root, resolved)) return;
  for (const extension of MODULE_EXTENSIONS) {
    const candidate = `${resolved}${extension}`;
    if (await fileExists(candidate)) return candidate;
  }
  for (const indexModule of INDEX_MODULES) {
    const candidate = join(resolved, indexModule);
    if (await fileExists(candidate)) return candidate;
  }
}

function resolvedId(resolution: ModuleResolution) {
  if (typeof resolution === 'string') return resolution;
  if (resolution?.external) return undefined;
  return resolution?.id;
}

function isExternalResolution(resolution: ModuleResolution) {
  return typeof resolution === 'object' && resolution !== null &&
    Boolean(resolution.external);
}

async function resolveReference({
  root,
  sourceFile,
  moduleSpecifier,
  resolveModule,
}: {
  root: string;
  sourceFile: string;
  moduleSpecifier: string;
  resolveModule?: ResolveModule;
}): Promise<ResolvedReference> {
  const resolution = resolveModule
    ? await resolveModule(moduleSpecifier, sourceFile)
    : undefined;
  const viteId = resolvedId(resolution);
  let resolved = isExternalResolution(resolution)
    ? undefined
    : viteId ?? await resolveLocalFallback(
      root,
      sourceFile,
      moduleSpecifier,
    );
  if (resolved?.startsWith('file:')) resolved = fileURLToPath(resolved);
  if (resolved?.startsWith('\0')) resolved = undefined;
  const resolvedPath = resolved && stripImportQuery(resolved);
  const localFile = resolvedPath
    ? await localFileFor(root, resolvedPath)
    : undefined;
  return {
    localFile,
    importId: localFile
      ? `/${localFile}${importQuery(resolved ?? moduleSpecifier)}`
      : viteId ?? moduleSpecifier,
  };
}

async function parsedLocalModule(root: string, file: string) {
  const sourceFile = isAbsolute(file) ? file : join(root, file);
  return {
    sourceFile,
    sourceKey: normalizePath(relative(root, sourceFile)),
    parsed: parseModule(sourceFile, await readFile(sourceFile, 'utf8')),
  };
}

async function discoverIslandImportsForFileInternal({
  root,
  file,
  visited,
  resolveModule,
}: {
  root: string;
  file: string;
  visited: Set<string>;
  resolveModule?: ResolveModule;
}): Promise<IslandImport[]> {
  const { sourceFile, sourceKey, parsed } = await parsedLocalModule(root, file);
  if (visited.has(sourceKey)) return [];
  visited.add(sourceKey);
  const resolvedBySpecifier = new Map<string, ResolvedReference>();
  for (
    const reference of parsed.references.filter((entry) => !entry.typeOnly)
  ) {
    resolvedBySpecifier.set(
      reference.moduleSpecifier,
      await resolveReference({
        root,
        sourceFile,
        moduleSpecifier: reference.moduleSpecifier,
        resolveModule,
      }),
    );
  }

  const imports: IslandImport[] = [];
  for (const resolved of resolvedBySpecifier.values()) {
    if (!resolved.localFile || !isSourceModule(resolved.localFile)) continue;
    imports.push(
      ...await discoverIslandImportsForFileInternal({
        root,
        file: resolved.localFile,
        visited,
        resolveModule,
      }),
    );
  }
  for (const islandEntry of parsed.islandEntries) {
    const binding = parsed.bindings.find((entry) =>
      entry.local === islandEntry.local
    );
    if (!binding) {
      throw new Error(
        `Unable to resolve island "${islandEntry.local}" in ${sourceKey}. ` +
          'Island values must be imported class identifiers.',
      );
    }
    const resolved = resolvedBySpecifier.get(binding.moduleSpecifier) ??
      await resolveReference({
        root,
        sourceFile,
        moduleSpecifier: binding.moduleSpecifier,
        resolveModule,
      });
    imports.push({
      tagName: islandEntry.tagName,
      local: islandEntry.local,
      sourceFile: sourceKey,
      moduleSpecifier: binding.moduleSpecifier,
      resolvedImport: resolved.importId,
    });
  }
  return imports;
}

async function discoverStyleImportsForFileInternal({
  root,
  file,
  visited,
  excluded,
  resolveModule,
}: {
  root: string;
  file: string;
  visited: Set<string>;
  excluded: Set<string>;
  resolveModule?: ResolveModule;
}): Promise<string[]> {
  const { sourceFile, sourceKey, parsed } = await parsedLocalModule(root, file);
  if (visited.has(sourceKey) || excluded.has(sourceKey)) return [];
  visited.add(sourceKey);
  const styles: string[] = [];
  for (
    const reference of parsed.references.filter((entry) => !entry.typeOnly)
  ) {
    const resolved = await resolveReference({
      root,
      sourceFile,
      moduleSpecifier: reference.moduleSpecifier,
      resolveModule,
    });
    if (
      isCssImport(reference.moduleSpecifier) || isCssImport(resolved.importId)
    ) {
      styles.push(resolved.importId);
    } else if (resolved.localFile && isSourceModule(resolved.localFile)) {
      styles.push(
        ...await discoverStyleImportsForFileInternal({
          root,
          file: resolved.localFile,
          visited,
          excluded,
          resolveModule,
        }),
      );
    }
  }
  return styles;
}

export async function discoverIslandImportsForFile({
  root,
  file,
  resolve: resolveModule,
}: {
  root: string;
  file: string;
  resolve?: ResolveModule;
}) {
  return await discoverIslandImportsForFileInternal({
    root,
    file,
    visited: new Set(),
    resolveModule,
  });
}

export async function discoverIslandImportsForFiles({
  root,
  files,
  resolve: resolveModule,
}: {
  root: string;
  files: string[];
  resolve?: ResolveModule;
}) {
  const imports = (await Promise.all(
    files.map((file) =>
      discoverIslandImportsForFileInternal({
        root,
        file,
        visited: new Set(),
        resolveModule,
      })
    ),
  )).flat();
  const seen = new Set<string>();
  return imports.filter((islandImport) => {
    const identity = `${islandImport.tagName}:${islandImport.resolvedImport}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export async function discoverStyleImportsForFiles({
  root,
  files,
  excludeFiles = [],
  resolve: resolveModule,
}: {
  root: string;
  files: string[];
  excludeFiles?: string[];
  resolve?: ResolveModule;
}) {
  const excluded = new Set(
    excludeFiles.map((file) => normalizePath(file.replace(/^\/+/, ''))),
  );
  const styles =
    (await Promise.all(files.map((file) =>
      discoverStyleImportsForFileInternal({
        root,
        file,
        visited: new Set(),
        excluded,
        resolveModule,
      })
    ))).flat();
  return [...new Set(styles)];
}
