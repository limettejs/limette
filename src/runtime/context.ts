// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from "lit";
import { IS_BROWSER } from "./shared.ts";

interface ClientContextInit {
  url: string;
  params: Record<string, string>;
}

export interface ClientContext {
  url: URL;
  params: Record<string, string>;
}

export class ClientContext implements ClientContext {
  constructor({ url, params }: ClientContextInit) {
    this.url = new URL(url);
    this.params = params;
  }
}
export const ContextMixin = (base: LitElement) => {
  return class ContextClass extends base {
    #ctx!: ClientContext;

    static __requiresContext = true;

    get ctx() {
      if (IS_BROWSER) {
        if (this.#ctx) return this.#ctx;
        const ctxInit = JSON.parse(
          document.querySelector("#_lmt_ctx")?.textContent ?? "{}"
        );
        this.#ctx = new ClientContext(ctxInit);
        return this.#ctx;
      }
      return this.#ctx;
    }

    set ctx(value) {
      // Allow setting ctx only once?
      //   if (this.#ctx instanceof Context) return;
      this.#ctx = value;
    }
  };
};
