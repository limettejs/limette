import { html } from "@lit-labs/ssr";
import { LitElement } from "lit";
import { ScopedElementsMixin } from "@open-wc/scoped-elements";
import "./is-island.js";

import { Home } from "../routes/index.js";

class Root extends LitElement {
  render() {
    return html` <lmt-home></lmt-home> `;
  }
}

customElements.define("lmt-root", Root);
customElements.define("lmt-home", Home);

export function bootstrapContent() {
  return html` <html>
    <head>
      <title>Limette</title>
    </head>
    <body>
      <lmt-home></lmt-home>
      <script type="importmap">
        {
          "imports": {
            "lit": "https://esm.sh/lit@3.1.2",
            "@lit-labs/ssr": "https://esm.sh/@lit-labs/ssr@3.2.2"
          }
        }
      </script>
      <!-- <script
        type="module"
        src="https://esm.sh/@lit-labs/ssr-client@1.1.7/lit-element-hydrate-support.js"
      ></script>
      <script type="module" defer src="./islands/greeter.js"></script> -->
      <script type="module" src="./bundle.js"></script>
    </body>
  </html>`;
}
