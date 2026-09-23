import type { Context } from 'limette';

export const handler = async (ctx: Context) => {
  const response = await ctx.next();
  response.headers.set('x-server-middleware', 'applied');
  response.headers.set(
    'x-runtime-info',
    typeof ctx.platform === 'object' && ctx.platform !== null && 'remoteAddr' in ctx.platform
      ? 'deno'
      : 'generic'
  );
  return response;
};
