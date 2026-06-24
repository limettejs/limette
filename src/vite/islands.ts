import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export type IslandImport = {
  tagName: string;
  local: string;
  sourceFile: string;
  moduleSpecifier: string;
  resolvedImport: string;
};

type ImportBinding = {
  local: string;
  moduleSpecifier: string;
};

const MODULE_EXTENSIONS = ['', '.ts', '.js'];
const INDEX_MODULES = ['index.ts', 'index.js'];

function normalizePath(path: string) {
  return path.split(sep).join('/');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getImportBindings(code: string): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const importPattern =
    /import\s+(?:(type)\s+)?(?:(.*?)\s+from\s*)?["']([^"']+)["'];?/gs;

  for (const match of code.matchAll(importPattern)) {
    const [, typeOnly, rawClause, moduleSpecifier] = match;
    if (typeOnly || !rawClause) continue;

    const clause = rawClause.trim();
    if (!clause || clause.startsWith('type ')) continue;

    const namespaceMatch = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (namespaceMatch) {
      bindings.push({ local: namespaceMatch[1], moduleSpecifier });
      continue;
    }

    const namedStart = clause.indexOf('{');
    if (namedStart > -1) {
      const defaultImport = clause.slice(0, namedStart).replace(',', '').trim();
      if (defaultImport) {
        bindings.push({ local: defaultImport, moduleSpecifier });
      }

      const namedEnd = clause.lastIndexOf('}');
      const namedImports = clause.slice(namedStart + 1, namedEnd);
      for (const rawNamedImport of namedImports.split(',')) {
        const namedImport = rawNamedImport.trim();
        if (!namedImport || namedImport.startsWith('type ')) continue;

        const parts = namedImport.split(/\s+as\s+/);
        const local = (parts[1] ?? parts[0]).trim();
        if (local) bindings.push({ local, moduleSpecifier });
      }
      continue;
    }

    const defaultImport = clause.split(',')[0]?.trim();
    if (defaultImport) {
      bindings.push({ local: defaultImport, moduleSpecifier });
    }
  }

  return bindings;
}

function readBalancedBlock(code: string, start: number) {
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = start; i < code.length; i++) {
    const char = code[i];
    const next = code[i + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      i++;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return code.slice(start, i + 1);
      }
    }
  }

  return undefined;
}

function getStaticIslandsBlocks(code: string) {
  const blocks: string[] = [];
  const staticIslandsPattern = /static\s+(?:override\s+)?islands\s*=/g;

  for (const match of code.matchAll(staticIslandsPattern)) {
    let index = match.index + match[0].length;
    while (/\s/.test(code[index])) index++;
    if (code[index] !== '{') continue;

    const block = readBalancedBlock(code, index);
    if (block) blocks.push(block);
  }

  return blocks;
}

function getStaticIslandEntries(blocks: string[]) {
  const entries: Array<{ tagName: string; local: string }> = [];
  const entryPattern =
    /(?:['"`]([^'"`]+)['"`]|([A-Za-z_$][\w$]*))\s*:\s*([A-Za-z_$][\w$]*)/g;

  for (const block of blocks) {
    for (const match of block.matchAll(entryPattern)) {
      const [, stringKey, identifierKey, local] = match;
      entries.push({
        tagName: stringKey ?? identifierKey,
        local,
      });
    }
  }

  return entries;
}

function resolveIslandImport({
  root,
  sourceFile,
  moduleSpecifier,
}: {
  root: string;
  sourceFile: string;
  moduleSpecifier: string;
}) {
  if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
    return moduleSpecifier;
  }

  const resolved = moduleSpecifier.startsWith('/')
    ? join(root, moduleSpecifier)
    : resolve(dirname(sourceFile), moduleSpecifier);

  return `/${normalizePath(relative(root, resolved))}`;
}

async function fileExists(path: string) {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

function stripImportQuery(moduleSpecifier: string) {
  return moduleSpecifier.split(/[?#]/, 1)[0];
}

function isInsideRoot(root: string, path: string) {
  const relativePath = relative(root, path);
  return relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

async function resolveLocalModuleFile({
  root,
  sourceFile,
  moduleSpecifier,
}: {
  root: string;
  sourceFile: string;
  moduleSpecifier: string;
}) {
  const specifier = stripImportQuery(moduleSpecifier);

  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return undefined;
  }

  const resolved = specifier.startsWith('/')
    ? join(root, specifier)
    : resolve(dirname(sourceFile), specifier);

  if (!isInsideRoot(root, resolved)) {
    return undefined;
  }

  for (const extension of MODULE_EXTENSIONS) {
    const candidate = `${resolved}${extension}`;
    if (await fileExists(candidate)) {
      return normalizePath(relative(root, candidate));
    }
  }

  for (const indexModule of INDEX_MODULES) {
    const candidate = join(resolved, indexModule);
    if (await fileExists(candidate)) {
      return normalizePath(relative(root, candidate));
    }
  }

  return undefined;
}

async function discoverIslandImportsForFileInternal({
  root,
  file,
  visited,
}: {
  root: string;
  file: string;
  visited: Set<string>;
}) {
  const sourceFile = isAbsolute(file) ? file : join(root, file);
  const sourceKey = normalizePath(relative(root, sourceFile));

  if (visited.has(sourceKey)) {
    return [];
  }

  visited.add(sourceKey);

  const code = await readFile(sourceFile, 'utf8');
  const importBindings = getImportBindings(code);
  const islandsBlocks = getStaticIslandsBlocks(code);
  const imports: IslandImport[] = [];

  const importedFiles = await Promise.all(
    importBindings.map((binding) =>
      resolveLocalModuleFile({
        root,
        sourceFile,
        moduleSpecifier: binding.moduleSpecifier,
      })
    ),
  );

  for (const importedFile of importedFiles) {
    if (!importedFile) continue;

    imports.push(
      ...await discoverIslandImportsForFileInternal({
        root,
        file: importedFile,
        visited,
      }),
    );
  }

  if (!islandsBlocks.length) return imports;

  const islandEntries = getStaticIslandEntries(islandsBlocks);

  for (const binding of importBindings) {
    const islandEntry = islandEntries.find((entry) =>
      entry.local === binding.local
    );
    if (!islandEntry) {
      continue;
    }

    imports.push({
      tagName: islandEntry.tagName,
      local: binding.local,
      sourceFile: normalizePath(relative(root, sourceFile)),
      moduleSpecifier: binding.moduleSpecifier,
      resolvedImport: resolveIslandImport({
        root,
        sourceFile,
        moduleSpecifier: binding.moduleSpecifier,
      }),
    });
  }

  return imports;
}

export async function discoverIslandImportsForFile({
  root,
  file,
}: {
  root: string;
  file: string;
}) {
  return await discoverIslandImportsForFileInternal({
    root,
    file,
    visited: new Set(),
  });
}

export async function discoverIslandImportsForFiles({
  root,
  files,
}: {
  root: string;
  files: string[];
}) {
  const imports = (
    await Promise.all(
      files.map((file) =>
        discoverIslandImportsForFileInternal({
          root,
          file,
          visited: new Set(),
        })
      ),
    )
  ).flat();
  const seen = new Set<string>();

  return imports.filter((islandImport) => {
    if (seen.has(islandImport.resolvedImport)) return false;
    seen.add(islandImport.resolvedImport);
    return true;
  });
}
