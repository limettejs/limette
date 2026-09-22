export function getCookies(headers: Headers): Record<string, string> {
  const cookie = headers.get('cookie');
  const cookies: Record<string, string> = {};

  if (!cookie) return cookies;

  for (const part of cookie.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (!name) continue;
    cookies[name] = decodeURIComponent(value);
  }

  return cookies;
}

export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: 'Strict' | 'Lax' | 'None';
  secure?: boolean;
}

function serializeCookie(cookie: Cookie) {
  const parts = [
    `${cookie.name}=${encodeURIComponent(cookie.value)}`,
  ];

  if (cookie.domain) parts.push(`Domain=${cookie.domain}`);
  if (cookie.expires) parts.push(`Expires=${cookie.expires.toUTCString()}`);
  if (cookie.httpOnly) parts.push('HttpOnly');
  if (typeof cookie.maxAge === 'number') parts.push(`Max-Age=${cookie.maxAge}`);
  if (cookie.path) parts.push(`Path=${cookie.path}`);
  if (cookie.sameSite) parts.push(`SameSite=${cookie.sameSite}`);
  if (cookie.secure) parts.push('Secure');

  return parts.join('; ');
}

export function setCookie(headers: Headers, cookie: Cookie) {
  headers.append('set-cookie', serializeCookie(cookie));
}

export function deleteCookie(
  headers: Headers,
  name: string,
  attributes: Omit<Cookie, 'name' | 'value' | 'expires' | 'maxAge'> = {},
) {
  setCookie(headers, {
    ...attributes,
    name,
    value: '',
    expires: new Date(0),
    maxAge: 0,
  });
}
