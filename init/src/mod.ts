import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { green, red } from "@std/fmt/colors";

// This value is changed in the release pipeline
const LIMETTE_VERSION = "0.2.0";

const LIT_VERSION = "3.2.1";
const TAILWIND_VERSION = "4.0.0";

const projectName = prompt("Your project name?");
if (typeof projectName !== "string" || projectName?.length < 1) {
  console.log(`${red("Error:")} Invalid project name!`);
  Deno.exit();
}
const enableTailwind = confirm("Do you want to use Tailwind?");

const projectPath = join(Deno.cwd(), projectName as string);
const islandsPath = join(projectPath, "islands");
const routesPath = join(projectPath, "routes");
const staticPath = join(projectPath, "static");

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

node_modules

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
    ${
      enableTailwind
        ? `"@tailwindcss/cli": "npm:@tailwindcss/cli@^${TAILWIND_VERSION}",`
        : ``
    }
    "/lit": "npm:/lit@^${LIT_VERSION}/",
    "lit": "npm:lit@^${LIT_VERSION}"${
  enableTailwind
    ? `,
    "tailwindcss": "npm:tailwindcss@^${TAILWIND_VERSION}"`
    : ``
}
  },
  "compilerOptions": {
    "lib": [
      "dom",
      "dom.iterable",
      "dom.asynciterable",
      "deno.ns",
      "deno.unstable"
    ]
  },
  "fmt": {
    "singleQuote": true
  },
  "nodeModulesDir": "auto",
  "lock": false
}
`;

const devTs = `
${enableTailwind ? `import { tailwind } from "@limette/core";` : ``}
import { Builder } from "@limette/core/dev";
import { app } from "./main.ts";

const builder = new Builder();
${enableTailwind ? `tailwind(app);` : ``}
if (Deno.args.includes("build")) {
  await builder.build(app);
} else {
  await builder.listen(app);
}
`;

const mainTs = `
import { App, staticFiles, fsRoutes } from "@limette/core";

export const app = new App();

app.use(staticFiles);

fsRoutes(app, {
  loadFile: (path: string) => import(\`./\${path}\`),
});

if (import.meta.main) {
  app.listen();
}
`;

const counterIslandTs = `
import { LitElement, html, css } from "lit";

export class Counter extends LitElement {
  declare count: number;
  declare name: string;

  static override styles = css\`
    :host {
      display: block;
      border: 2px solid green;
      padding: 8px;
    }
    section {
      display: flex;
      justify-content: space-between;
    }
  \`;

  static override properties = {
    name: { type: String },
    count: { type: Number },
  };

  constructor() {
    super();
    this.name = "Somebody";
    this.count = 0;
  }

  override render() {
    return html\`
      <div>
        <h2>Hello,<span>\${this.name}</span></h2>
        <section>
          <button type="button" @click=\${() => this.count--}>-</button>
          <p>Count: \${this.count}</p>
          <button type="button" @click=\${() => this.count++}>+</button>
        </section>
      </div>
    \`;
  }
}

customElements.define("island-counter", Counter);
`;

const counterIslandTsTailwind = `
import { LitElement, html, css } from "lit";

export class Counter extends LitElement {
  declare count: number;
  declare name: string;

  static override styles = css\`
    :host {
      display: block;
    }
  \`;

  static override properties = {
    name: { type: String },
    count: { type: Number },
  };

  constructor() {
    super();
    this.name = "Somebody";
    this.count = 0;
  }

  override render() {
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
import type { AppWrapperOptions } from "@limette/core";

export default class App extends LitElement {
  override render(app: AppWrapperOptions) {
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
import { LitElement, html, css } from "lit";
import "../islands/counter.ts";

export default class Home extends LitElement {
  static override styles = css\`
    .container {
      display: flex;
      align-items: center;
      flex-direction: column;
      text-align: center;
      padding-top: 24px;
      font-family: sans-serif;
    }
    .content {
      max-width: 320px;
    }
  \`;

  override render() {
    return html\`
      <section class="container">
        <h1>Limette</h1>
        <div class="content">
          <p>This is SSR content.</p>
          <island-counter name="Iris"></island-counter>
          <section>
            <a href="/foo">To foo</a>
          </section>
        </div>
      </section>
    \`;
  }
}
`;

const indexRouteTsTailwind = `
import { LitElement, html } from "lit";
import "../islands/counter.ts";

export default class Home extends LitElement {
  override render() {
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
import { LitElement, html, css } from "lit";
import type { Handlers } from "@limette/core";

export const handler: Handlers = {
  POST(_ctx) {
    return new Response('Response for POST request!');
  },
};

export default class Foo extends LitElement {
  static override styles = css\`
    .container {
      font-family: sans-serif;
      display: flex;
      align-items: center;
      flex-direction: column;
      text-align: center;
      padding-top: 24px;
    }
    .content {
      max-width: 320px;
    }
  \`;
  override render() {
    return html\`
      <lmt-head>
        <title>Foo</title>
      </lmt-head>
      <section class="container">
        <h1>Limette</h1>
        <div class="content">
          <p>Foo page.</p>
          <section>
            <a href="/">To home</a>
          </section>
        </div>
      </section>
    \`;
  }
}
`;

const fooRouteTsTailwind = `
import { LitElement, html } from "lit";
import type { Handlers } from "@limette/core";

export const handler: Handlers = {
  POST(_ctx) {
    return new Response('Response for POST request!');
  },
};

export default class Foo extends LitElement {
  override render() {
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

const tailwindStyleCSS = `@import "tailwindcss";`;

function removeEmptyLines(content: string) {
  return content
    .split("\n")
    .filter((line: string) => line.trim() !== "")
    .join("\n");
}

Deno.writeTextFileSync(join(projectPath, ".gitignore"), gitignore);
Deno.writeTextFileSync(
  join(projectPath, "deno.json"),
  removeEmptyLines(denoJson)
);
Deno.writeTextFileSync(join(projectPath, "dev.ts"), devTs);
Deno.writeTextFileSync(join(projectPath, "main.ts"), mainTs);
Deno.writeTextFileSync(
  join(projectPath, "islands/counter.ts"),
  enableTailwind ? counterIslandTsTailwind : counterIslandTs
);
Deno.writeTextFileSync(join(projectPath, "routes/_app.ts"), _appRouteTs);
Deno.writeTextFileSync(
  join(projectPath, "routes/index.ts"),
  enableTailwind ? indexRouteTsTailwind : indexRouteTs
);
Deno.writeTextFileSync(
  join(projectPath, "routes/foo.ts"),
  enableTailwind ? fooRouteTsTailwind : fooRouteTs
);
enableTailwind &&
  Deno.writeTextFileSync(
    projectPath + "/static/tailwind.css",
    tailwindStyleCSS
  );

// Install dependencies
const command = new Deno.Command("deno", {
  args: [
    "install",
    "--allow-scripts",
    "--config",
    join(projectName as string, "deno.json"),
  ],
  stdout: "piped",
  stderr: "piped",
});

await command.output();

console.log(`${green("Your project is ready!")} 🎉`);
