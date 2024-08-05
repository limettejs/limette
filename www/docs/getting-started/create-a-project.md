---
category: Getting started
title: Create a project
---

To create a Limette project, you can use the Limette creation tool.

Run this in your terminal:

```bash
deno run -Ar jsr:@limette/init
cd limette-project
deno task start
```

This will create two folders:

- **routes/**: This folder contains all the routes of your app. These pages are server side rendered.

- **islands/**: This folder contains all the islands. These components are server side rendered and hydrated on the browser.
