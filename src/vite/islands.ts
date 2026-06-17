import { readFile } from 'node:fs/promises';
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

export async function discoverIslandImportsForFile({
  root,
  file,
}: {
  root: string;
  file: string;
}) {
  const sourceFile = isAbsolute(file) ? file : join(root, file);
  const code = await readFile(sourceFile, 'utf8');
  const islandsBlocks = getStaticIslandsBlocks(code);
  if (!islandsBlocks.length) return [];

  const imports: IslandImport[] = [];
  const islandEntries = getStaticIslandEntries(islandsBlocks);
  const importBindings = getImportBindings(code);

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

export async function discoverIslandImportsForFiles({
  root,
  files,
}: {
  root: string;
  files: string[];
}) {
  const imports = (
    await Promise.all(
      files.map((file) => discoverIslandImportsForFile({ root, file })),
    )
  ).flat();
  const seen = new Set<string>();

  return imports.filter((islandImport) => {
    if (seen.has(islandImport.resolvedImport)) return false;
    seen.add(islandImport.resolvedImport);
    return true;
  });
}
