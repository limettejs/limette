import type { App } from "../server/app.ts";
export interface TailwindPluginOptions {
  enabled: boolean;
}

export function tailwind(app: App) {
  app._setBuiltinPluginOptions("tailwind", {
    enabled: true,
  });
}
