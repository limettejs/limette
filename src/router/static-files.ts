import { serveDir, exists, join } from "../deps.ts";
import type { Context } from "./app.ts";

export async function staticMiddleware(ctx: Context) {
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
