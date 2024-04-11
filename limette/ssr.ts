// import { html } from "@lit-labs/ssr";
import { html } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import "./is-land.ts";

export async function bootstrapContent(route) {
  const compoentModule = await import(route.filePath);
  const component = registerComponent(compoentModule.default, route.path);

  return html` <html>
    <head>
      <title>Limette</title>
    </head>
    <body>
      ${unsafeHTML(component)}
      ${route.bundlePath
        ? html`<script type="module" src="${route.bundlePath}"></script>`
        : ``}
    </body>
  </html>`;
}

function registerComponent(module, path) {
  // TODO: Needs a better approach
  let name = path.substring(1);
  name = name === "" ? "index" : name.replaceAll("/", "-")?.toLowerCase();

  if (!customElements.get(`lmt-${name}`)) {
    customElements.define(`lmt-${name}`, module);
  } else {
    // check if it is the same class
  }

  return `<lmt-${name}></lmt-${name}>`;
}
