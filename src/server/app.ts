import { Application } from "../deps.ts";
import { staticMiddleware } from "./utils.ts";
import { refreshMiddleware } from "../dev/refresh-middleware.ts";
import { router } from "./router.ts";

export class LimetteApp {
  #app;

  constructor() {
    this.#app = new Application();

    this.#app.use(staticMiddleware);
    this.#app.use(refreshMiddleware);

    this.#app.use(router.routes());
    this.#app.use(router.allowedMethods());
  }

  use(...args) {
    this.#app.use(...args);
    return this;
  }

  listen(...args) {
    return this.#app.listen(...args);
  }
}
