import { createServer, type Server as HttpServer } from "node:http";

import { io as createSocketClient, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  StudioLivePostgresIoAdapter,
  createStudioLivePostgresIoAdapter,
} from "./studio-postgres-io.adapter";

import type { INestApplicationContext } from "@nestjs/common";
import type { AddressInfo } from "node:net";
import type { Namespace, Server as SocketIoServer } from "socket.io";

const INTEGRATION_URL = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !INTEGRATION_URL) {
  throw new Error(
    "CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL; the two-node realtime gate cannot be skipped"
  );
}
const describeWithDirectPostgres = INTEGRATION_URL ? describe : describe.skip;
const SOCKET_PATH = "/socket.io";
const SOCKET_NAMESPACE = "/studio-live";
const ROOM = "studio-live:integration-work";

function silentLogger() {
  return { error: () => undefined, log: () => undefined };
}

function listen(server: HttpServer): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function waitForClientEvent<T>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 5_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, receive);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const receive = (value: T): void => {
      clearTimeout(timeout);
      socket.off(event, receive);
      resolve(value);
    };
    socket.on(event, receive);
  });
}

function connectClient(port: number): ClientSocket {
  return createSocketClient(`http://127.0.0.1:${port}${SOCKET_NAMESPACE}`, {
    path: SOCKET_PATH,
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
}

async function waitForClusterSockets(
  namespace: Namespace,
  expected: number,
  timeoutMs = 15_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;
  while (Date.now() < deadline) {
    const sockets = await namespace.in(ROOM).fetchSockets();
    lastCount = sockets.length;
    if (lastCount === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`cluster socket discovery reached ${lastCount}, expected ${expected}`);
}

// This test intentionally does not reuse DATABASE_URL. It runs only when a caller supplies a
// LISTEN-capable direct test database and has applied 0009_socket_io_postgres_adapter.sql.
describeWithDirectPostgres("Studio live PostgreSQL adapter two-node integration", () => {
  let adapterA: StudioLivePostgresIoAdapter | null = null;
  let adapterB: StudioLivePostgresIoAdapter | null = null;
  let ioA: SocketIoServer | null = null;
  let ioB: SocketIoServer | null = null;
  let namespaceA: Namespace;
  let namespaceB: Namespace;
  let clientA: ClientSocket | null = null;
  let clientB: ClientSocket | null = null;
  let portA = 0;
  let portB = 0;

  beforeAll(async () => {
    if (!INTEGRATION_URL) throw new Error("integration URL was not provided");

    const httpA = createServer();
    const httpB = createServer();
    adapterA = await createStudioLivePostgresIoAdapter(
      httpA as unknown as INestApplicationContext,
      {
        NODE_ENV: "test",
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: INTEGRATION_URL,
        STUDIO_LIVE_POSTGRES_POOL_MAX: "2",
      },
      { logger: silentLogger() }
    );
    adapterB = await createStudioLivePostgresIoAdapter(
      httpB as unknown as INestApplicationContext,
      {
        NODE_ENV: "test",
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: INTEGRATION_URL,
        STUDIO_LIVE_POSTGRES_POOL_MAX: "2",
      },
      { logger: silentLogger() }
    );
    if (!adapterA || !adapterB) throw new Error("integration adapters were not created");
    ioA = adapterA.createIOServer(0, { path: SOCKET_PATH, transports: ["websocket"] });
    ioB = adapterB.createIOServer(0, { path: SOCKET_PATH, transports: ["websocket"] });
    namespaceA = ioA.of(SOCKET_NAMESPACE);
    namespaceB = ioB.of(SOCKET_NAMESPACE);
    namespaceA.on("connection", (socket) => {
      void socket.join(ROOM);
    });
    namespaceB.on("connection", (socket) => {
      void socket.join(ROOM);
    });
    portA = await listen(httpA);
    portB = await listen(httpB);

    clientA = connectClient(portA);
    clientB = connectClient(portB);
    await Promise.all([
      waitForClientEvent(clientA, "connect"),
      waitForClientEvent(clientB, "connect"),
    ]);
    await waitForClusterSockets(namespaceA, 2);
  }, 30_000);

  afterAll(async () => {
    clientA?.disconnect();
    clientB?.disconnect();
    const closing: Array<Promise<void>> = [];
    if (adapterA && ioA) closing.push(adapterA.close(ioA));
    else if (adapterA) closing.push(adapterA.disposePool());
    if (adapterB && ioB) closing.push(adapterB.close(ioB));
    else if (adapterB) closing.push(adapterB.disposePool());
    await Promise.all(closing);
  });

  it("broadcasts small and attachment-backed CRDT packets and supports discovery/RPC", async () => {
    if (!clientB) throw new Error("integration client was not connected");

    let smallCount = 0;
    clientB.on("integration:small", () => {
      smallCount += 1;
    });
    const small = waitForClientEvent<{ updateId: string }>(clientB, "integration:small");
    namespaceA.to(ROOM).emit("integration:small", { updateId: "small-update" });
    await expect(small).resolves.toEqual({ updateId: "small-update" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(smallCount).toBe(1);

    const largeUpdate = "A".repeat(64 * 1_024);
    const large = waitForClientEvent<{ updateId: string; update: string }>(
      clientB,
      "integration:large",
      10_000
    );
    namespaceA.to(ROOM).emit("integration:large", {
      updateId: "attachment-update",
      update: largeUpdate,
    });
    await expect(large).resolves.toEqual({
      updateId: "attachment-update",
      update: largeUpdate,
    });

    const sockets = await namespaceA.in(ROOM).fetchSockets();
    expect(new Set(sockets.map(({ id }) => id))).toEqual(
      new Set([clientA?.id, clientB.id])
    );

    namespaceB.on(
      "integration:rpc",
      (payload: { requestId: string }, acknowledge: (value: unknown) => void) => {
        acknowledge({ node: "B", requestId: payload.requestId });
      }
    );
    await expect(
      namespaceA.serverSideEmitWithAck("integration:rpc", { requestId: "rpc-1" })
    ).resolves.toEqual([{ node: "B", requestId: "rpc-1" }]);
  }, 30_000);
});
