import { join } from "@std/path";
import { exists } from "@std/fs";
import { serveDir } from "@std/http";
import type { Context } from "./app.ts";

/**
 * Middleware to serve files from the static files.
 */
export async function staticFiles(ctx: Context): Promise<Response> {
  if (ctx.request.method.toLowerCase() !== "get") {
    return ctx.next();
  }

  const path = join(Deno.cwd(), "static", ctx.url.pathname);

  if (await exists(path, { isFile: true })) {
    return await serveDir(ctx.request, { fsRoot: "static", quiet: true });
  }

  return ctx.next();
}

export function staticBuildMiddleware(ctx: Context) {
  return serveDir(ctx.request, { quiet: true });
}
