import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Server as SocketServer } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioLiveNativeServer,
  normalizeStudioLiveNativeRequestUrl,
  type StudioLiveNativeRuntime,
} from "./studio-live-native-server";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function listen(server: HttpServer): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function gateway() {
  const server = createServer();
  const paths: string[] = [];
  const sockets = new SocketServer(server, {
    path: "/socket.io",
    allowRequest(request, accept) {
      paths.push(request.url ?? "");
      accept(null, request.headers.origin === "http://allowed.test");
    },
  });
  const namespace = sockets.of("/studio-live");
  namespace.use((socket, next) => {
    next(socket.handshake.auth.session === "fixture-session" ? undefined : new Error("Unauthorized"));
  });
  namespace.on("connection", (socket) => {
    socket.on("checkpoint", (value: string, ack: (value: string) => void) => ack(value));
  });
  const close = vi.fn(() => new Promise<void>((resolve) => sockets.close(() => resolve())));
  return { server, close, paths, sockets };
}

function connect(origin: string, path = "/socket.io", options: { origin?: string; session?: string; reconnect?: boolean } = {}) {
  const socket = io(`${origin}/studio-live`, {
    path,
    transports: ["websocket"],
    extraHeaders: { Origin: options.origin ?? "http://allowed.test" },
    auth: { session: options.session ?? "fixture-session" },
    reconnection: options.reconnect ?? false,
    reconnectionDelay: 10,
    reconnectionDelayMax: 10,
    forceNew: true,
  });
  cleanups.push(() => { socket.close(); });
  return socket;
}

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", () => { socket.off("connect_error", reject); resolve(); });
    socket.once("connect_error", reject);
  });
}

async function host(initialize: () => Promise<StudioLiveNativeRuntime>) {
  const report = vi.fn();
  const runtime = createStudioLiveNativeServer(initialize, report);
  cleanups.push(runtime.close);
  const origin = await listen(runtime.server);
  return { ...runtime, origin, report };
}

describe("native Studio gateway HTTP server", () => {
  it("preserves Engine.IO query values across the public and Vercel destination paths", () => {
    const query = "?EIO=4&transport=websocket&t=original&path=ignored";
    expect(normalizeStudioLiveNativeRequestUrl(`/socket.io/${query}`)).toBe(`/socket.io/${query}`);
    expect(normalizeStudioLiveNativeRequestUrl(`/api/studio-live${query}`)).toBe(`/socket.io/${query}`);
    for (const value of ["/api/creator/works", "/api/studio-live/../creator", "/socket.io/other", "//socket.io", "/?path=socket.io"]) {
      expect(normalizeStudioLiveNativeRequestUrl(value)).toBeNull();
    }
  });

  it("serves an actual Engine.IO HTTP request without exposing general API routes", async () => {
    const inner = gateway();
    const initialize = vi.fn(async () => inner);
    const outer = await host(initialize);
    const denied = await fetch(`${outer.origin}/api/creator/works`);
    expect(denied.status).toBe(404);
    expect(initialize).not.toHaveBeenCalled();
    const response = await fetch(`${outer.origin}/api/studio-live?EIO=4&transport=polling`, {
      headers: { Origin: "http://allowed.test" },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/^0\{"sid":/u);
    expect(inner.paths).toEqual(["/socket.io/?EIO=4&transport=polling"]);
  });

  it("waits for one initialization then upgrades concurrent real clients on both rewrite paths", async () => {
    const inner = gateway();
    const deferred = Promise.withResolvers<StudioLiveNativeRuntime>();
    const initialize = vi.fn(() => deferred.promise);
    const outer = await host(initialize);
    const first = connect(outer.origin);
    const second = connect(outer.origin, "/api/studio-live");
    const connections = Promise.all([connected(first), connected(second)]);
    await vi.waitFor(() => expect(initialize).toHaveBeenCalledOnce());
    expect(first.connected).toBe(false);
    expect(second.connected).toBe(false);
    deferred.resolve(inner);
    await connections;
    expect(await first.timeout(1000).emitWithAck("checkpoint", "first")).toBe("first");
    expect(await second.timeout(1000).emitWithAck("checkpoint", "second")).toBe("second");
    expect(inner.paths).toHaveLength(2);
    expect(inner.paths.every((path) => path.startsWith("/socket.io/?EIO=4&transport=websocket"))).toBe(true);
    expect(outer.report).not.toHaveBeenCalled();
  });

  it("keeps gateway Origin and namespace authentication decisions on the real upgrade", async () => {
    const inner = gateway();
    const outer = await host(async () => inner);
    await expect(connected(connect(outer.origin, "/socket.io", { origin: "http://untrusted.test" }))).rejects.toThrow();
    await expect(connected(connect(outer.origin, "/api/studio-live", { session: "wrong" }))).rejects.toThrow("Unauthorized");
    expect(inner.sockets.of("/studio-live").sockets.size).toBe(0);
    const valid = connect(outer.origin);
    await connected(valid);
    expect(await valid.timeout(1000).emitWithAck("checkpoint", "authorized")).toBe("authorized");
  });

  it("accepts a new connection after the prior transport closes without reinitializing authority", async () => {
    const inner = gateway();
    const initialize = vi.fn(async () => inner);
    const outer = await host(initialize);
    const first = connect(outer.origin);
    await connected(first);
    first.close();
    const second = connect(outer.origin);
    await connected(second);
    expect(await second.timeout(1000).emitWithAck("checkpoint", "retry")).toBe("retry");
    expect(initialize).toHaveBeenCalledOnce();
    expect(inner.close).not.toHaveBeenCalled();
  });

  it("automatically reconnects and exchanges real acknowledgements after server-side transport expiry", async () => {
    const inner = gateway();
    const outer = await host(async () => inner);
    const client = connect(outer.origin, "/socket.io", { reconnect: true });
    await connected(client);
    const firstId = client.id;
    const reconnected = connected(client);
    for (const socket of inner.sockets.of("/studio-live").sockets.values()) socket.conn.close();
    await reconnected;
    expect(client.id).not.toBe(firstId);
    expect(await client.timeout(1000).emitWithAck("checkpoint", "after-expiry")).toBe("after-expiry");
    expect(inner.close).not.toHaveBeenCalled();
  });

  it("fails closed after initialization rejection and never sends error details to the caller", async () => {
    const initialize = vi.fn(async (): Promise<StudioLiveNativeRuntime> => {
      throw new Error("fixture-database-secret");
    });
    const outer = await host(initialize);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${outer.origin}/socket.io/?EIO=4&transport=polling`);
      expect(response.status).toBe(503);
      expect(await response.text()).toBe("");
    }
    await expect(connected(connect(outer.origin))).rejects.toThrow();
    expect(initialize).toHaveBeenCalledOnce();
  });

  it("destroys a pending upgrade on shutdown and disposes a late initialization exactly once", async () => {
    const inner = gateway();
    const upgrade = vi.fn();
    inner.server.on("upgrade", upgrade);
    const deferred = Promise.withResolvers<StudioLiveNativeRuntime>();
    const initialize = vi.fn(() => deferred.promise);
    const outer = await host(initialize);
    const connection = connected(connect(outer.origin)).catch(() => undefined);
    await vi.waitFor(() => expect(initialize).toHaveBeenCalledOnce());
    const closing = outer.close();
    deferred.resolve(inner);
    await closing;
    await connection;
    await outer.close();
    expect(upgrade).not.toHaveBeenCalled();
    expect(inner.close).toHaveBeenCalledOnce();
    expect(outer.server.listening).toBe(false);
  });

  it("closes active WebSockets, the HTTP listener and runtime resources exactly once", async () => {
    const inner = gateway();
    const outer = await host(async () => inner);
    const client = connect(outer.origin);
    await connected(client);
    const disconnected = new Promise<void>((resolve) => client.once("disconnect", () => resolve()));
    await outer.close();
    await disconnected;
    await outer.close();
    expect(inner.close).toHaveBeenCalledOnce();
    expect(outer.server.listening).toBe(false);
    expect(client.connected).toBe(false);
  });
});
