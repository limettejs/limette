import { send } from "../deps.ts";

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

export const staticMiddleware = async (ctx, next) => {
  const path = `${Deno.cwd()}${ctx.request.url.pathname}`;
  if (await fileExists(path)) {
    await send(ctx, ctx.request.url.pathname, {
      root: `${Deno.cwd()}`,
    });
  } else {
    await next();
  }
};
