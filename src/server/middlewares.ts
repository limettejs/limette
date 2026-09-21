import type { Context, ContextImpl, DefaultState } from './context.ts';

export type MiddlewareFn<State = DefaultState, Platform = unknown> = (
  ctx: Context<State, Platform>,
) => Response | Promise<Response>;

export interface MiddlewareModule<State = DefaultState, Platform = unknown> {
  handler:
    | MiddlewareFn<State, Platform>
    | MiddlewareFn<State, Platform>[];
}

export function runMiddlewares<State = DefaultState, Platform = unknown>(
  middlewares: MiddlewareFn<State, Platform>[][],
  ctx: ContextImpl<State, Platform>,
): Promise<Response> {
  let fn = ctx._getNext();
  let i = middlewares.length;
  while (i--) {
    const stack = middlewares[i];
    let j = stack.length;
    while (j--) {
      const local = fn;
      const next = stack[j];
      fn = async () => {
        ctx._setNext(local);
        return await next(ctx);
      };
    }
  }
  return fn();
}
