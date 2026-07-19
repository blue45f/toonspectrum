import { describe, expect, it } from "vitest";

import {
  encodeStudioCrdtStateVector,
  encodeStudioCrdtSyncChunks,
  encodeStudioCrdtUpdate,
  STUDIO_CRDT_PROTOCOL_VERSION,
  type StudioCrdtSyncRequest,
  type StudioCrdtSyncResponse,
  type StudioCrdtTransportMessage,
  type StudioCrdtUpdateAck,
  type StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";
import {
  createStudioLiveEnvelope,
  type StudioLiveEnvelope,
  type StudioLiveParticipant,
} from "./studio-live-collaboration-protocol";
import {
  STUDIO_LIVE_CHAT_HISTORY_LIMIT,
  StudioLiveRoom,
  type StudioLiveRoomDependencies,
  type StudioLiveRoomEvent,
  type StudioLiveSignalEnvelope,
  type StudioLiveVoiceEvent,
} from "./studio-live-collaboration-room";

import type {
  StudioLiveTransport,
  StudioLiveTransportContext,
  StudioLiveTransportControlEvent,
  StudioLiveTransportFactory,
  StudioLiveTransportMode,
} from "./studio-live-collaboration-transport";

class FakeHubTransport implements StudioLiveTransport {
  private readonly listeners = new Set<(value: unknown) => void>();
  private readonly controlListeners = new Set<(event: StudioLiveTransportControlEvent) => void>();
  private readonly crdtListeners = new Set<(event: StudioCrdtTransportMessage) => void>();
  private connected = false;
  private closed = false;

  constructor(
    readonly hub: FakeTransportHub,
    readonly roomName: string,
    readonly mode: StudioLiveTransportMode
  ) {}

  get ready() {
    return this.connected && !this.closed;
  }

  connect(): Promise<void> {
    this.connected = true;
    return Promise.resolve();
  }

  send(value: Parameters<StudioLiveTransport["send"]>[0]): boolean {
    if (!this.ready) return false;
    this.hub.publish(this, value);
    return true;
  }

  subscribe(listener: (value: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeControl(listener: (event: StudioLiveTransportControlEvent) => void): () => void {
    this.controlListeners.add(listener);
    return () => this.controlListeners.delete(listener);
  }

  subscribeCrdt(listener: (event: StudioCrdtTransportMessage) => void): () => void {
    this.crdtListeners.add(listener);
    return () => this.crdtListeners.delete(listener);
  }

  requestCrdtSync(request: StudioCrdtSyncRequest): Promise<StudioCrdtSyncResponse | null> {
    this.hub.crdtSyncRequests.push(structuredClone(request));
    return Promise.resolve(this.hub.crdtSyncResponse);
  }

  publishCrdtUpdate(request: StudioCrdtUpdateRequest): Promise<StudioCrdtUpdateAck> {
    this.hub.crdtUpdateRequests.push(structuredClone(request));
    return Promise.resolve({
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: request.workId,
      updateId: request.updateId,
      serverSequence: "1",
      serverStateVector: null,
      duplicate: false,
    });
  }

  receive(value: unknown): void {
    if (!this.ready) return;
    for (const listener of this.listeners) listener(structuredClone(value));
  }

  receiveControl(event: StudioLiveTransportControlEvent): void {
    if (this.closed) return;
    if (event.type === "status" && event.status.state === "revoked") {
      this.connected = false;
    }
    for (const listener of this.controlListeners) listener(structuredClone(event));
  }

  receiveCrdt(event: StudioCrdtTransportMessage): void {
    if (!this.ready) return;
    for (const listener of this.crdtListeners) listener(structuredClone(event));
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
    this.controlListeners.clear();
    this.crdtListeners.clear();
  }
}

class FakeTransportHub {
  readonly transports: FakeHubTransport[] = [];
  readonly published: StudioLiveEnvelope[] = [];
  readonly crdtSyncRequests: StudioCrdtSyncRequest[] = [];
  readonly crdtUpdateRequests: StudioCrdtUpdateRequest[] = [];
  crdtSyncResponse: StudioCrdtSyncResponse | null = null;
  queued = false;
  private queue: Array<{ sender: FakeHubTransport; value: unknown }> = [];

  factory(mode: StudioLiveTransportMode = "local"): StudioLiveTransportFactory {
    return (context: StudioLiveTransportContext) => {
      const transport = new FakeHubTransport(this, context.roomName, mode);
      this.transports.push(transport);
      return transport;
    };
  }

  publish(sender: FakeHubTransport, value: unknown): void {
    this.published.push(structuredClone(value) as StudioLiveEnvelope);
    if (this.queued) {
      this.queue.push({ sender, value: structuredClone(value) });
      return;
    }
    this.deliver(sender, value);
  }

  flush(): void {
    const queue = this.queue.splice(0);
    for (const item of queue) this.deliver(item.sender, item.value);
  }

  inject(index: number, value: unknown): void {
    this.transports[index]?.receive(value);
  }

  private deliver(sender: FakeHubTransport, value: unknown): void {
    for (const transport of this.transports) {
      if (transport === sender || transport.roomName !== sender.roomName) continue;
      transport.receive(value);
    }
  }
}

const alice: StudioLiveParticipant = {
  sessionId: "session-alice",
  displayName: "서윤 탭",
  role: "owner",
};
const bob: StudioLiveParticipant = {
  sessionId: "session-bob",
  displayName: "민호 탭",
  role: "editor",
};

function harness(mode: StudioLiveTransportMode = "local") {
  let now = 1_000_000;
  const hub = new FakeTransportHub();
  const intervalHandlers: Array<() => void> = [];
  const baseDependencies: StudioLiveRoomDependencies = {
    transportFactory: hub.factory(mode),
    now: () => now,
    setInterval: (handler) => {
      intervalHandlers.push(handler);
      return handler;
    },
    clearInterval: (handle) => {
      const index = intervalHandlers.indexOf(handle as () => void);
      if (index >= 0) intervalHandlers.splice(index, 1);
    },
    heartbeatMs: 250,
    presenceTtlMs: 500,
    lockLeaseMs: 500,
    cursorIntervalMs: 40,
  };
  return {
    hub,
    intervalHandlers,
    now: () => now,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    room: (
      participant: StudioLiveParticipant,
      dependencies: Partial<StudioLiveRoomDependencies> = {}
    ) =>
      new StudioLiveRoom({
        workId: "work-1",
        participant,
        dependencies: { ...baseDependencies, ...dependencies },
      }),
  };
}

describe("StudioLiveRoom", () => {
  it("uses a replaceable local/server transport and exchanges ephemeral presence", async () => {
    const local = harness();
    const roomA = local.room(alice);
    const roomB = local.room(bob);
    await roomA.start();
    await roomB.start();
    expect(roomB.getPeers()).toEqual([
      expect.objectContaining({ sessionId: alice.sessionId, displayName: alice.displayName }),
    ]);
    roomA.updatePresence({ pageId: "page-2" });

    expect(roomA.mode).toBe("local");
    expect(roomB.getPeers()).toEqual([
      expect.objectContaining({
        sessionId: alice.sessionId,
        displayName: alice.displayName,
        pageId: "page-2",
      }),
    ]);
    expect(roomA.getPeers()).toEqual([
      expect.objectContaining({ sessionId: bob.sessionId, displayName: bob.displayName }),
    ]);

    roomA.close();
    roomB.close();

    const server = harness("server");
    const serverRoom = server.room(alice);
    await serverRoom.start();
    expect(serverRoom.mode).toBe("server");
    serverRoom.close();
  });

  it("keeps local v1 presence exact-key compatible while publishing tools to server presence", async () => {
    const local = harness("local");
    const localRoom = local.room(alice);
    await localRoom.start();
    localRoom.updatePresence({ pageId: "page-2", tool: "pen" });
    const localPresence = local.hub.published.at(-1);
    expect(localPresence?.kind).toBe("presence:heartbeat");
    expect(localPresence?.payload).toEqual({ visibility: "active", pageId: "page-2" });
    expect(localPresence?.payload).not.toHaveProperty("tool");
    localRoom.close();

    const server = harness("server");
    const serverRoom = server.room(alice);
    await serverRoom.start();
    serverRoom.updatePresence({ pageId: "page-2", tool: "pen" });
    expect(server.hub.published.at(-1)?.payload).toEqual({
      visibility: "active",
      pageId: "page-2",
      tool: "pen",
    });
    serverRoom.close();
  });

  it("drops cross-work, self and replayed messages before emitting cursor state", async () => {
    const test = harness();
    const room = test.room(alice);
    const cursors: StudioLiveRoomEvent[] = [];
    room.subscribe((event) => {
      if (event.type === "cursor") cursors.push(event);
    });
    await room.start();

    const valid = createStudioLiveEnvelope({
      workId: "work-1",
      sender: bob,
      sentAt: test.now(),
      sequence: 10,
      kind: "cursor:update",
      payload: { x: 0.2, y: 0.8, pageId: "page-1", tool: "brush" },
    });
    test.hub.inject(0, { ...valid, workId: "work-2" });
    test.hub.inject(0, { ...valid, sender: alice });
    test.hub.inject(0, valid);
    test.hub.inject(0, valid);

    expect(cursors).toHaveLength(1);
    expect(cursors[0]).toEqual(
      expect.objectContaining({
        cursor: { x: 0.2, y: 0.8, pageId: "page-1", tool: "brush" },
      })
    );
    room.close();
  });

  it("throttles cursor publication while preserving normalized page/tool metadata", async () => {
    const test = harness();
    const roomA = test.room(alice);
    const roomB = test.room(bob);
    const received: StudioLiveRoomEvent[] = [];
    roomB.subscribe((event) => {
      if (event.type === "cursor") received.push(event);
    });
    await roomA.start();
    await roomB.start();

    expect(roomA.publishCursor({ x: 0, y: 1, pageId: "page-1", tool: "pen" })).toBe(true);
    expect(roomA.publishCursor({ x: 0.1, y: 0.9, pageId: "page-1", tool: "pen" })).toBe(false);
    test.advance(40);
    expect(roomA.publishCursor({ x: 0.1, y: 0.9, pageId: "page-1", tool: "pen" })).toBe(true);
    expect(received).toHaveLength(2);
    expect(roomA.clearCursor()).toBe(true);
    expect(received.at(-1)).toEqual(
      expect.objectContaining({
        cursor: { x: 0, y: 0, pageId: null, tool: null },
      })
    );
    expect(() => roomA.publishCursor({ x: -1, y: 2, pageId: null, tool: null })).toThrow(
      "유효하지 않은 실시간 협업 메시지"
    );
    roomA.close();
    roomB.close();
  });

  it("converges simultaneous lease claims deterministically and releases only the matching claim", async () => {
    const test = harness();
    const roomA = test.room(alice, { randomId: () => "claim-z" });
    const roomB = test.room(bob, { randomId: () => "claim-a" });
    await roomA.start();
    await roomB.start();
    test.hub.queued = true;

    expect(roomA.claimLock("page:page-1")).toBe(true);
    expect(roomB.claimLock("page:page-1")).toBe(true);
    test.hub.queued = false;
    test.hub.flush();

    expect(roomA.getLocks()).toEqual([
      expect.objectContaining({ resource: "page:page-1", claimId: "claim-a", owner: bob }),
    ]);
    expect(roomB.getLocks()).toEqual([
      expect.objectContaining({ resource: "page:page-1", claimId: "claim-a", owner: bob }),
    ]);
    expect(roomA.releaseLock("page:page-1")).toBe(false);
    expect(roomB.releaseLock("page:page-1")).toBe(true);
    expect(roomA.getLocks()).toEqual([]);
    expect(roomB.getLocks()).toEqual([]);
    roomA.close();
    roomB.close();
  });

  it("converges page and sibling-element claims regardless of each room's delivery order", async () => {
    const test = harness();
    const carol = { sessionId: "session-carol", displayName: "지우 탭", role: "editor" } as const;
    const pageRoom = test.room(alice, { randomId: () => "claim-m" });
    const firstElementRoom = test.room(bob, { randomId: () => "claim-a" });
    const secondElementRoom = test.room(carol, { randomId: () => "claim-z" });
    await pageRoom.start();
    await firstElementRoom.start();
    await secondElementRoom.start();
    test.hub.queued = true;

    expect(pageRoom.claimLock("page:page-1")).toBe(true);
    expect(firstElementRoom.claimLock("element:page-1:first")).toBe(true);
    expect(secondElementRoom.claimLock("element:page-1:second")).toBe(true);
    test.hub.queued = false;
    test.hub.flush();

    for (const room of [pageRoom, firstElementRoom, secondElementRoom]) {
      expect(room.getLocks()).toEqual([
        expect.objectContaining({
          resource: "page:page-1",
          claimId: "claim-m",
          owner: alice,
        }),
      ]);
    }
    pageRoom.close();
    firstElementRoom.close();
    secondElementRoom.close();
  });

  it("returns a denied result instead of throwing when request-id generation fails", async () => {
    const test = harness();
    const room = test.room(alice, {
      randomId: () => {
        throw new Error("secure id unavailable");
      },
    });
    await room.start();

    await expect(room.claimLockAsync("page:page-1")).resolves.toEqual({
      status: "denied",
      resource: "page:page-1",
      requestId: "unavailable",
      code: "invalid_request",
      message: "secure id unavailable",
    });
    room.close();
  });

  it("ignores stale releases for a newer lock claim", async () => {
    const test = harness();
    const room = test.room(alice);
    await room.start();
    const claim = createStudioLiveEnvelope({
      workId: "work-1",
      sender: bob,
      sentAt: test.now(),
      sequence: 1,
      kind: "lock:claim",
      payload: { resource: "element:el-1", claimId: "new-claim", leaseUntil: test.now() + 500 },
    });
    test.hub.inject(0, claim);
    test.hub.inject(
      0,
      createStudioLiveEnvelope({
        workId: "work-1",
        sender: bob,
        sentAt: test.now(),
        sequence: 2,
        kind: "lock:release",
        payload: { resource: "element:el-1", claimId: "old-claim" },
      })
    );

    expect(room.getLocks()).toEqual([
      expect.objectContaining({ resource: "element:el-1", claimId: "new-claim" }),
    ]);
    room.close();
  });

  it("expires silent peers and their locks without waiting for a leave message", async () => {
    const test = harness();
    const roomA = test.room(alice);
    const roomB = test.room(bob, { randomId: () => "claim-b" });
    await roomA.start();
    await roomB.start();
    roomB.updatePresence({ pageId: "page-1" });
    expect(roomB.claimLock("page:page-1")).toBe(true);
    expect(roomA.getPeers()).toHaveLength(1);
    expect(roomA.getLocks()).toHaveLength(1);

    test.advance(501);
    test.intervalHandlers[0]?.();
    expect(roomA.getPeers()).toEqual([]);
    expect(roomA.getLocks()).toEqual([]);
    roomA.close();
    roomB.close();
  });

  it("routes screen/WebRTC signals only to the addressed session", async () => {
    const test = harness();
    const carol = { sessionId: "session-carol", displayName: "지우 탭", role: "viewer" } as const;
    const roomA = test.room(alice);
    const roomB = test.room(bob);
    const roomC = test.room(carol);
    const signalsA: StudioLiveSignalEnvelope[] = [];
    const signalsB: StudioLiveSignalEnvelope[] = [];
    const signalsC: StudioLiveSignalEnvelope[] = [];
    roomA.subscribe((event) => event.type === "signal" && signalsA.push(event.envelope));
    roomB.subscribe((event) => event.type === "signal" && signalsB.push(event.envelope));
    roomC.subscribe((event) => event.type === "signal" && signalsC.push(event.envelope));
    await roomA.start();
    await roomB.start();
    await roomC.start();

    expect(roomA.announceScreen({ shareId: "share-1", label: "작업 화면" })).toBe(true);
    expect(signalsB.at(-1)?.kind).toBe("screen:announce");
    expect(signalsC.at(-1)?.kind).toBe("screen:announce");
    expect(roomB.requestScreen(alice.sessionId, { shareId: "share-1" })).toBe(true);
    expect(signalsA.at(-1)?.kind).toBe("screen:request");
    expect(signalsC.filter((signal) => signal.kind === "screen:request")).toHaveLength(0);
    expect(
      roomA.respondScreen(bob.sessionId, { shareId: "share-1", decision: "approved" })
    ).toBe(true);
    expect(signalsB.at(-1)?.kind).toBe("screen:access");
    expect(signalsC.filter((signal) => signal.kind === "screen:access")).toHaveLength(0);
    expect(
      roomA.sendWebRtcDescription(bob.sessionId, {
        shareId: "share-1",
        type: "offer",
        sdp: "v=0",
      })
    ).toBe(true);
    expect(signalsB.at(-1)?.kind).toBe("webrtc:description");
    expect(signalsC.filter((signal) => signal.kind === "webrtc:description")).toHaveLength(0);
    roomA.close();
    roomB.close();
    roomC.close();
  });

  it("keeps a six-seat voice huddle isolated from viewers, other calls and untargeted peers", async () => {
    const test = harness();
    const viewer = { sessionId: "session-viewer", displayName: "보기 전용", role: "viewer" } as const;
    const roomA = test.room(alice);
    const roomB = test.room(bob);
    const roomViewer = test.room(viewer);
    const voiceA: StudioLiveVoiceEvent[] = [];
    const voiceB: StudioLiveVoiceEvent[] = [];
    roomA.subscribeVoice((event) => voiceA.push(event));
    roomB.subscribeVoice((event) => voiceB.push(event));
    await roomA.start();
    await roomB.start();
    await roomViewer.start();

    expect(roomViewer.joinVoice({ callId: "voice-main", muted: false })).toBe(false);
    expect(roomA.joinVoice({ callId: "voice-main", muted: false })).toBe(true);
    expect(roomB.joinVoice({ callId: "voice-main", muted: true })).toBe(true);
    expect(roomA.getVoiceMembers()).toEqual([
      { participant: bob, callId: "voice-main", muted: true },
      { participant: alice, callId: "voice-main", muted: false },
    ]);
    expect(roomA.updateVoiceState({ callId: "voice-main", muted: true })).toBe(true);
    expect(roomB.getVoiceMembers()).toContainEqual({
      participant: alice,
      callId: "voice-main",
      muted: true,
    });
    expect(
      roomA.sendVoiceDescription(bob.sessionId, {
        callId: "voice-other",
        type: "offer",
        sdp: "v=0",
      })
    ).toBe(false);
    expect(
      roomA.sendVoiceDescription(alice.sessionId, {
        callId: "voice-main",
        type: "offer",
        sdp: "v=0",
      })
    ).toBe(false);
    expect(
      roomA.sendVoiceDescription(bob.sessionId, {
        callId: "voice-main",
        type: "offer",
        sdp: "v=0",
      })
    ).toBe(true);
    expect(voiceB).toContainEqual(
      expect.objectContaining({
        type: "voice:description",
        participant: alice,
        payload: { callId: "voice-main", type: "offer", sdp: "v=0" },
      })
    );
    expect(voiceA.some((event) => event.type === "voice:description")).toBe(false);
    expect(roomB.leaveVoice({ callId: "voice-main" })).toBe(true);
    expect(roomA.getVoiceMembers()).toEqual([
      { participant: alice, callId: "voice-main", muted: true },
    ]);

    roomA.close();
    roomB.close();
    roomViewer.close();
  });

  it("rejects a seventh local mesh participant before publishing a voice join", async () => {
    const test = harness();
    const rooms = Array.from({ length: 7 }, (_, index) =>
      test.room({
        sessionId: `session-${index}`,
        displayName: `팀원 ${index}`,
        role: "editor",
      })
    );
    for (const room of rooms) await room.start();
    for (const room of rooms.slice(0, 6)) {
      expect(room.joinVoice({ callId: "voice-main", muted: false })).toBe(true);
    }
    const publishedBefore = test.hub.published.length;
    expect(rooms[6]?.joinVoice({ callId: "voice-main", muted: false })).toBe(false);
    expect(test.hub.published).toHaveLength(publishedBefore);
    for (const room of rooms) room.close();
  });

  it("rolls back optimistic self voice membership on authoritative server removal", async () => {
    const test = harness("server");
    const room = test.room(alice);
    const events: StudioLiveVoiceEvent[] = [];
    room.subscribeVoice((event) => events.push(event));
    await room.start();

    expect(room.joinVoice({ callId: "voice-authoritative", muted: false })).toBe(true);
    expect(room.getVoiceMembers()).toContainEqual({
      participant: alice,
      callId: "voice-authoritative",
      muted: false,
    });
    test.hub.transports[0]?.receiveControl({
      type: "voice-removed",
      callId: "voice-authoritative",
      reason: "rejected",
      message: "음성 대화 정원은 최대 6명입니다.",
    });

    expect(room.getVoiceMembers()).toEqual([]);
    expect(events).toContainEqual({
      type: "voice:self-left",
      callId: "voice-authoritative",
      reason: "rejected",
      message: "음성 대화 정원은 최대 6명입니다.",
    });
    room.close();
  });

  it("clears peer and lock metadata immediately when server access is revoked", async () => {
    const test = harness("server");
    const room = test.room(alice);
    const events: StudioLiveRoomEvent[] = [];
    room.subscribe((event) => events.push(event));
    await room.start();

    test.hub.inject(
      0,
      createStudioLiveEnvelope({
        workId: "work-1",
        sender: bob,
        sentAt: test.now(),
        sequence: 1,
        kind: "presence:heartbeat",
        payload: { visibility: "active", pageId: "page-1" },
      })
    );
    test.hub.transports[0]?.receiveControl({
      type: "lock",
      lock: {
        action: "acquired",
        resource: "element:el-1",
        claimId: "server-lease",
        owner: bob,
        leaseUntil: test.now() + 500,
      },
    });
    expect(room.getPeers()).toHaveLength(1);
    expect(room.getLocks()).toHaveLength(1);

    test.hub.transports[0]?.receiveControl({
      type: "status",
      status: {
        state: "revoked",
        message: "팀 권한이 회수되었습니다.",
        recoverable: false,
      },
    });

    expect(room.getPeers()).toEqual([]);
    expect(room.getLocks()).toEqual([]);
    expect(events.slice(-3)).toEqual([
      { type: "presence", peers: [] },
      { type: "locks", locks: [] },
      {
        type: "transport-status",
        status: {
          state: "revoked",
          message: "팀 권한이 회수되었습니다.",
          recoverable: false,
        },
      },
    ]);

    test.hub.transports[0]?.receiveControl({
      type: "lock",
      lock: {
        action: "acquired",
        resource: "element:queued-after-revoke",
        claimId: "late-server-lease",
        owner: bob,
        leaseUntil: test.now() + 500,
      },
    });
    expect(room.getLocks()).toEqual([]);
    room.close();
  });

  it("broadcasts leave and releases owned locks before transport cleanup", async () => {
    const test = harness();
    const roomA = test.room(alice, { randomId: () => "claim-a" });
    const roomB = test.room(bob);
    await roomA.start();
    await roomB.start();
    roomA.updatePresence({ pageId: "page-1" });
    expect(roomA.claimLock("page:page-1")).toBe(true);
    expect(roomB.getPeers()).toHaveLength(1);
    expect(roomB.getLocks()).toHaveLength(1);

    roomA.close();
    expect(roomB.getPeers()).toEqual([]);
    expect(roomB.getLocks()).toEqual([]);
    roomB.close();
  });

  it("exposes sync, publish and remote CRDT updates on a separate room subscription", async () => {
    const test = harness();
    const stateVector = encodeStudioCrdtStateVector(new Uint8Array([0]));
    const syncBytes = new Uint8Array([1, 2, 3]);
    const chunks = encodeStudioCrdtSyncChunks(syncBytes);
    test.hub.crdtSyncResponse = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-1",
      requestId: "request-1",
      transferId: "11111111-1111-4111-8111-111111111111",
      chunks,
      chunkCount: chunks.length,
      totalBytes: syncBytes.byteLength,
      serverStateVector: stateVector,
      serverSequence: "1",
    };
    const room = test.room(alice);
    const ephemeral: StudioLiveRoomEvent[] = [];
    const durable: unknown[] = [];
    room.subscribe((event) => ephemeral.push(event));
    room.subscribeCrdt((event) => durable.push(event));
    await room.start();
    ephemeral.length = 0;

    await expect(
      room.requestCrdtSync({
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-1",
        requestId: "request-1",
        stateVector,
      })
    ).resolves.toEqual(test.hub.crdtSyncResponse);
    await room.publishCrdtUpdate({
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-1",
      updateId: "22222222-2222-4222-8222-222222222222",
      clientSequence: 1,
      update: encodeStudioCrdtUpdate(new Uint8Array([4, 5, 6])),
    });
    test.hub.transports[0]?.receiveCrdt({
      type: "update",
      senderSessionId: bob.sessionId,
      update: {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-1",
        updateId: "33333333-3333-4333-8333-333333333333",
        serverSequence: "2",
        update: encodeStudioCrdtUpdate(new Uint8Array([7, 8, 9])),
      },
    });

    expect(test.hub.crdtSyncRequests).toHaveLength(1);
    expect(test.hub.crdtUpdateRequests).toHaveLength(1);
    expect(durable).toEqual([
      expect.objectContaining({ type: "sync-response" }),
      expect.objectContaining({ type: "update", senderSessionId: bob.sessionId }),
    ]);
    expect(ephemeral).toEqual([]);
    room.close();
  });
  it("exchanges bounded ephemeral session chat and echoes the sender locally", async () => {
    const test = harness();
    let chatCounter = 0;
    const roomA = test.room(alice, { randomId: () => `chat-a-${++chatCounter}` });
    const roomB = test.room(bob, { randomId: () => "chat-b-1" });
    await roomA.start();
    await roomB.start();

    const eventsA: StudioLiveRoomEvent[] = [];
    const eventsB: StudioLiveRoomEvent[] = [];
    roomA.subscribe((event) => eventsA.push(event));
    roomB.subscribe((event) => eventsB.push(event));

    const sent = roomA.sendChatMessage("  이 컷 배경 톤 조금 밝게 갈까요?  ");
    expect(sent).toMatchObject({
      text: "이 컷 배경 톤 조금 밝게 갈까요?",
      self: true,
      participant: expect.objectContaining({ sessionId: alice.sessionId }),
    });
    expect(roomA.getChatMessages()).toHaveLength(1);
    const isChatEvent = (
      event: StudioLiveRoomEvent
    ): event is Extract<StudioLiveRoomEvent, { type: "chat" }> => event.type === "chat";
    expect(eventsA.filter(isChatEvent).map((event) => event.message.self)).toEqual([true]);

    const receivedB = eventsB.filter(isChatEvent);
    expect(receivedB).toHaveLength(1);
    expect(receivedB[0]?.message).toMatchObject({
      id: sent?.id,
      text: "이 컷 배경 톤 조금 밝게 갈까요?",
      self: false,
      participant: expect.objectContaining({ sessionId: alice.sessionId }),
    });
    expect(roomB.getChatMessages()).toHaveLength(1);

    expect(roomA.sendChatMessage("   ")).toBeNull();
    expect(() => roomA.sendChatMessage("가".repeat(501))).toThrow();
    expect(roomA.getChatMessages()).toHaveLength(1);

    roomA.close();
    expect(roomA.sendChatMessage("닫힌 뒤에는 보낼 수 없습니다")).toBeNull();
    roomB.close();
    expect(roomB.getChatMessages()).toEqual([]);
  });

  it("caps session chat history at the newest 200 lines", async () => {
    const test = harness();
    let chatCounter = 0;
    const roomA = test.room(alice, { randomId: () => `chat-${++chatCounter}` });
    const roomB = test.room(bob);
    await roomA.start();
    await roomB.start();

    for (let index = 1; index <= STUDIO_LIVE_CHAT_HISTORY_LIMIT + 5; index += 1) {
      expect(roomA.sendChatMessage(`메시지 ${index}`)).not.toBeNull();
    }

    const historyA = roomA.getChatMessages();
    const historyB = roomB.getChatMessages();
    expect(historyA).toHaveLength(STUDIO_LIVE_CHAT_HISTORY_LIMIT);
    expect(historyB).toHaveLength(STUDIO_LIVE_CHAT_HISTORY_LIMIT);
    expect(historyA[0]?.text).toBe("메시지 6");
    expect(historyA.at(-1)?.text).toBe(`메시지 ${STUDIO_LIVE_CHAT_HISTORY_LIMIT + 5}`);
    expect(historyB[0]?.text).toBe("메시지 6");

    roomA.close();
    roomB.close();
  });
});
