import type { AppConfig } from './app.ts';

export interface ContextInit<
  TParams extends Record<string, string> = Record<string, string>,
> {
  request: Request;
  url: URL;
  info: unknown;
  params: TParams;
  config: AppConfig;
  next: () => Promise<Response>;
}
export interface Context<
  TData = unknown,
  TParams extends Record<string, string> = Record<string, string>,
> extends ContextInit<TParams> {
  data: TData;
  error: unknown;
  render: (data?: TData) => Promise<Response>;
  redirect(path: string, status?: number): Response;
}

export class Context<
  TData = unknown,
  TParams extends Record<string, string> = Record<string, string>,
> implements Context<TData, TParams> {
  declare data: TData;
  declare error: unknown;
  declare render: (data?: TData) => Promise<Response>;

  constructor(
    { request, url, info, params, config, next }: ContextInit<TParams>,
  ) {
    this.request = request;
    this.url = url;
    this.info = info;
    this.params = params;
    this.config = config;
    this.next = next;
  }

  redirect(pathOrUrl: string, status = 302): Response {
    let location = pathOrUrl;

    // Disallow protocol relative URLs
    if (pathOrUrl !== '/' && pathOrUrl.startsWith('/')) {
      let idx = pathOrUrl.indexOf('?');
      if (idx === -1) {
        idx = pathOrUrl.indexOf('#');
      }

      const pathname = idx > -1 ? pathOrUrl.slice(0, idx) : pathOrUrl;
      const search = idx > -1 ? pathOrUrl.slice(idx) : '';

      // Remove double slashes to prevent open redirect vulnerability.
      location = `${pathname.replaceAll(/\/+/g, '/')}${search}`;
    }

    return new Response(null, {
      status,
      headers: {
        location,
      },
    });
  }
}

type Constructor<T = Record<string, never>> = new (...args: unknown[]) => T;

export function ContextMixin(
  Base: CustomElementConstructor,
): CustomElementConstructor & Constructor<{ ctx: Context }> {
  return class ContextClass extends Base {
    #ctx!: Context;

    static __requiresContext = true;

    get ctx() {
      return this.#ctx;
    }
    set ctx(value) {
      // Allow setting ctx only once?
      if (this.#ctx instanceof Context) return;
      this.#ctx = value;
    }
  };
}
