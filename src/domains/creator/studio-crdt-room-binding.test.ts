import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioCrdtDocument,
  type StudioCrdtDrawStrokePayload,
} from "./studio-crdt-document";
import {
  STUDIO_CRDT_PROTOCOL_VERSION,
  decodeStudioCrdtStateVector,
  decodeStudioCrdtUpdate,
  encodeStudioCrdtStateVector,
  encodeStudioCrdtSyncChunks,
  encodeStudioCrdtUpdate,
  type StudioCrdtRemoteUpdate,
  type StudioCrdtSyncRequest,
  type StudioCrdtSyncResponse,
  type StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";
import { StudioCrdtRoomBinding } from "./studio-crdt-room-binding";

import type { StudioCrdtOutbox } from "./studio-crdt-outbox";
import type {
  StudioLiveCrdtRoomEvent,
  StudioLiveRoom,
  StudioLiveRoomEvent,
} from "./studio-live-collaboration-room";

function payload(x: number): StudioCrdtDrawStrokePayload {
  return {
    version: 1,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [x, x, x + 1, x + 1],
    pressures: [0.4, 0.8],
    stroke: "#123456",
    strokeWidth: 6,
  };
}

function add(document: StudioCrdtDocument, id: string, x: number): void {
  document.addStroke({
    id,
    pageId: "page-a",
    layerId: "page-root",
    payload: payload(x),
  });
}

class FakeRoom {
  ready = true;
  readonly workId = "work-a";
  readonly participant = { sessionId: "self", displayName: "Me", role: "editor" as const };
  readonly crdtListeners = new Set<(event: StudioLiveCrdtRoomEvent) => void>();
  readonly roomListeners = new Set<(event: StudioLiveRoomEvent) => void>();
  readonly publications: StudioCrdtUpdateRequest[] = [];
  server: StudioCrdtDocument;
  failuresRemaining = 0;
  syncFailuresRemaining = 0;
  hangPublications = false;
  serverSequence = 0;

  constructor(server: StudioCrdtDocument) {
    this.server = server;
  }

  subscribeCrdt(listener: (event: StudioLiveCrdtRoomEvent) => void): () => void {
    this.crdtListeners.add(listener);
    return () => this.crdtListeners.delete(listener);
  }

  subscribe(listener: (event: StudioLiveRoomEvent) => void): () => void {
    this.roomListeners.add(listener);
    return () => this.roomListeners.delete(listener);
  }

  async requestCrdtSync(request: StudioCrdtSyncRequest): Promise<StudioCrdtSyncResponse> {
    if (this.syncFailuresRemaining > 0) {
      this.syncFailuresRemaining -= 1;
      throw new Error("temporary sync failure");
    }
    const diff = this.server.encodeStateAsUpdate(decodeStudioCrdtStateVector(request.stateVector));
    const response: StudioCrdtSyncResponse = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: this.workId,
      requestId: request.requestId,
      transferId: "11111111-1111-4111-8111-111111111111",
      chunks: encodeStudioCrdtSyncChunks(diff),
      chunkCount: encodeStudioCrdtSyncChunks(diff).length,
      totalBytes: diff.byteLength,
      serverStateVector: encodeStudioCrdtStateVector(this.server.encodeStateVector()),
      serverSequence: String(this.serverSequence),
    };
    for (const listener of this.crdtListeners) {
      listener({ type: "sync-response", response, senderSessionId: null });
    }
    return response;
  }

  async publishCrdtUpdate(request: StudioCrdtUpdateRequest) {
    this.publications.push(request);
    if (this.hangPublications) return new Promise<never>(() => undefined);
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("temporary disconnect");
    }
    this.server.applyUpdate(decodeStudioCrdtUpdate(request.update));
    this.serverSequence += 1;
    return {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: this.workId,
      updateId: request.updateId,
      serverSequence: String(this.serverSequence),
      serverStateVector: encodeStudioCrdtStateVector(this.server.encodeStateVector()),
      duplicate: false,
    };
  }

  respondCrdtSync(): boolean {
    return true;
  }

  emitRemote(update: StudioCrdtRemoteUpdate): void {
    for (const listener of this.crdtListeners) {
      listener({ type: "update", update, senderSessionId: "peer" });
    }
  }
}

function room(value: FakeRoom): StudioLiveRoom {
  return value as unknown as StudioLiveRoom;
}

class MemoryOutbox implements StudioCrdtOutbox {
  readonly requests = new Map<string, StudioCrdtUpdateRequest>();

  async list(scope: string, workId: string): Promise<StudioCrdtUpdateRequest[]> {
    return [...this.requests.entries()]
      .filter(([key, request]) => key.startsWith(`${scope}:`) && request.workId === workId)
      .map(([, request]) => ({ ...request }));
  }

  async put(scope: string, request: StudioCrdtUpdateRequest): Promise<void> {
    this.requests.set(`${scope}:${request.updateId}`, { ...request });
  }

  async remove(scope: string, _workId: string, updateId: string): Promise<void> {
    this.requests.delete(`${scope}:${updateId}`);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("StudioCrdtRoomBinding", () => {
  it("performs bidirectional state-vector repair before becoming ready", async () => {
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    add(server, "server-stroke", 10);
    add(client, "offline-stroke", 20);
    const fake = new FakeRoom(server);
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      randomId: (() => {
        let value = 0;
        return () => `00000000-0000-4000-8000-${String(++value).padStart(12, "0")}`;
      })(),
    });

    await binding.start();

    expect(client.getStrokes().map((stroke) => stroke.id).sort()).toEqual([
      "offline-stroke",
      "server-stroke",
    ]);
    expect(server.getStrokes().map((stroke) => stroke.id).sort()).toEqual([
      "offline-stroke",
      "server-stroke",
    ]);
    expect(fake.publications).toHaveLength(1);

    binding.close();
    client.destroy();
    server.destroy();
  });

  it("applies remote updates without publishing an echo", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server);
    const binding = new StudioCrdtRoomBinding({ document: client, room: room(fake) });
    await binding.start();
    const publicationCount = fake.publications.length;
    const peer = new StudioCrdtDocument();
    add(peer, "peer-stroke", 30);
    const update = peer.encodeStateAsUpdate();

    fake.emitRemote({
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-a",
      updateId: "22222222-2222-4222-8222-222222222222",
      serverSequence: "2",
      update: encodeStudioCrdtUpdate(update),
    });
    await vi.advanceTimersByTimeAsync(100);

    expect(client.getStroke("peer-stroke")).not.toBeNull();
    expect(fake.publications).toHaveLength(publicationCount);

    binding.close();
    peer.destroy();
    client.destroy();
    server.destroy();
  });

  it("retries a failed publish with the same durable update id", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server);
    fake.failuresRemaining = 1;
    const binding = new StudioCrdtRoomBinding({ document: client, room: room(fake) });
    await binding.start();

    add(client, "local-stroke", 40);
    await vi.advanceTimersByTimeAsync(40);
    expect(fake.publications).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(300);

    expect(fake.publications).toHaveLength(2);
    expect(fake.publications[0]?.updateId).toBe(fake.publications[1]?.updateId);
    expect(server.getStroke("local-stroke")).not.toBeNull();

    binding.close();
    client.destroy();
    server.destroy();
  });

  it("keeps viewer documents read-only while still receiving sync state", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    add(server, "visible-stroke", 50);
    const fake = new FakeRoom(server);
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      canEdit: false,
    });
    await binding.start();
    add(client, "forbidden-local", 60);
    await vi.advanceTimersByTimeAsync(100);

    expect(client.getStroke("visible-stroke")).not.toBeNull();
    expect(fake.publications).toHaveLength(0);

    binding.close();
    client.destroy();
    server.destroy();
  });

  it("flushes the final sub-frame batch before graceful room teardown", async () => {
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server);
    const binding = new StudioCrdtRoomBinding({ document: client, room: room(fake) });
    await binding.start();
    add(client, "last-stroke", 70);

    await binding.closeGracefully();

    expect(server.getStroke("last-stroke")).not.toBeNull();
    client.destroy();
    server.destroy();
  });

  it("waits for the final durable outbox write even after the room disconnects", async () => {
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server);
    const stored = new MemoryOutbox();
    let signalPutStarted: () => void = () => undefined;
    const putStarted = new Promise<void>((resolve) => {
      signalPutStarted = resolve;
    });
    let releasePut: () => void = () => undefined;
    const putGate = new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    const outbox: StudioCrdtOutbox = {
      list: (scope, workId) => stored.list(scope, workId),
      async put(scope, request) {
        signalPutStarted();
        await putGate;
        await stored.put(scope, request);
      },
      remove: (scope, workId, updateId) => stored.remove(scope, workId, updateId),
    };
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      outbox,
      outboxScope: "user-offline-close",
    });
    await binding.start();
    fake.ready = false;
    add(client, "offline-tail-stroke", 75);
    let closed = false;

    const closing = binding.closeGracefully(500).then(() => {
      closed = true;
    });
    await putStarted;
    await Promise.resolve();
    expect(closed).toBe(false);

    releasePut();
    await closing;
    expect(stored.requests.size).toBe(1);

    client.destroy();
    server.destroy();
  });

  it("retries a failed tail persistence before offline close and surfaces the failure", async () => {
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server);
    const stored = new MemoryOutbox();
    const statuses: string[] = [];
    let putAttempts = 0;
    const outbox: StudioCrdtOutbox = {
      list: (scope, workId) => stored.list(scope, workId),
      async put(scope, request) {
        putAttempts += 1;
        if (putAttempts === 1) throw new Error("temporary IndexedDB failure");
        await stored.put(scope, request);
      },
      remove: (scope, workId, updateId) => stored.remove(scope, workId, updateId),
    };
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      outbox,
      outboxScope: "user-persistence-retry",
      onStatus: (status) => statuses.push(`${status.state}:${status.message}`),
    });
    await binding.start();
    fake.ready = false;
    add(client, "retry-tail-stroke", 77);

    await binding.closeGracefully(500);

    expect(putAttempts).toBeGreaterThanOrEqual(2);
    expect(stored.requests.size).toBe(1);
    expect(statuses.some((status) => status.includes("temporary IndexedDB failure"))).toBe(true);

    client.destroy();
    server.destroy();
  });

  it("uses the acknowledged server as the durable sink when local persistence fails online", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server);
    const statuses: string[] = [];
    const outbox: StudioCrdtOutbox = {
      list: async () => [],
      put: async () => {
        throw new Error("local quota exceeded");
      },
      remove: async () => undefined,
    };
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      outbox,
      outboxScope: "user-online-fallback",
      onStatus: (status) => statuses.push(`${status.state}:${status.message}`),
    });
    await binding.start();

    add(client, "server-durable-stroke", 78);
    await vi.advanceTimersByTimeAsync(40);

    expect(server.getStroke("server-durable-stroke")).not.toBeNull();
    expect(fake.publications).toHaveLength(1);
    expect(statuses.some((status) => status.includes("local quota exceeded"))).toBe(true);

    binding.close();
    client.destroy();
    server.destroy();
  });

  it("times out a wedged local persistence call and still reaches the online server", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server);
    const outbox: StudioCrdtOutbox = {
      list: async () => [],
      put: () => new Promise<void>(() => undefined),
      remove: async () => undefined,
    };
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(fake),
      outbox,
      outboxScope: "user-online-timeout",
      persistenceTimeoutMs: 100,
    });
    await binding.start();

    add(client, "server-after-timeout-stroke", 79);
    await vi.advanceTimersByTimeAsync(140);

    expect(server.getStroke("server-after-timeout-stroke")).not.toBeNull();
    expect(fake.publications).toHaveLength(1);

    binding.close();
    client.destroy();
    server.destroy();
  });

  it("retries the state-vector sync itself after a reconnect sync failure", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server);
    const binding = new StudioCrdtRoomBinding({ document: client, room: room(fake) });
    await binding.start();
    add(server, "missed-while-disconnected", 80);
    fake.syncFailuresRemaining = 1;

    for (const listener of fake.roomListeners) {
      listener({
        type: "transport-status",
        status: { state: "ready", message: "reconnected", recoverable: true },
      });
    }
    await Promise.resolve();
    expect(client.getStroke("missed-while-disconnected")).toBeNull();

    await vi.advanceTimersByTimeAsync(300);
    expect(client.getStroke("missed-while-disconnected")).not.toBeNull();

    binding.close();
    client.destroy();
    server.destroy();
  });

  it("periodically repairs a durable update whose realtime broadcast was missed", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server);
    const binding = new StudioCrdtRoomBinding({ document: client, room: room(fake) });
    await binding.start();
    add(server, "missed-cross-instance-broadcast", 85);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.getStroke("missed-cross-instance-broadcast")).not.toBeNull();

    binding.close();
    client.destroy();
    server.destroy();
  });

  it("honors the graceful-close deadline when a publish never settles", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const fake = new FakeRoom(server);
    const binding = new StudioCrdtRoomBinding({ document: client, room: room(fake) });
    await binding.start();
    fake.hangPublications = true;
    add(client, "hung-last-stroke", 90);

    const closing = binding.closeGracefully(10);
    await vi.advanceTimersByTimeAsync(10);
    await expect(closing).resolves.toBeUndefined();

    client.destroy();
    server.destroy();
  });

  it("restores an unsent durable outbox update in the next editor session", async () => {
    vi.useFakeTimers();
    const server = new StudioCrdtDocument();
    const firstClient = new StudioCrdtDocument();
    const fake = new FakeRoom(server);
    const outbox = new MemoryOutbox();
    const firstBinding = new StudioCrdtRoomBinding({
      document: firstClient,
      room: room(fake),
      outbox,
      outboxScope: "user-a",
    });
    await firstBinding.start();
    fake.failuresRemaining = 1;
    add(firstClient, "offline-close-stroke", 100);
    await vi.advanceTimersByTimeAsync(40);
    expect(outbox.requests.size).toBe(1);
    const originalUpdateId = [...outbox.requests.values()][0]?.updateId;
    firstBinding.close();
    firstClient.destroy();

    const secondClient = new StudioCrdtDocument();
    const secondBinding = new StudioCrdtRoomBinding({
      document: secondClient,
      room: room(fake),
      outbox,
      outboxScope: "user-a",
    });
    await secondBinding.start();
    await Promise.resolve();

    expect(server.getStroke("offline-close-stroke")).not.toBeNull();
    expect(fake.publications.at(-1)?.updateId).toBe(originalUpdateId);
    expect(outbox.requests.size).toBe(0);

    secondBinding.close();
    secondClient.destroy();
    server.destroy();
  });

  it("does not resume an outbox restore after the binding closes", async () => {
    const server = new StudioCrdtDocument();
    const client = new StudioCrdtDocument();
    const source = new StudioCrdtDocument();
    add(source, "stale-after-close", 110);
    let resolveList: (requests: StudioCrdtUpdateRequest[]) => void = () => {
      throw new Error("Outbox list did not start.");
    };
    const outbox: StudioCrdtOutbox = {
      list: () => new Promise((resolve) => {
        resolveList = resolve;
      }),
      put: async () => undefined,
      remove: async () => undefined,
    };
    const binding = new StudioCrdtRoomBinding({
      document: client,
      room: room(new FakeRoom(server)),
      outbox,
      outboxScope: "user-a",
    });
    const starting = binding.start();

    binding.close();
    resolveList([{
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-a",
      updateId: "33333333-3333-4333-8333-333333333333",
      clientSequence: 1,
      update: encodeStudioCrdtUpdate(source.encodeStateAsUpdate()),
    }]);

    await expect(starting).resolves.toBeUndefined();
    expect(client.getStroke("stale-after-close")).toBeNull();

    source.destroy();
    client.destroy();
    server.destroy();
  });
});
