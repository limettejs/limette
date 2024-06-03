import type { Context } from "../../deps.ts";

/**
 * In-memory store of open WebSockets for
 * triggering browser refresh.
 */
export const sockets: Set<WebSocket> = new Set();
export const socketsArr: Array<WebSocket> = [];

/**
 * Upgrade a request connection to a WebSocket if the url ends with "/ws-refresh"
 */
export const refreshMiddleware = async (ctx: Context, next: Function) => {
  if (!ctx.request.url.pathname.endsWith("/ws-refresh")) {
    await next();
    return;
  }

  const searchParams = ctx.request.url.searchParams;

  if (searchParams.get("type") === "http") {
    console.log("send refresh");
    sockets.forEach((socket) => {
      socket.send("refresh");
    });
    return ctx.response;
  }

  // Websocket endpoint
  const socket = ctx.upgrade();

  // Add the new socket to our in-memory store of WebSockets.
  sockets.add(socket);
  socketsArr.push(socket);

  // Remove the socket from our in-memory store when the socket closes.
  socket.onclose = () => {
    sockets.delete(socket);
  };
};
