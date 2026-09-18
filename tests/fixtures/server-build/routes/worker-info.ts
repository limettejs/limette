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
    const info = ctx.info as WorkerInfo;
    info.ctx.waitUntil(Promise.resolve());
    return Response.json({ testValue: info.env.TEST_VALUE });
  },
};
