# AGENTS.md

## Project overview

This repository contains a custom full-stack framework built with Deno and Lit.
It uses Web Components, server-side rendering, file-based routing, and an islands architecture.

The framework is conceptually similar to Deno Fresh or Next.js, but it uses Lit Web Components instead of Preact/React.

## Core concepts

### Routes

Files inside `/routes` define pages. A route file exports a Lit-based Web Component or route handler used by the server renderer.

### Islands

Files inside `/islands` are client-side interactive components.
During SSR, islands should be detected and rendered with hydration metadata so they can be loaded on the client.

Islands can be loaded from any path that includes /islands, including importmap.

Do not convert islands to React/Preact. Islands are Lit/Web Components.

## Important directories

- `/src/plugins` - built-in plugins
- `/src/runtime` - client-side framework runtime
- `/src/server` - server-side logic

## Coding conventions

- Use TypeScript or JavaScript according to the surrounding file.
- Prefer Web Platform APIs and Deno-native APIs.
- Prefer Lit and Web Components. Do not introduce React, Preact, Next.js, Express, or Node-only dependencies unless explicitly requested.
- Keep public APIs backward compatible unless the task explicitly asks for a breaking change.
- Follow existing naming and file structure.
- Add or update tests for framework behavior.
- When changing SSR behavior, check both server-rendered HTML and client hydration behavior.

## Commands

Use these commands when relevant:

```bash
deno task dev
deno task build
deno task start
```
