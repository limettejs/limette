export interface StaticDirectoryHandlerOptions {
  root: string;
  base?: string;
}

export interface StaticFileRequest {
  relativePath: string;
  head: boolean;
}

const CONTENT_TYPES: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  gif: 'image/gif',
  html: 'text/html; charset=utf-8',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  webp: 'image/webp',
};

function normalizeBasePath(base = '/') {
  if (!base || base === '/') return '/';
  return `/${base.replace(/^\/+|\/+$/g, '')}/`;
}

export function staticFileRequest(
  request: Request,
  base?: string,
): StaticFileRequest | Response | undefined {
  const normalizedBase = normalizeBasePath(base);
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(normalizedBase)) return undefined;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(
      normalizedBase === '/'
        ? pathname.slice(1)
        : pathname.slice(normalizedBase.length),
    );
  } catch {
    return undefined;
  }

  const segments = decodedPathname.replaceAll('\\', '/').split('/');
  if (
    segments.some((segment) => segment === '..' || segment.includes('\0'))
  ) {
    return undefined;
  }

  return {
    relativePath: segments.filter(Boolean).join('/'),
    head: request.method === 'HEAD',
  };
}

export function contentType(path: string) {
  const filename = path.slice(path.lastIndexOf('/') + 1);
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return undefined;
  return CONTENT_TYPES[filename.slice(dot + 1).toLowerCase()];
}
