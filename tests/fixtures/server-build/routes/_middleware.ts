import type { Context } from '@limette/core';

export const handler = async (ctx: Context) => {
  const response = await ctx.next();
  response.headers.set('x-server-middleware', 'applied');
  response.headers.set(
    'x-runtime-info',
    typeof ctx.info === 'object' && ctx.info !== null &&
      'remoteAddr' in ctx.info
      ? 'deno'
      : 'generic',
  );
  return response;
};
