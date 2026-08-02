import {
  SELF,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  REALTIME_PROTOCOL_VERSION,
  REALTIME_TICKET_PROTOCOL_PREFIX,
  REALTIME_WEBSOCKET_PROTOCOL,
  parseRealtimeServerMessage,
  type RealtimeServerMessage,
} from "../src/protocol";
import { RealtimeRoomStore } from "../src/room-store";
import {
  normalizeRealtimeRoomObjectName,
  type RealtimeRoomScope,
} from "../src/security";
import {
  REALTIME_TICKET_VERSION,
  signRealtimeTicket,
  type RealtimeTicketClaims,
} from "../src/ticket";

const TEST_ORIGIN = "https://toonstudio.cloud";
const TEST_SECRET =
  "toonspectrum-cloudflare-test-secret-32-bytes-minimum";

interface UpgradeResponse extends Response {
  readonly webSocket?: WebSocket;
}

interface AcceptedWebSocket extends WebSocket {
  accept(): void;
}

interface HibernatableTestWebSocket extends WebSocket {
  deserializeAttachment(): unknown;
}

interface MessageWaiter {
  readonly predicate: (message: RealtimeServerMessage) => boolean;
  readonly resolve: (message: RealtimeServerMessage) => void;
  readonly reject: (error: Error) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

class RealtimeMessageInbox {
  private readonly queued: RealtimeServerMessage[] = [];
  private readonly waiters: MessageWaiter[] = [];

  constructor(private readonly socket: AcceptedWebSocket) {
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        this.failAll(new Error("Expected a textual realtime frame"));
        return;
      }
      const parsed = parseRealtimeServerMessage(event.data);
      if (!parsed.ok) {
        this.failAll(
          new Error(`Invalid realtime server frame: ${parsed.code}`),
        );
        return;
      }
      const waiterIndex = this.waiters.findIndex((waiter) =>
        waiter.predicate(parsed.value),
      );
      if (waiterIndex === -1) {
        this.queued.push(parsed.value);
        return;
      }
      const [waiter] = this.waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timeoutId);
      waiter.resolve(parsed.value);
    });
    socket.addEventListener("error", () => {
      this.failAll(new Error("Realtime test WebSocket failed"));
    });
    socket.accept();
  }

  next<Message extends RealtimeServerMessage>(
    predicate: (message: RealtimeServerMessage) => message is Message,
    label?: string,
  ): Promise<Message>;
  next(
    predicate: (message: RealtimeServerMessage) => boolean,
    label?: string,
  ): Promise<RealtimeServerMessage>;
  next(
    predicate: (message: RealtimeServerMessage) => boolean,
    label = "matching",
  ): Promise<RealtimeServerMessage> {
    const queuedIndex = this.queued.findIndex(predicate);
    if (queuedIndex !== -1) {
      const [message] = this.queued.splice(queuedIndex, 1);
      return Promise.resolve(message);
    }
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const waiterIndex = this.waiters.findIndex(
          (waiter) => waiter.timeoutId === timeoutId,
        );
        if (waiterIndex !== -1) {
          this.waiters.splice(waiterIndex, 1);
        }
        reject(
          new Error(
            `Timed out waiting for ${label} realtime server frame; queued=${this.queued
              .map((message) =>
                message.type === "error"
                  ? `${message.type}:${message.code}:${message.channel ?? "none"}`
                  : message.type,
              )
              .join(",")}`,
          ),
        );
      }, 2_500);
      this.waiters.push({ predicate, resolve, reject, timeoutId });
    });
  }

  private failAll(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timeoutId);
      waiter.reject(error);
    }
  }
}

function buildClaims(
  scope: RealtimeRoomScope,
  nonce: string,
  nowMs: number,
  overrides: Partial<
    Pick<
      RealtimeTicketClaims,
      "subject" | "clientId" | "scopes" | "sessionExpiresAtMs"
    >
  > = {},
): RealtimeTicketClaims {
  return {
    version: REALTIME_TICKET_VERSION,
    issuer: "toonspectrum-api",
    audience: "toonspectrum-realtime",
    subject: "artist.integration",
    sessionVersion: 1,
    workId: scope.workId,
    roomId: scope.roomId,
    clientId: "client.integration",
    origin: TEST_ORIGIN,
    scopes: ["presence", "comments", "screen-signaling"],
    nonce,
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + 60_000,
    sessionExpiresAtMs: nowMs + 4 * 60_000,
    ...overrides,
  };
}

async function upgradeRealtimeRoom(
  scope: RealtimeRoomScope,
  ticket: string,
): Promise<UpgradeResponse> {
  return (await SELF.fetch(
    `https://realtime.test/v1/rooms/${encodeURIComponent(
      scope.workId,
    )}/${encodeURIComponent(scope.roomId)}`,
    {
      headers: {
        Origin: TEST_ORIGIN,
        Upgrade: "websocket",
        "Sec-WebSocket-Protocol": [
          REALTIME_WEBSOCKET_PROTOCOL,
          `${REALTIME_TICKET_PROTOCOL_PREFIX}${ticket}`,
        ].join(", "),
      },
    },
  )) as UpgradeResponse;
}

function isMessageType<T extends RealtimeServerMessage["type"]>(
  type: T,
): (
  message: RealtimeServerMessage,
) => message is Extract<RealtimeServerMessage, { readonly type: T }> {
  return (
    message: RealtimeServerMessage,
  ): message is Extract<
    RealtimeServerMessage,
    { readonly type: T }
  > => message.type === type;
}

describe("Cloudflare realtime Worker integration", () => {
  it("serves its local health contract inside workerd", async () => {
    const response = await SELF.fetch("https://realtime.test/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: REALTIME_PROTOCOL_VERSION,
      status: "ok",
      service: "cloudflare-realtime-coordinator",
    });
  });

  it("persists channel state, rejects nonce replay, and survives hibernation plus alarms", async () => {
    const scope = {
      workId: "work.integration",
      roomId: "room.integration",
    } satisfies RealtimeRoomScope;
    const nowMs = Date.now();
    const claims = buildClaims(
      scope,
      `nonce-${crypto.randomUUID()}`,
      nowMs,
    );
    const ticket = await signRealtimeTicket(claims, TEST_SECRET);
    const response = await upgradeRealtimeRoom(scope, ticket);

    expect(response.status).toBe(101);
    expect(
      response.headers.get("Sec-WebSocket-Protocol"),
    ).toBe(REALTIME_WEBSOCKET_PROTOCOL);
    expect(response.webSocket).toBeDefined();

    const socket = response.webSocket as AcceptedWebSocket;
    const roomId = env.REALTIME_ROOMS.idFromName(
      normalizeRealtimeRoomObjectName(scope),
    );
    const roomStub = env.REALTIME_ROOMS.get(roomId);
    const serverSocketState = await runInDurableObject(
      roomStub,
      (_instance, state) => {
        const [serverSocket] = state.getWebSockets();
        return {
          count: state.getWebSockets().length,
          bufferedAmountType: typeof serverSocket?.bufferedAmount,
          bufferedAmount: serverSocket?.bufferedAmount ?? null,
        };
      },
    );
    expect(serverSocketState).toEqual({
      count: 1,
      bufferedAmountType: "undefined",
      bufferedAmount: null,
    });
    const inbox = new RealtimeMessageInbox(socket);
    const welcome = await inbox.next(
      isMessageType("welcome"),
      "welcome",
    );
    const initialSnapshot = await inbox.next(
      isMessageType("presence-snapshot"),
      "initial presence snapshot",
    );

    expect(welcome).toMatchObject({
      version: REALTIME_PROTOCOL_VERSION,
      type: "welcome",
      workId: scope.workId,
      roomId: scope.roomId,
      actorId: claims.subject,
      clientId: claims.clientId,
      scopes: claims.scopes,
      channelStates: {
        presence: { currentSequence: 0, replayFloorSequence: 1 },
        comments: { currentSequence: 0, replayFloorSequence: 1 },
        "screen-signaling": {
          currentSequence: 0,
          replayFloorSequence: 1,
        },
      },
    });
    expect(initialSnapshot).toMatchObject({
      type: "presence-snapshot",
      channel: "presence",
      sequence: 0,
      page: 0,
      complete: true,
      entries: [],
    });

    const presenceKey = `presence-${crypto.randomUUID()}`;
    socket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: presenceKey,
        clientSequence: 1,
        sentAtMs: Date.now(),
        channel: "presence",
        payload: {
          kind: "presence.update",
          pageId: "page.integration",
          profile: {
            displayName: "Integration Artist",
            role: "editor",
            state: "active",
          },
          tool: "g-pen",
        },
      }),
    );
    const presenceAck = await inbox.next(
      (message) =>
        message.type === "ack" &&
        message.idempotencyKey === presenceKey,
      "presence ack",
    );
    const presenceEvent = await inbox.next(
      (message) =>
        message.type === "event" &&
        message.idempotencyKey === presenceKey,
      "presence event",
    );
    expect(presenceAck).toMatchObject({
      channel: "presence",
      sequence: 1,
      duplicate: false,
    });
    expect(presenceEvent).toMatchObject({
      channel: "presence",
      sequence: 1,
      connectionId: welcome.connectionId,
    });

    const replayedUpgrade = await upgradeRealtimeRoom(scope, ticket);
    expect(replayedUpgrade.status).toBe(401);
    await expect(replayedUpgrade.json()).resolves.toMatchObject({
      code: "ticket-replayed",
    });

    const durableBeforeEviction = await runInDurableObject(
      roomStub,
      (_instance, state) => {
        const channelStates = state.storage.sql
          .exec<{
            channel: string;
            current_sequence: number;
            replay_floor_sequence: number;
          }>(
            "SELECT channel, current_sequence, replay_floor_sequence FROM channel_state ORDER BY channel",
          )
          .toArray();
        const receipts = state.storage.sql
          .exec<{ receipt_count: number }>(
            "SELECT COUNT(*) AS receipt_count FROM idempotency_receipt",
          )
          .one();
        const connections = state.storage.sql
          .exec<{ connection_count: number }>(
            "SELECT COUNT(*) AS connection_count FROM connection_registry",
          )
          .one();
        return {
          channelStates,
          receiptCount: receipts.receipt_count,
          connectionCount: connections.connection_count,
        };
      },
    );
    expect(durableBeforeEviction).toEqual({
      channelStates: [
        {
          channel: "comments",
          current_sequence: 0,
          replay_floor_sequence: 1,
        },
        {
          channel: "presence",
          current_sequence: 1,
          replay_floor_sequence: 1,
        },
        {
          channel: "screen-signaling",
          current_sequence: 0,
          replay_floor_sequence: 1,
        },
      ],
      receiptCount: 1,
      connectionCount: 1,
    });

    await evictDurableObject(roomStub);

    const cursorKey = `cursor-${crypto.randomUUID()}`;
    socket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: cursorKey,
        clientSequence: 2,
        sentAtMs: Date.now(),
        channel: "presence",
        payload: {
          kind: "presence.cursor",
          x: 0.625,
          y: 0.375,
          pageId: "page.integration",
          tool: "g-pen",
          drawing: true,
          strokeColor: "#111827",
          strokeWidth: 8,
          strokeOpacity: 1,
          points: [0.5, 0.3, 0.56, 0.34, 0.625, 0.375],
        },
      }),
    );
    const cursorAck = await inbox.next(
      (message) =>
        message.type === "ack" &&
        message.idempotencyKey === cursorKey,
      "post-eviction cursor ack",
    );
    const cursorEvent = await inbox.next(
      (message) =>
        message.type === "event" &&
        message.idempotencyKey === cursorKey,
      "post-eviction cursor event",
    );
    expect(cursorAck).toMatchObject({
      channel: "presence",
      sequence: 2,
      duplicate: false,
    });
    expect(cursorEvent).toMatchObject({
      channel: "presence",
      sequence: 2,
      connectionId: welcome.connectionId,
    });

    const commentKey = `comment-${crypto.randomUUID()}`;
    socket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: commentKey,
        clientSequence: 3,
        sentAtMs: Date.now(),
        channel: "comments",
        payload: {
          kind: "comment.changed",
          threadId: "thread.integration",
          activitySequence: "1",
          change: "created",
        },
      }),
    );
    await inbox.next(
      (message) =>
        message.type === "ack" &&
        message.idempotencyKey === commentKey,
      "comment ack",
    );
    await inbox.next(
      (message) =>
        message.type === "event" &&
        message.idempotencyKey === commentKey,
      "comment event",
    );
    socket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "resume",
        channel: "comments",
        afterSequence: 0,
      }),
    );
    const commentReplay = await inbox.next(
      (message) =>
        message.type === "replay" &&
        message.channel === "comments",
      "comment replay",
    );
    expect(commentReplay).toMatchObject({
      channel: "comments",
      fromSequence: 1,
      toSequence: 1,
      currentSequence: 1,
      complete: true,
    });
    if (commentReplay.type !== "replay") {
      throw new Error("Expected comments replay");
    }
    expect(commentReplay.events).toHaveLength(1);
    expect(commentReplay.events[0]).toMatchObject({
      channel: "comments",
      idempotencyKey: commentKey,
      sequence: 1,
    });
    const resumeAttachment = await runInDurableObject(
      roomStub,
      (_instance, state) => {
        const [serverSocket] = state.getWebSockets();
        return serverSocket?.deserializeAttachment();
      },
    );
    expect(resumeAttachment).toMatchObject({
      resumeRequestCount: 1,
      resumeFrontiers: { comments: 1 },
      completedResumeChannels: ["comments"],
    });
    expect(
      (resumeAttachment as { resumeEgressBytes?: number })
        .resumeEgressBytes,
    ).toBeGreaterThan(0);

    await evictDurableObject(roomStub);
    socket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "resume",
        channel: "comments",
        afterSequence: 0,
      }),
    );
    await expect(
      inbox.next(
        (message) =>
          message.type === "error" &&
          message.code === "sequence-out-of-order",
        "durable non-advancing resume rejection",
      ),
    ).resolves.toMatchObject({
      type: "error",
      code: "sequence-out-of-order",
    });

    await expect(runDurableObjectAlarm(roomStub)).resolves.toBe(true);
    const durableAfterAlarm = await runInDurableObject(
      roomStub,
      (_instance, state) => {
        const presence = state.storage.sql
          .exec<{
            connection_id: string;
            cursor_json: string | null;
          }>(
            "SELECT connection_id, cursor_json FROM presence_state",
          )
          .one();
        return {
          alarmAt: state.storage.getAlarm(),
          presence,
        };
      },
    );
    await expect(durableAfterAlarm.alarmAt).resolves.toEqual(
      expect.any(Number),
    );
    expect(durableAfterAlarm.presence.connection_id).toBe(
      welcome.connectionId,
    );
    const persistedCursor = JSON.parse(
      durableAfterAlarm.presence.cursor_json ?? "null",
    ) as unknown;
    expect(persistedCursor).toMatchObject({
      kind: "presence.cursor",
      x: 0.625,
      y: 0.375,
    });
    expect(persistedCursor).not.toHaveProperty("points");

    socket.close(1000, "integration-complete");
  });

  it("replays predecessor-bound teardown acks without stopping a reused share", async () => {
    const scope = {
      workId: `work.teardown.${crypto.randomUUID()}`,
      roomId: `room.teardown.${crypto.randomUUID()}`,
    } satisfies RealtimeRoomScope;
    const nowMs = Date.now();
    const claims = buildClaims(
      scope,
      `nonce-${crypto.randomUUID()}`,
      nowMs,
      {
        subject: "artist.teardown",
        clientId: "client.teardown",
        scopes: ["screen-signaling"],
      },
    );
    const response = await upgradeRealtimeRoom(
      scope,
      await signRealtimeTicket(claims, TEST_SECRET),
    );
    const socket = response.webSocket as AcceptedWebSocket;
    const inbox = new RealtimeMessageInbox(socket);
    await inbox.next(isMessageType("welcome"), "teardown welcome");

    const announceKey = `announce-${crypto.randomUUID()}`;
    socket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: announceKey,
        clientSequence: 1,
        sentAtMs: Date.now(),
        channel: "screen-signaling",
        payload: {
          kind: "signal.announce",
          shareId: "share.teardown",
          label: "Teardown Share",
        },
      }),
    );
    await inbox.next(
      (message) =>
        message.type === "ack" &&
        message.idempotencyKey === announceKey,
      "announce ack",
    );
    await inbox.next(
      (message) =>
        message.type === "event" &&
        message.idempotencyKey === announceKey,
      "announce event",
    );

    const roomId = env.REALTIME_ROOMS.idFromName(
      normalizeRealtimeRoomObjectName(scope),
    );
    const roomStub = env.REALTIME_ROOMS.get(roomId);
    await runInDurableObject(roomStub, (_instance, state) => {
      state.storage.sql.exec(
        `UPDATE receipt_usage
         SET receipt_count = 512,
             receipt_bytes = 8388608
         WHERE singleton = 1`,
      );
    });

    const stopKey = `stop-${crypto.randomUUID()}`;
    const stopPublish = JSON.stringify({
      version: REALTIME_PROTOCOL_VERSION,
      type: "publish",
      idempotencyKey: stopKey,
      clientSequence: 2,
      sentAtMs: Date.now(),
      channel: "screen-signaling",
      payload: {
        kind: "signal.stop",
        shareId: "share.teardown",
      },
    });
    socket.send(stopPublish);
    const firstStopAck = await inbox.next(
      (message) =>
        message.type === "ack" &&
        message.idempotencyKey === stopKey,
      "predecessor-bound stop ack",
    );
    expect(firstStopAck).toMatchObject({
      type: "ack",
      duplicate: false,
      channel: "screen-signaling",
    });
    if (firstStopAck.type !== "ack") {
      throw new Error("Expected the first teardown frame to be an ACK");
    }
    const firstStopSequence = firstStopAck.sequence;
    await inbox.next(
      (message) =>
        message.type === "event" &&
        message.idempotencyKey === stopKey,
      "reserved stop event",
    );

    socket.send(stopPublish);
    const firstDuplicateAck = await inbox.next(
      (message) =>
        message.type === "ack" &&
        message.idempotencyKey === stopKey &&
        message.duplicate,
      "predecessor-bound duplicate ack",
    );
    expect(firstDuplicateAck).toMatchObject({
      type: "ack",
      duplicate: true,
      channel: "screen-signaling",
      sequence: firstStopSequence,
    });

    await runInDurableObject(roomStub, (_instance, state) => {
      state.storage.sql.exec(
        `UPDATE receipt_usage
         SET receipt_count = (
               SELECT COUNT(*) FROM idempotency_receipt
             ),
             receipt_bytes = (
               SELECT COALESCE(SUM(storage_bytes), 0)
               FROM idempotency_receipt
             )
         WHERE singleton = 1`,
      );
    });

    const replacementAnnounceKey = `replacement-${crypto.randomUUID()}`;
    socket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: replacementAnnounceKey,
        clientSequence: 3,
        sentAtMs: Date.now(),
        channel: "screen-signaling",
        payload: {
          kind: "signal.announce",
          shareId: "share.teardown",
          label: "Replacement Share",
        },
      }),
    );
    await inbox.next(
      (message) =>
        message.type === "ack" &&
        message.idempotencyKey === replacementAnnounceKey,
      "replacement announce ack",
    );
    await inbox.next(
      (message) =>
        message.type === "event" &&
        message.idempotencyKey === replacementAnnounceKey,
      "replacement announce event",
    );

    socket.send(stopPublish);
    const replacementDuplicateAck = await inbox.next(
      (message) =>
        message.type === "ack" &&
        message.idempotencyKey === stopKey &&
        message.duplicate,
      "retained teardown duplicate ack",
    );
    expect(replacementDuplicateAck).toMatchObject({
      type: "ack",
      duplicate: true,
      channel: "screen-signaling",
      sequence: firstStopSequence,
    });

    socket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: stopKey,
        clientSequence: 4,
        sentAtMs: Date.now(),
        channel: "screen-signaling",
        payload: {
          kind: "signal.announce",
          shareId: "share.conflicting",
          label: "Must Not Be Created",
        },
      }),
    );
    await expect(
      inbox.next(
        (message) =>
          message.type === "error" &&
          message.code === "idempotency-conflict" &&
          message.idempotencyKey === stopKey,
        "cross-lane idempotency conflict",
      ),
    ).resolves.toMatchObject({
      type: "error",
      code: "idempotency-conflict",
      retryable: false,
    });

    const otherClaims = buildClaims(
      scope,
      `nonce-${crypto.randomUUID()}`,
      Date.now(),
      {
        subject: "artist.teardown.other",
        clientId: "client.teardown.other",
        scopes: ["screen-signaling"],
      },
    );
    const otherResponse = await upgradeRealtimeRoom(
      scope,
      await signRealtimeTicket(otherClaims, TEST_SECRET),
    );
    const otherSocket =
      otherResponse.webSocket as AcceptedWebSocket;
    const otherInbox = new RealtimeMessageInbox(otherSocket);
    await otherInbox.next(
      isMessageType("welcome"),
      "other teardown welcome",
    );
    const otherAnnounceKey = `other-announce-${crypto.randomUUID()}`;
    otherSocket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: otherAnnounceKey,
        clientSequence: 1,
        sentAtMs: Date.now(),
        channel: "screen-signaling",
        payload: {
          kind: "signal.announce",
          shareId: "share.teardown.other",
          label: "Other Actor Share",
        },
      }),
    );
    await otherInbox.next(
      (message) =>
        message.type === "ack" &&
        message.idempotencyKey === otherAnnounceKey,
      "other announce ack",
    );
    await otherInbox.next(
      (message) =>
        message.type === "event" &&
        message.idempotencyKey === otherAnnounceKey,
      "other announce event",
    );

    otherSocket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: stopKey,
        clientSequence: 2,
        sentAtMs: Date.now(),
        channel: "screen-signaling",
        payload: {
          kind: "signal.stop",
          shareId: "share.teardown.other",
        },
      }),
    );
    await expect(
      otherInbox.next(
        (message) =>
          message.type === "error" &&
          message.code === "idempotency-conflict" &&
          message.idempotencyKey === stopKey,
        "cross-user idempotency conflict",
      ),
    ).resolves.toMatchObject({
      type: "error",
      code: "idempotency-conflict",
      retryable: false,
    });

    const teardownState = await runInDurableObject(
      roomStub,
      (_instance, state) => {
        const rows = state.storage.sql
          .exec<{
            shares: number;
            conflicting_shares: number;
            other_shares: number;
            ordinary_receipts: number;
            legacy_teardown_receipts: number;
            teardown_acks: number;
            stop_events: number;
            total_events: number;
            idempotency_fingerprint_length: number;
            request_fingerprint_length: number;
            predecessor_token_length: number;
          }>(
            `SELECT
               (SELECT COUNT(*) FROM screen_share) AS shares,
               (SELECT COUNT(*) FROM screen_share
                WHERE share_id = 'share.conflicting') AS conflicting_shares,
               (SELECT COUNT(*) FROM screen_share
                WHERE share_id = 'share.teardown.other') AS other_shares,
               (SELECT COUNT(*) FROM idempotency_receipt) AS ordinary_receipts,
               (SELECT COUNT(*) FROM teardown_idempotency_receipt)
                 AS legacy_teardown_receipts,
               (SELECT COUNT(*) FROM teardown_ack_tombstone) AS teardown_acks,
               (SELECT COUNT(*) FROM event_log
                WHERE envelope_json LIKE '%"kind":"signal.stop"%')
                 AS stop_events,
               (SELECT COUNT(*) FROM event_log) AS total_events,
               (SELECT length(idempotency_fingerprint)
                FROM teardown_ack_tombstone LIMIT 1)
                 AS idempotency_fingerprint_length,
               (SELECT length(request_fingerprint)
                FROM teardown_ack_tombstone LIMIT 1)
                 AS request_fingerprint_length,
               (SELECT length(predecessor_token)
                FROM teardown_ack_tombstone LIMIT 1)
                 AS predecessor_token_length`,
          )
          .one();
        return rows;
      },
    );
    expect(teardownState).toEqual({
      shares: 2,
      conflicting_shares: 0,
      other_shares: 1,
      ordinary_receipts: 3,
      legacy_teardown_receipts: 0,
      teardown_acks: 1,
      stop_events: 1,
      total_events: 4,
      idempotency_fingerprint_length: 64,
      request_fingerprint_length: 64,
      predecessor_token_length: 32,
    });
    otherSocket.close(1000, "other-teardown-complete");
    socket.close(1000, "teardown-complete");
  });

  it("emits alarm cleanup leave/stop exactly once without cleanup receipts", async () => {
    const scope = {
      workId: `work.cleanup.${crypto.randomUUID()}`,
      roomId: `room.cleanup.${crypto.randomUUID()}`,
    } satisfies RealtimeRoomScope;
    const nowMs = Date.now();
    const ownerClaims = buildClaims(
      scope,
      `nonce-${crypto.randomUUID()}`,
      nowMs,
      {
        subject: "artist.cleanup.owner",
        clientId: "client.cleanup.owner",
        scopes: ["presence", "screen-signaling"],
      },
    );
    const observerClaims = buildClaims(
      scope,
      `nonce-${crypto.randomUUID()}`,
      nowMs,
      {
        subject: "artist.cleanup.observer",
        clientId: "client.cleanup.observer",
        scopes: ["presence", "screen-signaling"],
      },
    );
    const ownerResponse = await upgradeRealtimeRoom(
      scope,
      await signRealtimeTicket(ownerClaims, TEST_SECRET),
    );
    const observerResponse = await upgradeRealtimeRoom(
      scope,
      await signRealtimeTicket(observerClaims, TEST_SECRET),
    );
    const ownerSocket = ownerResponse.webSocket as AcceptedWebSocket;
    const observerSocket =
      observerResponse.webSocket as AcceptedWebSocket;
    const ownerInbox = new RealtimeMessageInbox(ownerSocket);
    const observerInbox = new RealtimeMessageInbox(observerSocket);
    await ownerInbox.next(isMessageType("welcome"), "owner welcome");
    await ownerInbox.next(
      isMessageType("presence-snapshot"),
      "owner snapshot",
    );
    await observerInbox.next(
      isMessageType("welcome"),
      "observer welcome",
    );
    await observerInbox.next(
      isMessageType("presence-snapshot"),
      "observer snapshot",
    );

    const presenceKey = `presence-${crypto.randomUUID()}`;
    ownerSocket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: presenceKey,
        clientSequence: 1,
        sentAtMs: Date.now(),
        channel: "presence",
        payload: {
          kind: "presence.update",
          pageId: null,
          profile: {
            displayName: "Cleanup Owner",
            role: "editor",
            state: "active",
          },
          tool: null,
        },
      }),
    );
    await ownerInbox.next(
      (message) =>
        message.type === "ack" &&
        message.idempotencyKey === presenceKey,
      "owner presence ack",
    );
    await ownerInbox.next(
      (message) =>
        message.type === "event" &&
        message.idempotencyKey === presenceKey,
      "owner presence echo",
    );
    await observerInbox.next(
      (message) =>
        message.type === "event" &&
        message.idempotencyKey === presenceKey,
      "observer presence event",
    );

    const announceKey = `announce-${crypto.randomUUID()}`;
    ownerSocket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: announceKey,
        clientSequence: 2,
        sentAtMs: Date.now(),
        channel: "screen-signaling",
        payload: {
          kind: "signal.announce",
          shareId: "share.cleanup",
          label: "Cleanup Share",
        },
      }),
    );
    await ownerInbox.next(
      (message) =>
        message.type === "ack" &&
        message.idempotencyKey === announceKey,
      "owner announce ack",
    );
    await ownerInbox.next(
      (message) =>
        message.type === "event" &&
        message.idempotencyKey === announceKey,
      "owner announce echo",
    );
    await observerInbox.next(
      (message) =>
        message.type === "event" &&
        message.idempotencyKey === announceKey,
      "observer announce event",
    );

    const roomId = env.REALTIME_ROOMS.idFromName(
      normalizeRealtimeRoomObjectName(scope),
    );
    const roomStub = env.REALTIME_ROOMS.get(roomId);
    await runInDurableObject(roomStub, (_instance, state) => {
      for (const serverSocket of state.getWebSockets()) {
        const attachment = serverSocket.deserializeAttachment() as {
          readonly clientId?: string;
        };
        if (attachment.clientId === ownerClaims.clientId) {
          serverSocket.serializeAttachment({
            ...attachment,
            sessionExpiresAtMs: Date.now() - 1,
          });
        }
      }
    });

    await expect(runDurableObjectAlarm(roomStub)).resolves.toBe(true);
    const leave = await observerInbox.next(
      (message) =>
        message.type === "event" &&
        message.payload.kind === "presence.leave",
      "alarm presence leave",
    );
    const stop = await observerInbox.next(
      (message) =>
        message.type === "event" &&
        message.payload.kind === "signal.stop",
      "alarm screen stop",
    );
    expect(leave).toMatchObject({
      type: "event",
      clientId: ownerClaims.clientId,
      payload: { kind: "presence.leave" },
    });
    expect(stop).toMatchObject({
      type: "event",
      clientId: ownerClaims.clientId,
      payload: {
        kind: "signal.stop",
        shareId: "share.cleanup",
      },
    });

    await expect(runDurableObjectAlarm(roomStub)).resolves.toBe(true);
    const cleanupState = await runInDurableObject(
      roomStub,
      (_instance, state) => {
        const rows = state.storage.sql
          .exec<{ envelope_json: string }>(
            "SELECT envelope_json FROM event_log ORDER BY channel, sequence",
          )
          .toArray();
        const receipts = state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM idempotency_receipt",
          )
          .one();
        const signaling = state.storage.sql
          .exec<{
            shares: number;
            members: number;
            peers: number;
          }>(
            `SELECT
               (SELECT COUNT(*) FROM screen_share) AS shares,
               (SELECT COUNT(*) FROM screen_session_member) AS members,
               (SELECT COUNT(*) FROM screen_peer) AS peers`,
          )
          .one();
        return {
          events: rows.map((row: { readonly envelope_json: string }) =>
            JSON.parse(row.envelope_json) as {
              readonly payload?: { readonly kind?: string };
            },
          ),
          receiptCount: receipts.count,
          signaling,
        };
      },
    );
    expect(
      cleanupState.events.filter(
        (event: { readonly payload?: { readonly kind?: string } }) =>
          event.payload?.kind === "presence.leave",
      ),
    ).toHaveLength(1);
    expect(
      cleanupState.events.filter(
        (event: { readonly payload?: { readonly kind?: string } }) =>
          event.payload?.kind === "signal.stop",
      ),
    ).toHaveLength(1);
    expect(cleanupState.receiptCount).toBe(2);
    expect(cleanupState.signaling).toEqual({
      shares: 0,
      members: 0,
      peers: 0,
    });

    ownerSocket.close(1000, "cleanup-owner-complete");
    observerSocket.close(1000, "cleanup-observer-complete");
  });

  it("reconciles persisted orphan connections after eviction exactly once", async () => {
    const scope = {
      workId: `work.reconcile.${crypto.randomUUID()}`,
      roomId: `room.reconcile.${crypto.randomUUID()}`,
    } satisfies RealtimeRoomScope;
    const nowMs = Date.now();
    const observerClaims = buildClaims(
      scope,
      `nonce-${crypto.randomUUID()}`,
      nowMs,
      {
        subject: "artist.reconcile.observer",
        clientId: "client.reconcile.observer",
        scopes: ["presence", "screen-signaling"],
      },
    );
    const observerResponse = await upgradeRealtimeRoom(
      scope,
      await signRealtimeTicket(observerClaims, TEST_SECRET),
    );
    const observerSocket =
      observerResponse.webSocket as AcceptedWebSocket;
    const observerInbox = new RealtimeMessageInbox(observerSocket);
    await observerInbox.next(
      isMessageType("welcome"),
      "reconcile observer welcome",
    );
    await observerInbox.next(
      isMessageType("presence-snapshot"),
      "reconcile observer snapshot",
    );

    const roomId = env.REALTIME_ROOMS.idFromName(
      normalizeRealtimeRoomObjectName(scope),
    );
    const roomStub = env.REALTIME_ROOMS.get(roomId);
    const orphanConnectionId = `connection.${crypto.randomUUID()}`;
    const orphanActorId = "artist.reconcile.orphan";
    const orphanClientId = "client.reconcile.orphan";
    const orphanExpiresAtMs = Date.now() + 60_000;
    await runInDurableObject(roomStub, (_instance, state) => {
      state.storage.transactionSync(() => {
        state.storage.sql.exec(
          `INSERT INTO connection_registry
            (connection_id, actor_id, client_id, session_expires_at_ms)
           VALUES (?, ?, ?, ?)`,
          orphanConnectionId,
          orphanActorId,
          orphanClientId,
          orphanExpiresAtMs,
        );
        state.storage.sql.exec(
          `INSERT INTO presence_state
            (connection_id, actor_id, client_id, update_json,
             cursor_json, updated_at_ms)
           VALUES (?, ?, ?, ?, NULL, ?)`,
          orphanConnectionId,
          orphanActorId,
          orphanClientId,
          JSON.stringify({
            kind: "presence.update",
            pageId: null,
            profile: {
              displayName: "Orphan Artist",
              role: "editor",
              state: "active",
            },
            tool: null,
          }),
          Date.now(),
        );
        state.storage.sql.exec(
          `INSERT INTO screen_share
            (share_id, owner_actor_id, owner_client_id,
             owner_connection_id, label, active, expires_at_ms,
             updated_at_ms)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
          "share.reconcile.orphan",
          orphanActorId,
          orphanClientId,
          orphanConnectionId,
          "Orphan Share",
          orphanExpiresAtMs,
          Date.now(),
        );
        state.storage.sql.exec(
          `INSERT INTO screen_session_member
            (session_id, share_id, actor_id, client_id, role,
             status, expires_at_ms)
           VALUES (?, ?, ?, ?, 'owner', 'approved', ?)`,
          "share.reconcile.orphan",
          "share.reconcile.orphan",
          orphanActorId,
          orphanClientId,
          orphanExpiresAtMs,
        );
      });
    });

    await evictDurableObject(roomStub);
    await expect(runDurableObjectAlarm(roomStub)).resolves.toBe(true);
    await expect(
      observerInbox.next(
        (message) =>
          message.type === "event" &&
          message.actorId === orphanActorId &&
          message.payload.kind === "presence.leave",
        "reconciled presence leave",
      ),
    ).resolves.toMatchObject({
      connectionId: orphanConnectionId,
      payload: { kind: "presence.leave" },
    });
    await expect(
      observerInbox.next(
        (message) =>
          message.type === "event" &&
          message.actorId === orphanActorId &&
          message.payload.kind === "signal.stop",
        "reconciled share stop",
      ),
    ).resolves.toMatchObject({
      connectionId: orphanConnectionId,
      payload: {
        kind: "signal.stop",
        shareId: "share.reconcile.orphan",
      },
    });

    await evictDurableObject(roomStub);
    await expect(runDurableObjectAlarm(roomStub)).resolves.toBe(true);
    const reconciledState = await runInDurableObject(
      roomStub,
      (_instance, state) => {
        const rows = state.storage.sql
          .exec<{ channel: string; envelope_json: string }>(
            `SELECT channel, envelope_json
             FROM event_log
             WHERE channel IN ('presence', 'screen-signaling')
             ORDER BY channel, sequence`,
          )
          .toArray();
        const counts = state.storage.sql
          .exec<{
            connections: number;
            presence: number;
            shares: number;
            cleanup_receipts: number;
          }>(
            `SELECT
               (SELECT COUNT(*) FROM connection_registry
                WHERE connection_id = ?) AS connections,
               (SELECT COUNT(*) FROM presence_state
                WHERE connection_id = ?) AS presence,
               (SELECT COUNT(*) FROM screen_share
                WHERE owner_connection_id = ?) AS shares,
               (SELECT COUNT(*) FROM idempotency_receipt)
                 + (SELECT COUNT(*) FROM teardown_idempotency_receipt)
                 + (SELECT COUNT(*) FROM teardown_ack_tombstone)
                 AS cleanup_receipts`,
            orphanConnectionId,
            orphanConnectionId,
            orphanConnectionId,
          )
          .one();
        return {
          eventKinds: rows
            .map(
              (row: { readonly envelope_json: string }) =>
                JSON.parse(row.envelope_json) as {
                  readonly actorId?: string;
                  readonly payload?: { readonly kind?: string };
                },
            )
            .filter(
              (event: {
                readonly actorId?: string;
              }) => event.actorId === orphanActorId,
            )
            .map(
              (event: {
                readonly payload?: { readonly kind?: string };
              }) => event.payload?.kind,
            ),
          counts,
        };
      },
    );
    expect(reconciledState).toEqual({
      eventKinds: ["presence.leave", "signal.stop"],
      counts: {
        connections: 0,
        presence: 0,
        shares: 0,
        cleanup_receipts: 0,
      },
    });
    observerSocket.close(1000, "reconcile-complete");
  });

  it("runs the same exact-once cleanup from webSocketError", async () => {
    const scope = {
      workId: `work.socket-error.${crypto.randomUUID()}`,
      roomId: `room.socket-error.${crypto.randomUUID()}`,
    } satisfies RealtimeRoomScope;
    const nowMs = Date.now();
    const ownerClaims = buildClaims(
      scope,
      `nonce-${crypto.randomUUID()}`,
      nowMs,
      {
        subject: "artist.socket-error.owner",
        clientId: "client.socket-error.owner",
        scopes: ["presence", "screen-signaling"],
      },
    );
    const observerClaims = buildClaims(
      scope,
      `nonce-${crypto.randomUUID()}`,
      nowMs,
      {
        subject: "artist.socket-error.observer",
        clientId: "client.socket-error.observer",
        scopes: ["presence", "screen-signaling"],
      },
    );
    const ownerResponse = await upgradeRealtimeRoom(
      scope,
      await signRealtimeTicket(ownerClaims, TEST_SECRET),
    );
    const observerResponse = await upgradeRealtimeRoom(
      scope,
      await signRealtimeTicket(observerClaims, TEST_SECRET),
    );
    const ownerSocket = ownerResponse.webSocket as AcceptedWebSocket;
    const observerSocket =
      observerResponse.webSocket as AcceptedWebSocket;
    const ownerInbox = new RealtimeMessageInbox(ownerSocket);
    const observerInbox = new RealtimeMessageInbox(observerSocket);
    const ownerWelcome = await ownerInbox.next(
      isMessageType("welcome"),
      "socket-error owner welcome",
    );
    await ownerInbox.next(
      isMessageType("presence-snapshot"),
      "socket-error owner snapshot",
    );
    await observerInbox.next(
      isMessageType("welcome"),
      "socket-error observer welcome",
    );
    await observerInbox.next(
      isMessageType("presence-snapshot"),
      "socket-error observer snapshot",
    );

    const roomId = env.REALTIME_ROOMS.idFromName(
      normalizeRealtimeRoomObjectName(scope),
    );
    const roomStub = env.REALTIME_ROOMS.get(roomId);
    await runInDurableObject(roomStub, async (instance, state) => {
      const ownerServerSocket = state
        .getWebSockets()
        .find((serverSocket: HibernatableTestWebSocket) => {
          const attachment =
            serverSocket.deserializeAttachment() as {
              readonly connectionId?: string;
            };
          return (
            attachment.connectionId === ownerWelcome.connectionId
          );
        });
      if (ownerServerSocket === undefined) {
        throw new Error("Owner server socket is unavailable");
      }
      state.storage.transactionSync(() => {
        state.storage.sql.exec(
          `INSERT INTO presence_state
            (connection_id, actor_id, client_id, update_json,
             cursor_json, updated_at_ms)
           VALUES (?, ?, ?, ?, NULL, ?)`,
          ownerWelcome.connectionId,
          ownerClaims.subject,
          ownerClaims.clientId,
          JSON.stringify({
            kind: "presence.update",
            pageId: null,
            profile: {
              displayName: "Socket Error Owner",
              role: "editor",
              state: "active",
            },
            tool: null,
          }),
          Date.now(),
        );
        state.storage.sql.exec(
          `INSERT INTO screen_share
            (share_id, owner_actor_id, owner_client_id,
             owner_connection_id, label, active, expires_at_ms,
             updated_at_ms)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
          "share.socket-error",
          ownerClaims.subject,
          ownerClaims.clientId,
          ownerWelcome.connectionId,
          "Socket Error Share",
          ownerClaims.sessionExpiresAtMs,
          Date.now(),
        );
        state.storage.sql.exec(
          `INSERT INTO screen_session_member
            (session_id, share_id, actor_id, client_id, role,
             status, expires_at_ms)
           VALUES (?, ?, ?, ?, 'owner', 'approved', ?)`,
          "share.socket-error",
          "share.socket-error",
          ownerClaims.subject,
          ownerClaims.clientId,
          ownerClaims.sessionExpiresAtMs,
        );
      });
      await (
        instance as unknown as {
          webSocketError(
            webSocket: WebSocket,
            error: unknown,
          ): Promise<void>;
        }
      ).webSocketError(
        ownerServerSocket,
        new Error("synthetic socket error"),
      );
    });

    await expect(
      observerInbox.next(
        (message) =>
          message.type === "event" &&
          message.connectionId === ownerWelcome.connectionId &&
          message.payload.kind === "presence.leave",
        "socket-error presence leave",
      ),
    ).resolves.toMatchObject({
      payload: { kind: "presence.leave" },
    });
    await expect(
      observerInbox.next(
        (message) =>
          message.type === "event" &&
          message.connectionId === ownerWelcome.connectionId &&
          message.payload.kind === "signal.stop",
        "socket-error share stop",
      ),
    ).resolves.toMatchObject({
      payload: {
        kind: "signal.stop",
        shareId: "share.socket-error",
      },
    });
    const errorCleanupState = await runInDurableObject(
      roomStub,
      (_instance, state) =>
        state.storage.sql
          .exec<{
            connections: number;
            presence: number;
            shares: number;
            cleanup_receipts: number;
          }>(
            `SELECT
               (SELECT COUNT(*) FROM connection_registry
                WHERE connection_id = ?) AS connections,
               (SELECT COUNT(*) FROM presence_state
                WHERE connection_id = ?) AS presence,
               (SELECT COUNT(*) FROM screen_share
                WHERE owner_connection_id = ?) AS shares,
               (SELECT COUNT(*) FROM idempotency_receipt)
                 + (SELECT COUNT(*) FROM teardown_idempotency_receipt)
                 + (SELECT COUNT(*) FROM teardown_ack_tombstone)
                 AS cleanup_receipts`,
            ownerWelcome.connectionId,
            ownerWelcome.connectionId,
            ownerWelcome.connectionId,
          )
          .one(),
    );
    expect(errorCleanupState).toEqual({
      connections: 0,
      presence: 0,
      shares: 0,
      cleanup_receipts: 0,
    });
    observerSocket.close(1000, "socket-error-observer-complete");
  });

  it("does not create leave events or receipts for idle connection churn", async () => {
    const scope = {
      workId: `work.churn.${crypto.randomUUID()}`,
      roomId: `room.churn.${crypto.randomUUID()}`,
    } satisfies RealtimeRoomScope;
    const nowMs = Date.now();
    const claims = buildClaims(
      scope,
      `nonce-${crypto.randomUUID()}`,
      nowMs,
      {
        subject: "artist.churn",
        clientId: "client.churn",
        scopes: ["presence"],
      },
    );
    const response = await upgradeRealtimeRoom(
      scope,
      await signRealtimeTicket(claims, TEST_SECRET),
    );
    const socket = response.webSocket as AcceptedWebSocket;
    const inbox = new RealtimeMessageInbox(socket);
    await inbox.next(isMessageType("welcome"), "churn welcome");
    await inbox.next(
      isMessageType("presence-snapshot"),
      "churn snapshot",
    );
    const closed = new Promise<void>((resolve) => {
      socket.addEventListener("close", () => resolve(), { once: true });
    });
    socket.close(1000, "idle-churn");
    await closed;

    const roomId = env.REALTIME_ROOMS.idFromName(
      normalizeRealtimeRoomObjectName(scope),
    );
    const roomStub = env.REALTIME_ROOMS.get(roomId);
    const churnState = await runInDurableObject(
      roomStub,
      (_instance, state) => {
        const events = state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM event_log",
          )
          .one();
        const receipts = state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM idempotency_receipt",
          )
          .one();
        const connections = state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM connection_registry",
          )
          .one();
        return {
          eventCount: events.count,
          receiptCount: receipts.count,
          connectionCount: connections.count,
        };
      },
    );
    expect(churnState).toEqual({
      eventCount: 0,
      receiptCount: 0,
      connectionCount: 0,
    });
  });

  it("persists resume frontiers and enforces the durable request budget", async () => {
    const scope = {
      workId: `work.resume.${crypto.randomUUID()}`,
      roomId: `room.resume.${crypto.randomUUID()}`,
    } satisfies RealtimeRoomScope;
    const nowMs = Date.now();
    const claims = buildClaims(
      scope,
      `nonce-${crypto.randomUUID()}`,
      nowMs,
      {
        subject: "artist.resume",
        clientId: "client.resume",
        scopes: ["comments"],
      },
    );
    const response = await upgradeRealtimeRoom(
      scope,
      await signRealtimeTicket(claims, TEST_SECRET),
    );
    const socket = response.webSocket as AcceptedWebSocket;
    const inbox = new RealtimeMessageInbox(socket);
    await inbox.next(isMessageType("welcome"), "resume welcome");

    const roomId = env.REALTIME_ROOMS.idFromName(
      normalizeRealtimeRoomObjectName(scope),
    );
    const roomStub = env.REALTIME_ROOMS.get(roomId);
    await runInDurableObject(roomStub, (_instance, state) => {
      const store = new RealtimeRoomStore(state.storage);
      for (let sequence = 1; sequence <= 385; sequence += 1) {
        store.appendSystemEvent({
          idempotencyKey: `seed-comment-${sequence
            .toString()
            .padStart(4, "0")}`,
          actorId: "artist.seed",
          clientId: "client.seed",
          connectionId: "connection.seed",
          channel: "comments",
          serverAtMs: nowMs,
          eventExpiresAtMs: nowMs + 60_000,
          payload: {
            kind: "comment.changed",
            threadId: "thread.seed",
            activitySequence: sequence.toString(),
            change: "replied",
          },
        });
      }
    });

    let afterSequence = 0;
    for (const expectedTo of [128, 256, 384]) {
      socket.send(
        JSON.stringify({
          version: REALTIME_PROTOCOL_VERSION,
          type: "resume",
          channel: "comments",
          afterSequence,
        }),
      );
      const replay = await inbox.next(
        (message) =>
          message.type === "replay" &&
          message.channel === "comments" &&
          message.toSequence === expectedTo,
        `resume page ${expectedTo}`,
      );
      expect(replay).toMatchObject({
        fromSequence: afterSequence + 1,
        toSequence: expectedTo,
        currentSequence: 385,
        complete: false,
      });
      afterSequence = expectedTo;
      await evictDurableObject(roomStub);
    }

    const attachment = await runInDurableObject(
      roomStub,
      (_instance, state) => {
        const [serverSocket] = state.getWebSockets();
        return serverSocket?.deserializeAttachment();
      },
    );
    expect(attachment).toMatchObject({
      resumeRequestCount: 3,
      resumeFrontiers: { comments: 384 },
      completedResumeChannels: [],
    });
    expect(
      (attachment as { resumeEgressBytes?: number })
        .resumeEgressBytes,
    ).toBeGreaterThan(0);

    socket.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "resume",
        channel: "comments",
        afterSequence: 384,
      }),
    );
    await expect(
      inbox.next(
        (message) =>
          message.type === "error" &&
          message.code === "backpressure",
        "resume budget rejection",
      ),
    ).resolves.toMatchObject({
      type: "error",
      code: "backpressure",
      retryable: true,
      channel: "comments",
    });
  });
});
