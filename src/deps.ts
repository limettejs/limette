export { Application } from "jsr:@oak/oak@17.1.3/application";
export { Router } from "jsr:@oak/oak@17.1.3/router";
export { send } from "jsr:@oak/oak@17.1.3";
export type { RouterContext } from "jsr:@oak/oak@17.1.3/router";
export type {
  Context,
  Response as OakResponse,
  Request as OakRequest,
  Middleware,
} from "jsr:@oak/oak@17.1.3";

export { default as esbuild } from "npm:esbuild@0.24.0";
export { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.11.0";
export { parseImports } from "npm:parse-imports@2.2.1";

export { DOMParser } from "jsr:@b-fuze/deno-dom@0.1.48";

export { walk } from "jsr:@std/fs@1.0.5/walk";
export {
  parse,
  join,
  isAbsolute,
  dirname,
  toFileUrl,
  resolve,
  normalize,
  SEPARATOR,
} from "jsr:@std/path@1.0.8";
export { emptyDir } from "jsr:@std/fs@1.0.5/empty-dir";
export { ensureFile } from "jsr:@std/fs@1.0.5/ensure-file";
export { encodeHex } from "jsr:@std/encoding@1.0.5/hex";

// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
export { unsafeHTML } from "lit/directives/unsafe-html.js";
export { html, render } from "npm:@lit-labs/ssr@3.2.2";
export { collectResult } from "npm:@lit-labs/ssr@3.2.2/lib/render-result.js";
export { installWindowOnGlobal } from "npm:@lit-labs/ssr@3.2.2/lib/dom-shim.js";
export { LitElementRenderer } from "npm:@lit-labs/ssr@3.2.2/lib/lit-element-renderer.js";
export type { RenderInfo, RenderResult } from "npm:@lit-labs/ssr@3.2.2";
