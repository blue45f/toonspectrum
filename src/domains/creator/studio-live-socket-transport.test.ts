import { afterEach, describe, expect, it, vi } from "vitest";

import {
  encodeStudioCrdtStateVector,
  encodeStudioCrdtSyncChunks,
  encodeStudioCrdtUpdate,
  STUDIO_CRDT_PROTOCOL_VERSION,
  type StudioCrdtTransportMessage,
} from "./studio-crdt-protocol";
import {
  STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH,
  STUDIO_LIVE_SDP_MAX_LENGTH,
  STUDIO_LIVE_SDP_MID_MAX_LENGTH,
  STUDIO_LIVE_USERNAME_FRAGMENT_MAX_LENGTH,
  createStudioLiveEnvelope,
  type StudioLiveEnvelope,
  type StudioLiveMessageKind,
  type StudioLiveParticipant,
  type StudioLivePayloadMap,
} from "./studio-live-collaboration-protocol";
import { StudioLiveRoom, type StudioLiveRoomEvent } from "./studio-live-collaboration-room";
import {
  StudioLiveSocketTransport,
  createStudioServerLiveTransportFactory,
  type StudioLiveSocketLike,
} from "./studio-live-socket-transport";

import type { StudioLiveTransportContext } from "./studio-live-collaboration-transport";

const NOW = 2_000_000;
const TOKEN = "signed-session-token-value";
const localParticipant: StudioLiveParticipant = {
  sessionId: "local-client-instance",
  displayName: "내 작업 · 이 탭",
  role: "owner",
};

function serverParticipant(
  connectionId: string,
  clientInstanceId: string,
  name: string,
  role: StudioLiveParticipant["role"] = "editor"
) {
  return {
    connectionId,
    clientInstanceId,
    name,
    role,
    capabilities: { view: true, comment: true, edit: true, manageMembers: role === "owner" },
    state: "active",
    pageId: null,
    tool: null,
    sharingScreen: false,
    joinedAt: new Date(NOW - 1_000).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
  };
}

const self = serverParticipant("connection-self", localParticipant.sessionId, "내 작업", "owner");
const remote = serverParticipant("connection-remote", "remote-client-instance", "어시스턴트");

function joinSuccess(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: { self, participants: [self, remote], locks: [], ...overrides },
  };
}

interface EmittedRecord {
  event: string;
  payload: unknown;
}

class FakeSocket implements StudioLiveSocketLike {
  connected = false;
  auth: Record<string, unknown>;
  readonly emitted: EmittedRecord[] = [];
  readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  readonly heldAcks = new Map<string, Array<(value: unknown) => void>>();
  readonly ackResponses = new Map<string, unknown>();
  joinResponse: unknown = joinSuccess();
  holdEvents = new Set<string>();

  constructor(auth: { sessionToken: string }) {
    this.auth = { ...auth };
  }

  connect(): StudioLiveSocketLike {
    this.connected = true;
    this.serverEmit("connect");
    return this;
  }

  disconnect(): StudioLiveSocketLike {
    const wasConnected = this.connected;
    this.connected = false;
    if (wasConnected) this.serverEmit("disconnect", "io client disconnect");
    return this;
  }

  emit(event: string, ...args: unknown[]): StudioLiveSocketLike {
    const callback = typeof args.at(-1) === "function" ? (args.at(-1) as (value: unknown) => void) : null;
    const payload = args[0];
    this.emitted.push({ event, payload });
    if (!callback) return this;
    if (this.holdEvents.has(event)) {
      const queue = this.heldAcks.get(event) ?? [];
      queue.push(callback);
      this.heldAcks.set(event, queue);
      return this;
    }
    callback(
      event === "studio:join"
        ? this.joinResponse
        : (this.ackResponses.get(event) ?? { ok: true, data: {} })
    );
    return this;
  }

  on(event: string, listener: (...args: unknown[]) => void): StudioLiveSocketLike {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: (...args: unknown[]) => void): StudioLiveSocketLike {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  serverEmit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  reply(event: string, value: unknown): void {
    const callback = this.heldAcks.get(event)?.shift();
    if (!callback) throw new Error(`No held acknowledgement for ${event}`);
    callback(value);
  }

  serverDisconnect(reason = "transport close"): void {
    this.connected = false;
    this.serverEmit("disconnect", reason);
  }

  serverReconnect(): void {
    this.connected = true;
    this.serverEmit("connect");
  }
}

function context(): StudioLiveTransportContext {
  return { workId: "work-1", roomName: "unused-server-room", participant: localParticipant };
}

function envelope<K extends StudioLiveMessageKind>(
  kind: K,
  payload: StudioLivePayloadMap[K],
  sequence: number,
  targetSessionId: string | null = null
): StudioLiveEnvelope<K> {
  return createStudioLiveEnvelope({
    workId: "work-1",
    sender: localParticipant,
    sentAt: NOW,
    sequence,
    kind,
    targetSessionId,
    payload,
  });
}

function activate(transport: StudioLiveSocketTransport): void {
  expect(
    transport.send(
      envelope("presence:hello", { visibility: "active", pageId: null }, 1)
    )
  ).toBe(true);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("StudioLiveSocketTransport", () => {
  it("uses a same-origin websocket auth handshake and stays unready until join ACL succeeds", async () => {
    const socket = new FakeSocket({ sessionToken: "placeholder" });
    socket.holdEvents.add("studio:join");
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: (auth) => {
        socket.auth = { ...auth };
        return socket;
      },
      now: () => NOW,
    });
    const received: unknown[] = [];
    transport.subscribe((value) => received.push(value));

    const connecting = transport.connect();
    expect(transport.ready).toBe(false);
    expect(socket.auth).toEqual({ sessionToken: TOKEN });
    expect(socket.emitted[0]).toEqual({
      event: "studio:join",
      payload: { workId: "work-1", clientInstanceId: localParticipant.sessionId },
    });
    expect(JSON.stringify(socket.emitted)).not.toContain(TOKEN);

    socket.reply("studio:join", joinSuccess());
    await connecting;
    expect(transport.ready).toBe(true);
    expect(received).toEqual([]);

    activate(transport);
    expect(
      (received as StudioLiveEnvelope[]).map((value) => [value.kind, value.sender.sessionId])
    ).toEqual([["presence:heartbeat", remote.connectionId]]);
    expect(JSON.stringify(socket.emitted)).not.toContain(TOKEN);

    transport.close();
    expect(socket.auth).toEqual({});
  });

  it("replays bounded pre-ACK presence deltas over the adapter snapshot", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    socket.holdEvents.add("studio:join");
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });
    const received: StudioLiveEnvelope[] = [];
    transport.subscribe((value) => received.push(value as StudioLiveEnvelope));
    const departed = serverParticipant(
      "connection-departed",
      "departed-client-instance",
      "퇴장한 어시스턴트"
    );
    const departedAfterAck = serverParticipant(
      "connection-departed-after-ack",
      "departed-after-ack-client-instance",
      "ACK 뒤 퇴장한 어시스턴트"
    );

    const connecting = transport.connect();
    socket.serverEmit("studio:presence:update", {
      ...remote,
      state: "idle",
      pageId: "page-after-snapshot",
      updatedAt: new Date(NOW + 1).toISOString(),
    });
    socket.serverEmit("studio:presence:leave", {
      connectionId: departed.connectionId,
      reason: "disconnect",
    });
    socket.reply("studio:join", joinSuccess({
      participants: [self, remote, departed, departedAfterAck],
    }));
    await connecting;
    socket.serverEmit("studio:presence:update", {
      ...remote,
      state: "away",
      pageId: "page-after-ack",
      updatedAt: new Date(NOW + 2).toISOString(),
    });
    socket.serverEmit("studio:presence:leave", {
      connectionId: departedAfterAck.connectionId,
      reason: "disconnect",
    });
    activate(transport);

    expect(received).toEqual([
      expect.objectContaining({
        kind: "presence:heartbeat",
        sender: expect.objectContaining({ sessionId: remote.connectionId }),
        payload: expect.objectContaining({
          visibility: "idle",
          pageId: "page-after-ack",
        }),
      }),
    ]);
    transport.close();
  });

  it("treats a rolling-deploy legacy presence snapshot as merge-only", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });
    const received: StudioLiveEnvelope[] = [];
    transport.subscribe((value) => received.push(value as StudioLiveEnvelope));
    await transport.connect();
    activate(transport);
    received.length = 0;

    socket.serverEmit("studio:presence:snapshot", {
      workId: "work-1",
      participants: [self],
    });
    socket.serverEmit("studio:cursor", {
      connectionId: remote.connectionId,
      pageId: "page-still-present",
      x: 0.25,
      y: 0.75,
    });

    expect(received).toEqual([
      expect.objectContaining({
        kind: "cursor:update",
        sender: expect.objectContaining({ sessionId: remote.connectionId }),
        payload: expect.objectContaining({ pageId: "page-still-present" }),
      }),
    ]);
    transport.close();
  });

  it("translates authoritative participants and every targeted screen/WebRTC event", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });
    const received: StudioLiveEnvelope[] = [];
    transport.subscribe((value) => received.push(value as StudioLiveEnvelope));
    await transport.connect();
    activate(transport);
    received.length = 0;

    socket.serverEmit("studio:screen:announce", {
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      shareId: "share-1",
      label: "작업 화면",
    });
    socket.serverEmit("studio:screen:request", {
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      shareId: "share-1",
    });
    socket.serverEmit("studio:screen:access", {
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      shareId: "share-1",
      decision: "approved",
    });
    socket.serverEmit("studio:signal", {
      signalId: "signal-1",
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      shareId: "share-description-direct",
      kind: "description",
      description: { type: "offer", sdp: "v=0\r\no=remote" },
    });
    socket.serverEmit("studio:signal", {
      signalId: "signal-2",
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      shareId: "share-candidate-direct",
      kind: "candidate",
      candidate: {
        candidate: "candidate:1",
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: null,
      },
    });
    socket.serverEmit("studio:signal", {
      signalId: "signal-3",
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      shareId: "share-bye-direct",
      kind: "bye",
    });
    socket.serverEmit("studio:screen:stop", {
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      shareId: "share-1",
    });

    expect(received.map((value) => value.kind)).toEqual([
      "screen:announce",
      "screen:request",
      "screen:access",
      "webrtc:description",
      "webrtc:ice",
      "screen:access",
      "screen:stop",
    ]);
    expect(received.slice(1, 6).every((value) => value.targetSessionId === localParticipant.sessionId)).toBe(
      true
    );
    expect(received.every((value) => value.sender.sessionId === remote.connectionId)).toBe(true);
    expect(received.some((value) => value.sender.sessionId === self.connectionId)).toBe(false);
    expect((received[3]?.payload as { shareId?: string }).shareId).toBe(
      "share-description-direct"
    );
    expect((received[4]?.payload as { shareId?: string }).shareId).toBe(
      "share-candidate-direct"
    );
    expect((received[5]?.payload as { shareId?: string }).shareId).toBe("share-bye-direct");

    expect(
      transport.send(
        envelope("screen:request", { shareId: "share-2" }, 2, remote.connectionId)
      )
    ).toBe(true);
    expect(
      transport.send(
        envelope(
          "screen:access",
          { shareId: "share-2", decision: "rejected" },
          3,
          remote.connectionId
        )
      )
    ).toBe(true);
    expect(
      transport.send(
        envelope(
          "webrtc:description",
          { shareId: "share-2", type: "offer", sdp: "v=0" },
          4,
          remote.connectionId
        )
      )
    ).toBe(true);
    expect(
      transport.send(
        envelope(
          "webrtc:ice",
          {
            shareId: "share-2",
            candidate: "candidate:outbound",
            sdpMid: "0",
            sdpMLineIndex: 0,
            usernameFragment: null,
          },
          5,
          remote.connectionId
        )
      )
    ).toBe(true);
    expect(transport.send(envelope("screen:stop", { shareId: "share-2" }, 6))).toBe(true);

    expect(socket.emitted.slice(-5).map((value) => value.event)).toEqual([
      "studio:screen:request",
      "studio:screen:access",
      "studio:signal",
      "studio:signal",
      "studio:screen:stop",
    ]);
    expect(socket.emitted.at(-3)?.payload).toEqual(
      expect.objectContaining({ shareId: "share-2", kind: "description" })
    );
    expect(socket.emitted.at(-2)?.payload).toEqual(
      expect.objectContaining({ shareId: "share-2", kind: "candidate" })
    );
    expect(JSON.stringify(socket.emitted)).not.toContain(TOKEN);
    transport.close();
  });

  it("preserves active-tool metadata through presence while keeping cursor payloads rollout-compatible", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });
    const received: StudioLiveEnvelope[] = [];
    transport.subscribe((value) => received.push(value as StudioLiveEnvelope));
    await transport.connect();
    activate(transport);
    received.length = 0;

    expect(
      transport.send(
        envelope(
          "presence:heartbeat",
          { visibility: "active", pageId: "page-1", tool: "pen" },
          2
        )
      )
    ).toBe(true);
    expect(socket.emitted.at(-1)).toEqual({
      event: "studio:presence",
      payload: { workId: "work-1", state: "active", pageId: "page-1", tool: "pen" },
    });

    expect(
      transport.send(
        envelope(
          "cursor:update",
          { x: 0.25, y: 0.75, pageId: "page-1", tool: "pen" },
          3
        )
      )
    ).toBe(true);
    expect(socket.emitted.at(-1)).toEqual({
      event: "studio:cursor",
      payload: {
        workId: "work-1",
        pageId: "page-1",
        x: 0.25,
        y: 0.75,
      },
    });

    socket.serverEmit("studio:presence:update", { ...remote, tool: "bubble" });
    received.length = 0;
    socket.serverEmit("studio:cursor", {
      connectionId: remote.connectionId,
      pageId: "page-1",
      x: 0.5,
      y: 0.6,
    });
    expect(received.at(-1)).toEqual(
      expect.objectContaining({
        kind: "cursor:update",
        payload: { x: 0.5, y: 0.6, pageId: "page-1", tool: "bubble" },
      })
    );

    transport.close();
  });

  it("drops a signal without shareId instead of attributing it to an earlier screen lifecycle", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });
    const received: StudioLiveEnvelope[] = [];
    transport.subscribe((value) => received.push(value as StudioLiveEnvelope));
    await transport.connect();
    activate(transport);
    received.length = 0;

    socket.serverEmit("studio:screen:announce", {
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      shareId: "stale-announced-share",
      label: "작업 화면",
    });
    received.length = 0;
    socket.serverEmit("studio:signal", {
      signalId: "missing-share-id",
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      kind: "description",
      description: { type: "offer", sdp: "v=0" },
    });
    socket.serverEmit("studio:signal", {
      signalId: "explicit-other-share",
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      shareId: "explicit-other-share",
      kind: "description",
      description: { type: "offer", sdp: "v=0" },
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(
      expect.objectContaining({
        kind: "webrtc:description",
        payload: expect.objectContaining({ shareId: "explicit-other-share" }),
      })
    );
    transport.close();
  });

  it("parses canonical SDP and ICE boundaries without relaxing control-character rules", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });
    const received: StudioLiveEnvelope[] = [];
    transport.subscribe((value) => received.push(value as StudioLiveEnvelope));
    await transport.connect();
    activate(transport);
    received.length = 0;

    const emitDescription = (shareId: string, sdp: string) =>
      socket.serverEmit("studio:signal", {
        signalId: `description-${shareId}`,
        fromConnectionId: remote.connectionId,
        fromName: remote.name,
        shareId,
        kind: "description",
        description: { type: "offer", sdp },
      });
    const emitCandidate = (
      shareId: string,
      candidate: string,
      sdpMid: string,
      usernameFragment: string
    ) =>
      socket.serverEmit("studio:signal", {
        signalId: `candidate-${shareId}`,
        fromConnectionId: remote.connectionId,
        fromName: remote.name,
        shareId,
        kind: "candidate",
        candidate: { candidate, sdpMid, sdpMLineIndex: 0, usernameFragment },
      });

    const boundarySdp = `v=0\r\n${"s".repeat(STUDIO_LIVE_SDP_MAX_LENGTH - 7)}`;
    const multibyteSdp = "가".repeat(STUDIO_LIVE_SDP_MAX_LENGTH / 3);
    const escapedSdp = `vv${"\r\n\\\"".repeat(6_143)}\r\n\\`;
    emitDescription("sdp-boundary", boundarySdp);
    emitDescription("sdp-overflow", `${boundarySdp}x`);
    emitDescription("sdp-multibyte-boundary", multibyteSdp);
    emitDescription("sdp-multibyte-overflow", `${multibyteSdp}가`);
    emitDescription("sdp-escaped-boundary", escapedSdp);
    emitDescription("sdp-escaped-overflow", `${escapedSdp}"`);
    emitDescription("sdp-tab", "v=0\tinvalid");
    emitDescription("sdp-c1", "v=0\u0085invalid");

    emitCandidate(
      "ice-boundary",
      "c".repeat(STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH),
      "m".repeat(STUDIO_LIVE_SDP_MID_MAX_LENGTH),
      "u".repeat(STUDIO_LIVE_USERNAME_FRAGMENT_MAX_LENGTH)
    );
    emitCandidate(
      "ice-empty-optionals",
      "candidate:empty-optionals",
      "",
      ""
    );
    const multibyteCandidate = "🙂".repeat(STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH / 4);
    const escapedCandidate = `cc${"\\\"".repeat(2_047)}\\`;
    emitCandidate("ice-multibyte-boundary", multibyteCandidate, "0", "user");
    emitCandidate("ice-multibyte-overflow", `${multibyteCandidate}🙂`, "0", "user");
    emitCandidate("ice-escaped-boundary", escapedCandidate, "0", "user");
    emitCandidate("ice-escaped-overflow", `${escapedCandidate}"`, "0", "user");
    emitCandidate(
      "ice-overflow",
      "c".repeat(STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH + 1),
      "0",
      "user"
    );
    emitCandidate(
      "mid-overflow",
      "candidate:mid-overflow",
      "m".repeat(STUDIO_LIVE_SDP_MID_MAX_LENGTH + 1),
      "user"
    );
    emitCandidate(
      "username-overflow",
      "candidate:username-overflow",
      "0",
      "u".repeat(STUDIO_LIVE_USERNAME_FRAGMENT_MAX_LENGTH + 1)
    );
    emitCandidate("candidate-control", "candidate:\ninvalid", "0", "user");
    emitCandidate("mid-control", "candidate:mid-control", "mid\tinvalid", "user");
    emitCandidate("username-control", "candidate:user-control", "0", "user\u0085invalid");

    expect(
      received.map((value) => (value.payload as { shareId?: string }).shareId)
    ).toEqual([
      "sdp-boundary",
      "sdp-multibyte-boundary",
      "sdp-escaped-boundary",
      "ice-boundary",
      "ice-empty-optionals",
      "ice-multibyte-boundary",
      "ice-escaped-boundary",
    ]);
    transport.close();
  });

  it("commits server locks only after ACK and releases with the authoritative lease id", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    socket.holdEvents.add("studio:lock:request");
    socket.holdEvents.add("studio:lock:release");
    const factory = createStudioServerLiveTransportFactory(TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });
    const room = new StudioLiveRoom({
      workId: "work-1",
      participant: localParticipant,
      dependencies: { transportFactory: factory, now: () => NOW },
    });
    await room.start();

    expect(room.claimLock("page:page-1")).toBe(true);
    expect(room.getLocks()).toEqual([]);
    socket.reply("studio:lock:request", {
      ok: true,
      data: {
        lock: {
          resourceId: "page:page-1",
          leaseId: "server-lease-1",
          ownerConnectionId: self.connectionId,
          ownerName: self.name,
          expiresAt: new Date(NOW + 15_000).toISOString(),
        },
      },
    });

    expect(room.getLocks()).toEqual([
      expect.objectContaining({
        resource: "page:page-1",
        claimId: "server-lease-1",
        owner: localParticipant,
      }),
    ]);
    expect(room.releaseLock("page:page-1")).toBe(true);
    expect(room.getLocks()).toHaveLength(1);
    expect(socket.emitted.at(-1)).toEqual({
      event: "studio:lock:release",
      payload: {
        workId: "work-1",
        resourceId: "page:page-1",
        leaseId: "server-lease-1",
      },
    });
    socket.reply("studio:lock:release", { ok: true, data: { released: true } });
    expect(room.getLocks()).toEqual([]);
    room.close();
  });

  it("keeps an active room connected when one lock operation is forbidden", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    socket.holdEvents.add("studio:lock:request");
    const statuses: StudioLiveRoomEvent[] = [];
    const room = new StudioLiveRoom({
      workId: "work-1",
      participant: { ...localParticipant, role: "viewer" },
      dependencies: {
        transportFactory: createStudioServerLiveTransportFactory(TOKEN, {
          createSocket: () => socket,
          now: () => NOW,
        }),
        now: () => NOW,
      },
    });
    room.subscribe((event) => event.type === "transport-status" && statuses.push(event));
    await room.start();

    expect(room.claimLock("page:viewer-denied")).toBe(true);
    socket.reply("studio:lock:request", {
      ok: false,
      code: "forbidden",
      message: "이 원고를 편집할 권한이 없습니다.",
    });

    expect(room.ready).toBe(true);
    expect(socket.connected).toBe(true);
    expect(room.getLocks()).toEqual([]);
    expect(statuses.at(-1)).toEqual(
      expect.objectContaining({
        status: {
          state: "error",
          message: "이 원고를 편집할 권한이 없습니다.",
          recoverable: true,
        },
      })
    );

    socket.serverEmit("studio:presence:update", {
      ...remote,
      state: "idle",
      pageId: "page-after-denial",
    });
    expect(room.getPeers()).toEqual([
      expect.objectContaining({
        sessionId: remote.connectionId,
        visibility: "idle",
        pageId: "page-after-denial",
      }),
    ]);
    room.close();
  });

  it("ignores a stale lock ACK from an earlier socket generation after reconnect", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    socket.holdEvents.add("studio:lock:request");
    const room = new StudioLiveRoom({
      workId: "work-1",
      participant: localParticipant,
      dependencies: {
        transportFactory: createStudioServerLiveTransportFactory(TOKEN, {
          createSocket: () => socket,
          now: () => NOW,
        }),
        now: () => NOW,
      },
    });
    await room.start();
    expect(room.claimLock("page:stale")).toBe(true);

    socket.serverDisconnect();
    socket.serverReconnect();
    expect(room.ready).toBe(true);
    socket.reply("studio:lock:request", {
      ok: true,
      data: {
        lock: {
          resourceId: "page:stale",
          leaseId: "stale-server-lease",
          ownerConnectionId: self.connectionId,
          ownerName: self.name,
          expiresAt: new Date(NOW + 15_000).toISOString(),
        },
      },
    });

    expect(room.getLocks()).toEqual([]);
    room.close();
  });

  it("rejoins before becoming ready again and exposes disconnect/revocation recovery states", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    const statuses: StudioLiveRoomEvent[] = [];
    const room = new StudioLiveRoom({
      workId: "work-1",
      participant: localParticipant,
      dependencies: {
        transportFactory: createStudioServerLiveTransportFactory(TOKEN, {
          createSocket: () => socket,
          now: () => NOW,
        }),
        now: () => NOW,
      },
    });
    room.subscribe((event) => event.type === "transport-status" && statuses.push(event));
    await room.start();
    expect(room.ready).toBe(true);

    socket.holdEvents.add("studio:join");
    socket.serverDisconnect();
    expect(room.ready).toBe(false);
    expect(statuses.at(-1)).toEqual(
      expect.objectContaining({
        type: "transport-status",
        status: expect.objectContaining({ state: "disconnected", recoverable: true }),
      })
    );

    socket.serverReconnect();
    expect(room.ready).toBe(false);
    socket.reply("studio:join", joinSuccess());
    expect(room.ready).toBe(true);
    expect(statuses.at(-1)).toEqual(
      expect.objectContaining({
        status: expect.objectContaining({ state: "ready" }),
      })
    );

    socket.serverEmit("studio:access:revoked", {
      workId: "work-1",
      message: "팀 권한이 회수되었습니다.",
    });
    expect(room.ready).toBe(false);
    expect(statuses.at(-1)).toEqual(
      expect.objectContaining({
        status: { state: "revoked", message: "팀 권한이 회수되었습니다.", recoverable: false },
      })
    );

    const postRevocationEvents: StudioLiveRoomEvent[] = [];
    room.subscribe((event) => postRevocationEvents.push(event));
    socket.serverEmit("studio:presence:update", {
      ...remote,
      state: "idle",
      pageId: "must-not-appear",
    });
    socket.serverEmit("studio:lock:update", {
      action: "acquired",
      lock: {
        resourceId: "page:must-not-appear",
        leaseId: "revoked-lease",
        ownerConnectionId: remote.connectionId,
        ownerName: remote.name,
        expiresAt: new Date(NOW + 15_000).toISOString(),
      },
    });
    socket.serverEmit("studio:screen:announce", {
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      shareId: "revoked-share",
      label: "작업 화면",
    });
    socket.serverEmit("studio:signal", {
      signalId: "revoked-signal",
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      shareId: "revoked-share",
      kind: "description",
      description: { type: "offer", sdp: "v=0" },
    });
    expect(room.getPeers()).toEqual([]);
    expect(room.getLocks()).toEqual([]);
    expect(postRevocationEvents).toEqual([]);
    room.close();
  });

  it("treats an authenticated reconnect rejection as terminal and never overwrites revoked", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    const statuses: StudioLiveRoomEvent[] = [];
    const room = new StudioLiveRoom({
      workId: "work-1",
      participant: localParticipant,
      dependencies: {
        transportFactory: createStudioServerLiveTransportFactory(TOKEN, {
          createSocket: () => socket,
          now: () => NOW,
        }),
        now: () => NOW,
      },
    });
    room.subscribe((event) => event.type === "transport-status" && statuses.push(event));
    await room.start();

    socket.serverDisconnect();
    const joinCountBeforeRejection = socket.emitted.filter(
      (event) => event.event === "studio:join"
    ).length;
    const authError = Object.assign(new Error("로그인 세션이 만료되었습니다."), {
      data: { code: "unauthenticated" },
    });
    socket.serverEmit("connect_error", authError);

    expect(room.ready).toBe(false);
    expect(socket.connected).toBe(false);
    expect(statuses.at(-1)).toEqual(
      expect.objectContaining({
        status: {
          state: "revoked",
          message: "로그인 세션이 만료되었습니다.",
          recoverable: false,
        },
      })
    );
    expect(
      statuses.slice(-2).map((event) =>
        event.type === "transport-status" ? event.status.state : null
      )
    ).toEqual(["disconnected", "revoked"]);

    socket.serverReconnect();
    expect(room.ready).toBe(false);
    expect(
      socket.emitted.filter((event) => event.event === "studio:join")
    ).toHaveLength(joinCountBeforeRejection);
    room.close();
  });

  it("keeps an ordinary reconnect network error recoverable", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    const statuses: StudioLiveRoomEvent[] = [];
    const room = new StudioLiveRoom({
      workId: "work-1",
      participant: localParticipant,
      dependencies: {
        transportFactory: createStudioServerLiveTransportFactory(TOKEN, {
          createSocket: () => socket,
          now: () => NOW,
        }),
        now: () => NOW,
      },
    });
    room.subscribe((event) => event.type === "transport-status" && statuses.push(event));
    await room.start();

    socket.serverDisconnect();
    socket.serverEmit("connect_error", new Error("temporary network failure"));
    expect(room.ready).toBe(false);
    expect(statuses.at(-1)).toEqual(
      expect.objectContaining({
        status: {
          state: "error",
          message: "temporary network failure",
          recoverable: true,
        },
      })
    );

    socket.serverReconnect();
    expect(room.ready).toBe(true);
    expect(statuses.at(-1)).toEqual(
      expect.objectContaining({ status: expect.objectContaining({ state: "ready" }) })
    );
    room.close();
  });

  it("fails closed on a denied initial join without leaking the handshake token", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    socket.joinResponse = {
      ok: false,
      code: "forbidden",
      message: "이 작품의 실시간 작업실에 참여할 권한이 없습니다.",
    };
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });

    await expect(transport.connect()).rejects.toThrow("참여할 권한");
    expect(transport.ready).toBe(false);
    expect(JSON.stringify(socket.emitted)).not.toContain(TOKEN);
    transport.close();
  });

  it("uses ACKed durable CRDT events outside the ephemeral signaling union", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    const stateVector = encodeStudioCrdtStateVector(new Uint8Array([0]));
    const syncBytes = new Uint8Array([1, 2, 3, 4]);
    const chunks = encodeStudioCrdtSyncChunks(syncBytes);
    socket.ackResponses.set("studio:crdt:sync", {
      ok: true,
      data: {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-1",
        requestId: "request-1",
        transferId: "11111111-1111-4111-8111-111111111111",
        chunks,
        chunkCount: chunks.length,
        totalBytes: syncBytes.byteLength,
        serverStateVector: stateVector,
        serverSequence: "12",
      },
    });
    socket.ackResponses.set("studio:crdt:update", {
      ok: true,
      data: {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-1",
        updateId: "22222222-2222-4222-8222-222222222222",
        serverSequence: "13",
        serverStateVector: stateVector,
        duplicate: false,
      },
    });
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });
    const ephemeral: unknown[] = [];
    transport.subscribe((value) => ephemeral.push(value));
    await transport.connect();

    await expect(
      transport.requestCrdtSync({
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-1",
        requestId: "request-1",
        stateVector,
      })
    ).resolves.toEqual(
      expect.objectContaining({
        transferId: "11111111-1111-4111-8111-111111111111",
        chunks,
      })
    );
    await expect(
      transport.publishCrdtUpdate({
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-1",
        updateId: "22222222-2222-4222-8222-222222222222",
        clientSequence: 1,
        update: encodeStudioCrdtUpdate(new Uint8Array([9, 8, 7])),
      })
    ).resolves.toEqual(
      expect.objectContaining({
        updateId: "22222222-2222-4222-8222-222222222222",
        serverSequence: "13",
      })
    );
    expect(
      socket.emitted.filter(
        ({ event }) => event === "studio:crdt:sync" || event === "studio:crdt:update"
      )
    ).toHaveLength(2);
    expect(ephemeral).toEqual([]);
    transport.close();
  });

  it("coalesces an in-flight updateId retry and deduplicates remote broadcasts", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    socket.holdEvents.add("studio:crdt:update");
    const stateVector = encodeStudioCrdtStateVector(new Uint8Array([0]));
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });
    const durable: StudioCrdtTransportMessage[] = [];
    transport.subscribeCrdt((message) => durable.push(message));
    await transport.connect();
    const request = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-1",
      updateId: "33333333-3333-4333-8333-333333333333",
      clientSequence: 1,
      update: encodeStudioCrdtUpdate(new Uint8Array([5, 6, 7])),
    } as const;
    const first = transport.publishCrdtUpdate(request);
    const retry = transport.publishCrdtUpdate(request);
    expect(retry).toBe(first);
    expect(socket.emitted.filter(({ event }) => event === "studio:crdt:update")).toHaveLength(1);
    socket.reply("studio:crdt:update", {
      ok: true,
      data: {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-1",
        updateId: request.updateId,
        serverSequence: "21",
        serverStateVector: stateVector,
        duplicate: false,
      },
    });
    await expect(first).resolves.toEqual(expect.objectContaining({ serverSequence: "21" }));

    const remoteUpdate = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-1",
      updateId: "44444444-4444-4444-8444-444444444444",
      serverSequence: "22",
      update: request.update,
    } as const;
    socket.serverEmit("studio:crdt:update", remoteUpdate);
    socket.serverEmit("studio:crdt:update", remoteUpdate);
    expect(durable).toEqual([
      expect.objectContaining({ type: "update", update: remoteUpdate }),
    ]);
    transport.close();
  });

  it("rejects a durable CRDT operation when its Socket.IO ACK never arrives", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket({ sessionToken: TOKEN });
    socket.holdEvents.add("studio:crdt:update");
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });
    await transport.connect();
    const request = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-1",
      updateId: "66666666-6666-4666-8666-666666666666",
      clientSequence: 1,
      update: encodeStudioCrdtUpdate(new Uint8Array([5, 4, 3])),
    } as const;

    const publication = transport.publishCrdtUpdate(request);
    const rejected = expect(publication).rejects.toThrow("응답 시간이 초과");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;

    // A very late ACK belongs to the expired operation and must not revive it or emit errors.
    socket.reply("studio:crdt:update", {
      ok: true,
      data: {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-1",
        updateId: request.updateId,
        serverSequence: "23",
        serverStateVector: encodeStudioCrdtStateVector(new Uint8Array([0])),
        duplicate: false,
      },
    });
    transport.close();
  });

  it("rejects a CRDT ACK whose durable operation id does not match the request", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    const stateVector = encodeStudioCrdtStateVector(new Uint8Array([0]));
    socket.ackResponses.set("studio:crdt:update", {
      ok: true,
      data: {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-1",
        updateId: "88888888-8888-4888-8888-888888888888",
        serverSequence: "24",
        serverStateVector: stateVector,
        duplicate: false,
      },
    });
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });
    await transport.connect();

    await expect(
      transport.publishCrdtUpdate({
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-1",
        updateId: "77777777-7777-4777-8777-777777777777",
        clientSequence: 1,
        update: encodeStudioCrdtUpdate(new Uint8Array([1, 2, 3])),
      })
    ).rejects.toThrow("식별자가 요청과 일치하지 않습니다");
    transport.close();
  });

  it("accepts a fresh state-vector sync after an authenticated reconnect", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    const stateVector = encodeStudioCrdtStateVector(new Uint8Array([0]));
    const chunks = encodeStudioCrdtSyncChunks(new Uint8Array([0]));
    socket.ackResponses.set("studio:crdt:sync", {
      ok: true,
      data: {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-1",
        requestId: "reconnect-request",
        transferId: "55555555-5555-4555-8555-555555555555",
        chunks,
        chunkCount: chunks.length,
        totalBytes: 1,
        serverStateVector: stateVector,
        serverSequence: "0",
      },
    });
    const room = new StudioLiveRoom({
      workId: "work-1",
      participant: localParticipant,
      dependencies: {
        transportFactory: createStudioServerLiveTransportFactory(TOKEN, {
          createSocket: () => socket,
          now: () => NOW,
        }),
        now: () => NOW,
      },
    });
    await room.start();
    await room.requestCrdtSync({
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-1",
      requestId: "reconnect-request",
      stateVector,
    });
    expect(socket.emitted.filter(({ event }) => event === "studio:crdt:sync")).toHaveLength(1);

    socket.serverDisconnect();
    socket.serverReconnect();
    await room.requestCrdtSync({
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-1",
      requestId: "reconnect-request",
      stateVector,
    });
    expect(socket.emitted.filter(({ event }) => event === "studio:crdt:sync")).toHaveLength(2);
    room.close();
  });

  it("maps session chat between the protocol envelope and the server chat events", async () => {
    const socket = new FakeSocket({ sessionToken: TOKEN });
    const transport = new StudioLiveSocketTransport(context(), TOKEN, {
      createSocket: () => socket,
      now: () => NOW,
    });
    const received: StudioLiveEnvelope[] = [];
    transport.subscribe((value) => received.push(value as StudioLiveEnvelope));
    await transport.connect();
    activate(transport);
    received.length = 0;

    expect(
      transport.send(
        envelope("chat:message", { messageId: "chat-1", text: "이 장면 톤 어때요?" }, 2)
      )
    ).toBe(true);
    expect(socket.emitted.at(-1)).toEqual({
      event: "studio:chat:send",
      payload: { workId: "work-1", messageId: "chat-1", text: "이 장면 톤 어때요?" },
    });

    socket.serverEmit("studio:chat:message", {
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      messageId: "chat-2",
      text: "좋아요. 대사만 조금 줄여요.",
      sentAt: new Date(NOW).toISOString(),
    });
    socket.serverEmit("studio:chat:message", {
      fromConnectionId: remote.connectionId,
      fromName: remote.name,
      messageId: "chat-control",
      text: "제어문자\u0007포함",
      sentAt: new Date(NOW).toISOString(),
    });
    socket.serverEmit("studio:chat:message", {
      fromConnectionId: "unknown-connection",
      fromName: "미지의 피어",
      messageId: "chat-unknown",
      text: "무시되어야 합니다",
      sentAt: new Date(NOW).toISOString(),
    });

    expect(received.map((value) => value.kind)).toEqual(["chat:message"]);
    expect(received[0]?.payload).toEqual({
      messageId: "chat-2",
      text: "좋아요. 대사만 조금 줄여요.",
    });
    expect(received[0]?.sender.sessionId).toBe(remote.connectionId);
    expect(received[0]?.targetSessionId).toBeNull();
    transport.close();
  });
});
