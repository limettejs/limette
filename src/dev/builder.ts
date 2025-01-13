import type { App, ListenOptions } from "../server/app.ts";
import { build } from "./build.ts";
import { refreshMiddleware } from "./refresh-middleware.ts";

export interface BuilderOptions {
  target?: string | string[];
}

export class Builder {
  options: BuilderOptions;

  constructor(options?: BuilderOptions) {
    this.options = {
      target: options?.target ?? ["chrome99", "firefox99", "safari15"],
    };
  }

  async build(app: App): Promise<void> {
    return await build(app, { target: this.options.target });
  }

  listen(app: App, options?: ListenOptions) {
    app.config.mode = "development";

    app.builder = this;

    // For dev mode, use the refresh middleware
    app.use(refreshMiddleware);

    app.listen(options);
  }
}
