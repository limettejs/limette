import { LimetteApp } from "@limette/core";

export const app = new LimetteApp();

if (import.meta.main) {
  app.listen({ port: 8000 });
}
