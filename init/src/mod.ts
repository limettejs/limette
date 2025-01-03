import { ensureDir } from "@std/fs/ensure-dir";

// This value is changed in the release pipeline
const LIMETTE_VERSION = "0.0.18";

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

const gitignore = `
# dotenv environment variable files
.env

# Limette build directory
_limette/
`;

const denoJson = `
{
  "tasks": {
    "dev": "deno run -A --watch=static/,routes/ dev.ts",
    "build": "deno run -A dev.ts build",
    "start": "deno run -A main.ts"
  },
  "imports": {
    "@limette/core": "jsr:@limette/core@${LIMETTE_VERSION}",
    "/lit": "npm:/lit@^3.2.1/",
    "lit": "npm:lit@^3.2.1",
    "tailwindcss": "npm:tailwindcss@^3.4.17"
  },
  "fmt": {
    "singleQuote": true
  },
  "lock": false
}
`;

const devTs = `
import { dev } from "@limette/core";
import { app } from "./main.ts";

await dev(app);
`;

const mainTs = `
import { LimetteApp } from "@limette/core";

export const app = new LimetteApp();

app.setLoadFs((path: string) => import(\`./\${path}\`));

if (import.meta.main) {
  app.listen({ port: 8000 });
}
`;

const counterIslandTs = `
import { LitElement, html, css } from "lit";

export class Counter extends LitElement {
  static styles = css\`
    :host {
      display: block;
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
      <div class="p-4 border-solid border-2 border-lime-600 rounded-md">
        <h2 class="pb-4">
          Hello,
          <span class="bg-lime-400 px-2 py-1 rounded-md">\${this.name}</span>
        </h2>
        <section class="flex justify-center items-center">
          <button
            type="button"
            class="rounded-full bg-indigo-600 p-1.5 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            @click=\${() => this.count--}
          >
            -
          </button>
          <p class="px-2">Count: \${this.count}</p>

          <button
            type="button"
            class="rounded-full bg-indigo-600 p-1.5 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            @click=\${() => this.count++}
          >
            +
          </button>
        </section>
      </div>
    \`;
  }
}

customElements.define("island-counter", Counter);
`;

const _appRouteTs = `
import { LitElement, html } from "lit";
import type { AppRootOptions } from "@limette/core";

export default class App extends LitElement {
  render(app: AppRootOptions) {
    return html\`<html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Limette</title>
        \${app.css}
      </head>
      <body>
        \${app.component}
        <!-- -->
        \${app.js}
      </body>
    </html>\`;
  }
}
`;

const indexRouteTs = `
import { LitElement, html } from "lit";
import "../islands/counter.ts";

export default class Home extends LitElement {
  render() {
    return html\`
      <section class="flex items-center flex-col text-center pt-8">
        <h1 class="text-3xl font-bold text-lime-600 pb-4">Limette</h1>
        <div class="max-w-screen-sm">
          <p class="pb-6">This is SSR content.</p>
          <island-counter name="Iris"></island-counter>

          <section class="pt-5">
            <a href="/foo" class="text-indigo-600 underline">To foo</a>
          </section>
        </div>
      </section>
    \`;
  }
}
`;

const fooRouteTs = `
import { LitElement, html } from "lit";
import type { Handlers } from "@limette/core";

export const handler: Handlers = {
  POST(_ctx) {
    return new Response(\`Response for POST request!\`);
  },
};

export default class Foo extends LitElement {
  render() {
    return html\`
      <lmt-head>
        <title>Foo</title>
      </lmt-head>
      <section class="flex items-center flex-col text-center pt-8">
        <h1 class="text-3xl font-bold text-lime-600 pb-4">Limette</h1>
        <div class="max-w-screen-sm">
          <p class="pb-6">Foo page.</p>
          <section>
            <a href="/" class="text-indigo-600 underline">To home</a>
          </section>
        </div>
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

Deno.writeTextFileSync(projectPath + "/.gitignore", gitignore);
Deno.writeTextFileSync(projectPath + "/deno.json", denoJson);
Deno.writeTextFileSync(projectPath + "/dev.ts", devTs);
Deno.writeTextFileSync(projectPath + "/main.ts", mainTs);
Deno.writeTextFileSync(projectPath + "/islands/counter.ts", counterIslandTs);
Deno.writeTextFileSync(projectPath + "/routes/_app.ts", _appRouteTs);
Deno.writeTextFileSync(projectPath + "/routes/index.ts", indexRouteTs);
Deno.writeTextFileSync(projectPath + "/routes/foo.ts", fooRouteTs);
Deno.writeTextFileSync(projectPath + "/static/tailwind.css", tailwindStyleCSS);
