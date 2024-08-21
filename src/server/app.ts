import { Application } from "../deps.ts";
import { staticMiddleware } from "./utils.ts";
import { refreshMiddleware } from "../dev/refresh-middleware.ts";
import { getRouter } from "./router.ts";

type AppUseArgs = Parameters<Application["use"]>;
type AppListenArgs = Parameters<Application["listen"]>;
type AppUseReturn = ReturnType<Application["use"]>;
type AppListenReturn = ReturnType<Application["listen"]>;

export class LimetteApp {
  #app;
  #devMode = false;

  constructor() {
    this.#app = new Application();

    this.#app.use(staticMiddleware);
    this.#app.use(refreshMiddleware);
  }

  use(...args: AppUseArgs): AppUseReturn {
    this.#app.use(...args);
    return this as unknown as AppUseReturn;
  }

  async listen(...args: AppListenArgs): AppListenReturn {
    const port = args?.[0]?.port || 8000;
    if (!args?.[0]) args[0] = { port };

    const router = await getRouter({ buildAssets: this.#devMode });
    this.#app.use(router.routes());
    this.#app.use(router.allowedMethods());

    // console.log(router.routes());

    const result = this.#app.listen(...args);
    console.log(`Limette app started on: http://localhost:${port}`);
    return result;
  }

  setDevMode(mode: boolean) {
    this.#devMode = mode;
  }
}
