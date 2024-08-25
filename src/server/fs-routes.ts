import type { LimetteApp } from "./app.ts";

type FsRoutesOptions = {
  dir: string;
  loadFs: () => Promise<undefined>;
};

export function fsRoutes(app: LimetteApp, options: FsRoutesOptions) {}
