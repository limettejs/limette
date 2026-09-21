import type { Context } from '@limette/core';

interface WorkerInfo {
  env: {
    TEST_VALUE: string;
  };
  ctx: {
    waitUntil(promise: Promise<unknown>): void;
  };
}

export const handler = {
  GET(ctx: Context) {
    const platform = ctx.platform as WorkerInfo;
    platform.ctx.waitUntil(Promise.resolve());
    return Response.json({ testValue: platform.env.TEST_VALUE });
  },
};
