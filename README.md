[Documentation](https://limette.dev/docs/) | [Getting started](https://limette.dev/docs/getting-started/create-a-project/)

# Limette

<img align="right" src="https://limette.dev/assets/images/logo.svg" width="200px" alt="The Limette logo: a green limette with two leaves">

Limette is a full-stack JavaScript framework for Web Components. Applications
build with Vite and run through explicit Node, Deno, or Worker adapters.

Install the framework from npm:

```sh
npm install limette lit
```

## ✨ Features

- Web Components (with Lit) on browser
- Request/Response server runtime with Node, Deno, and Worker support
- Island-based architecture
- File system routing
- Vite-powered development and production builds

## Create a new Limette project

Run this command:

```sh
npm create limette
```

The initializer creates an application using `new App().fsRoutes()`, a Vite
configuration with `limette({ app: "./app.ts" })`, and a Node or Deno
production launcher.

## Start the Vite development server

```
deno task dev
```

## Build with Vite

```
deno task build
```

## Deploy to Cloudflare Workers

Build the application with Vite, then wrap the generated request handler in
`worker-entry.js`:

```js
import handler from './dist/server/entry.js';

export default {
  fetch(request, env, ctx) {
    return handler(request, { env, ctx });
  },
};
```

Configure Wrangler to serve the Vite client build through Cloudflare Static
Assets and run the Worker for application routes:

```json
{
  "main": "./worker-entry.js",
  "compatibility_date": "2026-09-18",
  "assets": {
    "directory": "./dist/client"
  }
}
```

Matching Vite assets are served directly by Cloudflare without invoking
Limette. Application routes and missing assets fall through to the Worker. No
`ASSETS` binding, `run_worker_first`, or `nodejs_compat` flag is required.

The intended workflow is:

```sh
npm run dev
npm run build
npx wrangler dev
npx wrangler deploy
```

Use `vite dev` (normally exposed as `npm run dev`) for fast application
development. After a build, use `wrangler dev` to validate the generated
application in the actual workerd/Cloudflare environment before deploying.
Limette does not integrate `@cloudflare/vite-plugin`, so Wrangler does not
provide Limette's live Vite HMR workflow.

## Start the generated Deno production server

```
deno task start
```
