import { createServer, type Server } from "node:http";
import type { Duplex } from "node:stream";

export interface StudioLiveNativeRuntime {
  server: Server;
  close(): Promise<void>;
}

/** Vercel may forward either the public rewrite path or the function destination. */
export function normalizeStudioLiveNativeRequestUrl(value: string): string | null {
  const queryStart = value.indexOf("?");
  const pathname = queryStart < 0 ? value : value.slice(0, queryStart);
  if (pathname === "/socket.io" || pathname === "/socket.io/") return value;
  if (pathname === "/api/studio-live" || pathname === "/api/studio-live/") {
    return `/socket.io/${queryStart < 0 ? "" : value.slice(queryStart)}`;
  }
  return null;
}

/** Export a real HTTP server immediately; admit traffic only after the gateway is ready. */
export function createStudioLiveNativeServer(
  initialize: () => Promise<StudioLiveNativeRuntime>,
  reportFailure: (error: unknown) => void,
): StudioLiveNativeRuntime {
  let initialization: Promise<StudioLiveNativeRuntime> | null = null;
  let closing: Promise<void> | null = null;
  let closed = false;
  const connections = new Set<Duplex>();

  function ready(): Promise<StudioLiveNativeRuntime> {
    // A failed cold start stays failed. A new function instance must retry with fresh resources.
    initialization ??= Promise.resolve().then(initialize);
    return initialization;
  }

  const server = createServer((request, response) => {
    const url = normalizeStudioLiveNativeRequestUrl(request.url ?? "");
    if (!url || closed) {
      response.writeHead(closed ? 503 : 404, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    request.url = url;
    ready().then((runtime) => {
      if (closed || response.destroyed) {
        response.destroy();
        return;
      }
      runtime.server.emit("request", request, response);
    }).catch((error: unknown) => {
      reportFailure(error);
      if (!response.headersSent) {
        response.writeHead(503, { "Cache-Control": "no-store", Connection: "close" });
        response.end();
      } else {
        response.destroy();
      }
    });
  });
  server.on("connection", (socket) => {
    connections.add(socket);
    socket.once("close", () => { connections.delete(socket); });
  });

  server.on("upgrade", (request, socket, head) => {
    const url = normalizeStudioLiveNativeRequestUrl(request.url ?? "");
    if (!url || closed) {
      socket.end(`HTTP/1.1 ${closed ? "503 Service Unavailable" : "404 Not Found"}\r\nConnection: close\r\n\r\n`);
      return;
    }
    request.url = url;
    socket.pause();
    let transferred = false;
    const failed = (): void => { socket.destroy(); };
    const discard = (): void => {
      socket.off("close", discard);
      socket.off("error", failed);
    };
    socket.once("close", discard);
    // A peer can disconnect while PostgreSQL preflight is still initializing the gateway.
    socket.once("error", failed);
    ready().then((runtime) => {
      if (closed || socket.destroyed) {
        socket.destroy();
        return;
      }
      if (!runtime.server.emit("upgrade", request, socket, head)) {
        throw new Error("Studio live gateway has no upgrade listener");
      }
      transferred = true;
      // ws attaches its receiver but does not resume a stream paused by this cold-start gate.
      socket.resume();
    }).catch((error: unknown) => {
      reportFailure(error);
      if (!socket.destroyed) {
        socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      }
    }).finally(() => {
      // A rejected upgrade still owns its error handler until the peer socket closes.
      if (transferred || socket.destroyed) discard();
    });
  });

  function close(): Promise<void> {
    closed = true;
    for (const socket of connections) socket.destroy();
    connections.clear();
    closing ??= (async () => {
      // Initialization owns partial-resource cleanup if it rejects.
      const runtime = await initialization?.catch(() => null);
      try {
        await runtime?.close();
      } finally {
        if (server.listening) {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => { if (error) reject(error); else resolve(); });
          });
        }
      }
    })();
    return closing;
  }
  server.once("close", () => { close().catch(reportFailure); });
  return { server, close };
}
