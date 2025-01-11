export { default as esbuild } from "npm:esbuild@0.24.2";
export { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.11.1";
export { parseImports } from "npm:parse-imports@2.2.1";

export { DOMParser } from "jsr:@b-fuze/deno-dom@0.1.49";

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
export { walk, emptyDir, ensureFile, exists } from "jsr:@std/fs@1.0.9";
export { encodeHex } from "jsr:@std/encoding@1.0.6/hex";
export { serveDir } from "jsr:@std/http@1.0.12/file-server";

// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
export { unsafeHTML } from "lit/directives/unsafe-html.js";
export { html, render } from "npm:@lit-labs/ssr@3.3.0";
export { collectResult } from "npm:@lit-labs/ssr@3.3.0/lib/render-result.js";
export { installWindowOnGlobal } from "npm:@lit-labs/ssr@3.3.0/lib/dom-shim.js";
export { LitElementRenderer } from "npm:@lit-labs/ssr@3.3.0/lib/lit-element-renderer.js";
export type { RenderInfo, RenderResult } from "npm:@lit-labs/ssr@3.3.0";
