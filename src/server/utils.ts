import { send, join } from "../deps.ts";
import type { Context } from "../deps.ts";

export async function fileExists(path: string) {
  try {
    const stats = await Deno.lstat(path);
    return stats && stats.isFile;
  } catch (e) {
    if (e && e instanceof Deno.errors.NotFound) {
      return false;
    } else {
      throw e;
    }
  }
}

export const staticMiddleware = async (
  ctx: Context,
  next: () => Promise<unknown>
) => {
  const staticPath = join(Deno.cwd(), "static", ctx.request.url.pathname);

  if (await fileExists(staticPath)) {
    await send(ctx, ctx.request.url.pathname, {
      root: join(Deno.cwd(), "static"),
    });
  } else {
    await next();
  }
};

export const staticBuildMiddleware = async (
  ctx: Context,
  next: () => Promise<unknown>
) => {
  const lmtPath = join(Deno.cwd(), ctx.request.url.pathname);

  if (
    ctx.request.url.pathname.startsWith("/_limette/") &&
    (await fileExists(lmtPath))
  ) {
    await send(ctx, ctx.request.url.pathname, {
      root: Deno.cwd(),
    });
  } else {
    await next();
  }
};
