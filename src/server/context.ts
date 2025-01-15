import type { AppConfig } from "./app.ts";

export interface ContextInit {
  request: Request;
  url: URL;
  info: Deno.ServeHandlerInfo;
  params: Record<string, string>;
  config: AppConfig;
  next: () => Promise<Response>;
}
export interface Context extends ContextInit {
  data: unknown;
  error: unknown;
  render: (data?: Context["data"]) => Promise<Response>;
  redirect(path: string, status?: number): Response;
}

export interface ComponentContext {
  params: Context["params"];
  data: unknown;
}

export class Context implements Context {
  constructor({ request, url, info, params, config, next }: ContextInit) {
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
    if (pathOrUrl !== "/" && pathOrUrl.startsWith("/")) {
      let idx = pathOrUrl.indexOf("?");
      if (idx === -1) {
        idx = pathOrUrl.indexOf("#");
      }

      const pathname = idx > -1 ? pathOrUrl.slice(0, idx) : pathOrUrl;
      const search = idx > -1 ? pathOrUrl.slice(idx) : "";

      // Remove double slashes to prevent open redirect vulnerability.
      location = `${pathname.replaceAll(/\/+/g, "/")}${search}`;
    }

    return new Response(null, {
      status,
      headers: {
        location,
      },
    });
  }
}
