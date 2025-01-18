import type { Context } from "./context.ts";

export type MiddlewareFn = (ctx: Context) => Response | Promise<Response>;

export interface MiddlewareModule {
  handler: MiddlewareFn | MiddlewareFn[];
}

export function runMiddlewares(
  middlewares: MiddlewareFn[][],
  ctx: Context
): Promise<Response> {
  let fn = ctx.next;
  let i = middlewares.length;
  while (i--) {
    const stack = middlewares[i];
    let j = stack.length;
    while (j--) {
      const local = fn;
      const next = stack[j];
      fn = async () => {
        ctx.next = local;
        try {
          return await next(ctx);
        } catch (err) {
          ctx.error = err;
          throw err;
        }
      };
    }
  }
  return fn();
}
