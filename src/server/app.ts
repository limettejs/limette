import { Application } from "../deps.ts";
import { staticMiddleware } from "./utils.ts";
import { refreshMiddleware } from "../dev/refresh-middleware.ts";
import { router } from "./router.ts";

type AppUseArgs = Parameters<Application["use"]>;
type AppListenArgs = Parameters<Application["listen"]>;
type AppUseReturn = ReturnType<Application["use"]>;
type AppListenReturn = ReturnType<Application["listen"]>;

export class LimetteApp {
  #app;

  constructor() {
    this.#app = new Application();

    this.#app.use(staticMiddleware);
    this.#app.use(refreshMiddleware);

    this.#app.use(router.routes());
    this.#app.use(router.allowedMethods());
  }

  use(...args: AppUseArgs): AppUseReturn {
    this.#app.use(...args);
    return this as unknown as AppUseReturn;
  }

  listen(...args: AppListenArgs): AppListenReturn {
    return this.#app.listen(...args);
  }
}
