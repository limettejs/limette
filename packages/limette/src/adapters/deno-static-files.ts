import {
  contentType,
  type StaticDirectoryHandlerOptions,
  staticFileRequest,
} from './static-files.ts';

function normalizedPath(path: string) {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/g, '');
  return Deno.build.os === 'windows' ? normalized.toLowerCase() : normalized;
}

function isInsideRoot(root: string, path: string) {
  const normalizedRoot = normalizedPath(root);
  const normalizedCandidate = normalizedPath(path);
  return (
    normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}

export function staticDirectoryHandler(options: StaticDirectoryHandlerOptions) {
  const root = Deno.realPath(options.root).catch(() => undefined);

  return async (request: Request): Promise<Response | undefined> => {
    const staticRequest = staticFileRequest(request, options.base);
    if (!staticRequest || staticRequest instanceof Response) {
      return staticRequest;
    }

    const canonicalRoot = await root;
    if (!canonicalRoot || !staticRequest.relativePath) return undefined;

    let path: string;
    try {
      path = await Deno.realPath(
        `${canonicalRoot.replace(/[\\/]+$/g, '')}/${staticRequest.relativePath}`
      );
      if (!isInsideRoot(canonicalRoot, path) || !(await Deno.stat(path)).isFile) {
        return undefined;
      }
    } catch {
      return undefined;
    }

    const headers = new Headers();
    const type = contentType(path);
    if (type) headers.set('content-type', type);

    if (staticRequest.head) return new Response(null, { headers });
    return new Response(await Deno.readFile(path), { headers });
  };
}
