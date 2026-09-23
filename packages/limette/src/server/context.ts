import type { AppConfig } from './app.ts';
import type { HttpError } from './error.ts';

export type DefaultState = Record<string, unknown>;
export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([
  301,
  302,
  303,
  307,
  308,
]);

export interface RenderContext<
  State = DefaultState,
  Platform = unknown,
> {
  readonly request: Request;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly config: Readonly<AppConfig>;
  readonly platform: Platform;
  readonly state: Readonly<State>;
  readonly error: HttpError | undefined;
}

export interface Context<
  State = DefaultState,
  Platform = unknown,
> extends Omit<RenderContext<State, Platform>, 'state'> {
  readonly state: State;

  next(): Promise<Response>;
  render(): Promise<Response>;
  redirect(location: string | URL, status?: RedirectStatus): Response;
}

interface ContextInit<State, Platform> {
  request: Request;
  url: URL;
  platform: Platform;
  params: Record<string, string>;
  config: Readonly<AppConfig>;
  next: () => Promise<Response>;
  state?: State;
}

/** @internal Request-local implementation used by Limette's server pipeline. */
export class ContextImpl<
  State = DefaultState,
  Platform = unknown,
> implements Context<State, Platform> {
  readonly request: Request;
  readonly url: URL;
  readonly platform: Platform;
  readonly params: Readonly<Record<string, string>>;
  readonly config: Readonly<AppConfig>;
  readonly state: State;

  #error: HttpError | undefined;
  #next: () => Promise<Response>;
  #render?: () => Promise<Response>;

  constructor(
    { request, url, platform, params, config, next, state }: ContextInit<
      State,
      Platform
    >,
  ) {
    this.request = request;
    this.url = url;
    this.platform = platform;
    this.params = params;
    this.config = config;
    this.state = state ?? ({} as State);
    this.#next = next;
  }

  get error() {
    return this.#error;
  }

  next(): Promise<Response> {
    return this.#next();
  }

  render(): Promise<Response> {
    if (!this.#render) {
      throw new Error('ctx.render() is unavailable for this route.');
    }
    return this.#render();
  }

  /** @internal */
  _setNext(next: () => Promise<Response>) {
    this.#next = next;
  }

  /** @internal */
  _getNext() {
    return this.#next;
  }

  /** @internal */
  _setRender(render: () => Promise<Response>) {
    this.#render = render;
  }

  /** @internal */
  _setError(error: HttpError | undefined) {
    this.#error = error;
  }

  redirect(
    location: string | URL,
    status: RedirectStatus = 302,
  ): Response {
    const value = location instanceof URL ? location.href : location;

    if (value.startsWith('//')) {
      throw new TypeError(
        `Protocol-relative redirect locations are not allowed: "${value}".`,
      );
    }
    if (!REDIRECT_STATUSES.has(status)) {
      throw new TypeError(
        `Invalid redirect status ${status}. Expected 301, 302, 303, 307, or 308.`,
      );
    }

    return new Response(null, {
      status,
      headers: { location: value },
    });
  }
}
