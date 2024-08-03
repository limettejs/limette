import { LimetteApp } from "../src/server/app.ts";

const app = new LimetteApp();

app.listen({ port: 1995 });
console.log("Limette app started on: http://localhost:1995");
