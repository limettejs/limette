import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import {
  contentType,
  type StaticDirectoryHandlerOptions,
  staticFileRequest,
} from './static-files.ts';

function isInsideRoot(root: string, path: string) {
  const relativePath = relative(root, path);
  return relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

export function staticDirectoryHandler(
  options: StaticDirectoryHandlerOptions,
) {
  const configuredRoot = resolve(options.root);
  const root = realpath(configuredRoot).catch(() => undefined);

  return async (request: Request): Promise<Response | undefined> => {
    const staticRequest = staticFileRequest(request, options.base);
    if (!staticRequest || staticRequest instanceof Response) {
      return staticRequest;
    }

    const canonicalRoot = await root;
    if (!canonicalRoot || !staticRequest.relativePath) return undefined;

    const candidate = resolve(configuredRoot, staticRequest.relativePath);
    if (!isInsideRoot(configuredRoot, candidate)) return undefined;

    let path: string;
    try {
      path = await realpath(candidate);
      if (!isInsideRoot(canonicalRoot, path) || !(await stat(path)).isFile()) {
        return undefined;
      }
    } catch {
      return undefined;
    }

    const headers = new Headers();
    const type = contentType(path);
    if (type) headers.set('content-type', type);

    if (staticRequest.head) return new Response(null, { headers });
    return new Response(new Uint8Array(await readFile(path)), { headers });
  };
}
