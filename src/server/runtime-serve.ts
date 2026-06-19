import type { App } from './app.ts';

export type ServeOptions = {
  port?: number;
  hostname?: string;
  onListen?: (address: { hostname: string; port: number }) => void;
} & Record<string, unknown>;

export async function serve(app: App, options: ServeOptions = {}) {
  if (typeof Deno !== 'undefined') {
    const deno = await import('../deno.ts');
    return deno.serve(app, options as Parameters<typeof deno.serve>[1]);
  }

  const node = await import('../node.ts');
  return node.serve(app, options as Parameters<typeof node.serve>[1]);
}
