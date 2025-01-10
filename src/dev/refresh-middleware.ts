import type { Context } from "../router/app.ts";

/**
 * In-memory store of open WebSockets for
 * triggering browser refresh.
 */
export const sockets: Set<WebSocket> = new Set();
export const socketsArr: Array<WebSocket> = [];

/**
 * Upgrade a request connection to a WebSocket if the url ends with "/ws-refresh"
 */
export async function refreshMiddleware(ctx: Context) {
  if (!ctx.url.pathname.endsWith("/ws-refresh")) {
    return await ctx.next();
  }

  const searchParams = ctx.url.searchParams;

  if (searchParams.get("type") === "http") {
    console.log("send refresh");
    sockets.forEach((socket) => {
      socket.send("refresh");
    });
    return new Response(null, { status: 204 });
  }

  // Websocket endpoint
  const { socket, response } = Deno.upgradeWebSocket(ctx.request);

  // Add the new socket to our in-memory store of WebSockets.
  sockets.add(socket);
  socketsArr.push(socket);

  // Remove the socket from our in-memory store when the socket closes.
  socket.onclose = () => {
    sockets.delete(socket);
  };

  return response;
}
