import { ensureDir } from "@std/fs/ensure-dir";

const LIMETTE_VERSION = "0.0.2";

const projectName = prompt("Your project name?");

const projectPath = `${Deno.cwd()}/${projectName}`;
const islandsPath = `${projectPath}/islands`;
const routesPath = `${projectPath}/routes`;
const staticPath = `${projectPath}/static`;

// root folder
await ensureDir(projectPath);
// islands folder
await ensureDir(islandsPath);
// routes folder
await ensureDir(routesPath);
// static folder
await ensureDir(staticPath);

const denoJson = `
{
  "tasks": {
    "start": "deno run -A --watch=static/,routes/ main.ts",
    "build": "deno run -A dev.ts build",
    "preview": "deno run -A --watch main.ts"
  },
  "imports": {
    "limette": "jsr:@limette/core@${LIMETTE_VERSION}",
    "/lit": "npm:/lit@^3.1.2/",
    "lit": "npm:lit@^3.1.2",
    "tailwindcss": "npm:tailwindcss@^3.4.7"
  },
  "fmt": {
    "singleQuote": true
  },
  "lock": false
}
`;

const devTs = `
import { dev } from "limette";

await dev();
`;

const mainTs = `
/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import { LimetteApp } from "limette";

const app = new LimetteApp();

app.listen({ port: 1995 });
console.log("Server started on: http://localhost:1995");
`;

const counterIslandTs = `
import { LitElement, html, css } from "lit";

export class Counter extends LitElement {
  static styles = css\`
    div {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    span {
      color: rebeccapurple;
    }

    p {
      font-family: sans-serif;
      margin: 0;
      padding: 0 10px;
    }
  \`;

  static properties = {
    name: {},
    count: { type: Number },
  };

  constructor() {
    super();
    this.name = "Somebody";
    this.count = 0;
  }

  render() {
    return html\`
      <div class="border-solid border-2 border-indigo-600 rounded-md">
        <h1 class="bg-lime-600">Hello, <span>\${this.name}</span>!</h1>
        <section class="flex items-center">
          <button
            type="button"
            class="rounded-full bg-indigo-600 p-1.5 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            @click=\${() => this.count--}
          >
            -
          </button>
          <p class="text-blue-600/100">Count: \${this.count}</p>

          <button
            type="button"
            class="rounded-full bg-indigo-600 p-1.5 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            @click=\${() => this.count++}
          >
            +
          </button>
        </section>

        <island-bar
          class="mt-5"
          @change-name=\${() => (this.name = "Ingrid")}
        ></island-bar>
      </div>
    \`;
  }
}

customElements.define("island-counter", Counter);
`;

const indexRouteTs = `
import { LitElement, html } from "lit";
import "../islands/counter.ts";

export default class Home extends LitElement {
  render() {
    return html\`
      <section class="p-6">
        <h1>Home</h1>
        <p class="text-2xl font-bold text-blue-600/100">SSR content</p>
        <is-land><island-counter name="Iris"></island-counter></is-land>

        <section>
          <a href="/foo/bar">To foo/bar</a> | <a href="/foo-123">To params</a> |
          <a href="/no-js">To no js</a>
        </section>
      </section>
    \`;
  }
}
`;

const tailwindStyleCSS = `
@tailwind base;
@tailwind components;
@tailwind utilities;
`;

Deno.writeTextFileSync(projectPath + "/deno.json", denoJson);
Deno.writeTextFileSync(projectPath + "/dev.ts", devTs);
Deno.writeTextFileSync(projectPath + "/main.ts", mainTs);
Deno.writeTextFileSync(projectPath + "/islands/counter.ts", counterIslandTs);
Deno.writeTextFileSync(projectPath + "/routes/index.ts", indexRouteTs);
Deno.writeTextFileSync(projectPath + "/static/tailwind.css", tailwindStyleCSS);
