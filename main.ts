import { Application } from "jsr:@oak/oak/application";

import { staticMiddleware } from "./limette/utils.ts";
import { router } from "./limette/router.ts";

const app = new Application();

app.use(staticMiddleware);

app.use(router.routes());
app.use(router.allowedMethods());

app.listen({ port: 1995 });
console.log("Server started on: http://localhost:1995");
