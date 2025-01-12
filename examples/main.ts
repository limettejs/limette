import { App } from "@limette/core";

export const app = new App();

if (import.meta.main) {
  app.listen({ port: 8000 });
}
