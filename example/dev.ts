import { LimetteApp } from "$limette/server/app.ts";

const app = new LimetteApp();

app.listen({ port: 1995 });
console.log("Server started on: http://localhost:1995");
