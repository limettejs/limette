import { LitElement as LitElementOriginal } from "lit";

export const IslandMixin = (ctx) =>
  class Island extends LitElementOriginal {
    constructor() {
      super();
      this.ctx = ctx;
    }
  };
