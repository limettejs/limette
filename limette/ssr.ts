// import { html } from "@lit-labs/ssr";
import { html } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import "./is-island.js";

import Home from "../routes/index.js";

export function bootstrapContent() {
  const component = registerComponent(Home);

  return html` <html>
    <head>
      <title>Limette</title>
    </head>
    <body>
      <!-- <lmt-home></lmt-home> -->
      ${unsafeHTML(component)}
      <script type="importmap">
        {
          "imports": {
            "lit": "https://esm.sh/lit@3.1.2",
            "@lit-labs/ssr__s": "https://esm.sh/@lit-labs/ssr@3.2.2"
          }
        }
      </script>
      <!-- <script
        type="module"
        src="https://esm.sh/@lit-labs/ssr-client@1.1.7/lit-element-hydrate-support.js"
      ></script> -->
      <script type="module" src="./dist/bundle.js"></script>
      <!-- <script type="module" src="./bundle.js"></script> -->
    </body>
  </html>`;
}

function registerComponent(component) {
  const name = component?.name?.toLowerCase?.();
  if (!customElements.get(`lmt-${name}`)) {
    customElements.define(`lmt-${name}`, component);
  }

  return `<lmt-${name}></lmt-${name}>`;
}
