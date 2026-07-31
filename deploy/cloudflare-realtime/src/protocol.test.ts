import { describe, expect, it } from "vitest";

import {
  REALTIME_MAX_INBOUND_FRAME_BYTES,
  REALTIME_PROTOCOL_VERSION,
  areRealtimePayloadsEquivalent,
  isServerEventMessage,
  parseRealtimeClientMessage,
  parseRealtimeServerMessage,
  serializeRealtimeServerMessage,
} from "./protocol";

function publish(
  channel: "presence" | "comments" | "screen-signaling",
  payload: unknown,
): string {
  return JSON.stringify({
    version: REALTIME_PROTOCOL_VERSION,
    type: "publish",
    idempotencyKey: "event-key-0001",
    clientSequence: 1,
    sentAtMs: 1_700_000_000_000,
    channel,
    payload,
  });
}

describe("realtime protocol", () => {
  it("accepts an exact presence update", () => {
    const parsed = parseRealtimeClientMessage(
      publish("presence", {
        kind: "presence.update",
        pageId: "page-1",
        profile: {
          displayName: "작가 1",
          role: "editor",
          state: "active",
        },
        tool: "g-pen",
      }),
    );

    expect(parsed).toMatchObject({
      ok: true,
      value: { type: "publish", channel: "presence" },
    });
  });

  it("accepts the canonical 64-unit tool boundary and rejects 65", () => {
    const payload = {
      kind: "presence.update",
      pageId: null,
      profile: {
        displayName: "작가 1",
        role: "editor",
        state: "active",
      },
      tool: "t".repeat(64),
    };
    expect(
      parseRealtimeClientMessage(publish("presence", payload)).ok,
    ).toBe(true);
    expect(
      parseRealtimeClientMessage(
        publish("presence", {
          ...payload,
          tool: "t".repeat(65),
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
    expect(
      parseRealtimeClientMessage(
        publish("presence", {
          ...payload,
          tool: "   ",
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
    expect(
      parseRealtimeClientMessage(
        publish("presence", {
          ...payload,
          profile: {
            ...payload.profile,
            displayName: "작가\u0000",
          },
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
  });

  it("accepts Studio-normalized live cursors and rejects coordinates outside the viewport contract", () => {
    const cursor = {
      kind: "presence.cursor",
      x: 0.25,
      y: 0.75,
      pageId: "page-1",
      tool: "chalk",
      drawing: true,
      strokeColor: "#123456",
      strokeWidth: 12,
      strokeOpacity: 0.6,
      points: [120, 240, 125, 248],
    };
    expect(parseRealtimeClientMessage(publish("presence", cursor)).ok).toBe(
      true,
    );
    expect(
      parseRealtimeClientMessage(
        publish("presence", { ...cursor, x: 1.01 }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
  });

  it("accepts comment invalidation and targeted signaling payloads", () => {
    expect(
      parseRealtimeClientMessage(
        publish("comments", {
          kind: "comment.changed",
          threadId: "thread-1",
          activitySequence: "42",
          change: "replied",
        }),
      ).ok,
    ).toBe(true);

    expect(
      parseRealtimeClientMessage(
        publish("screen-signaling", {
          kind: "signal.offer",
          sessionId: "screen-session-1",
          peerConnectionId: "peer-1",
          targetClientId: "client-2",
          sdp: "v=0\\r\\no=- 1 1 IN IP4 127.0.0.1",
        }),
      ).ok,
    ).toBe(true);

    expect(
      parseRealtimeClientMessage(
        publish("screen-signaling", {
          kind: "signal.request",
          shareId: "screen-session-1",
          sessionId: "screen-session-1",
          targetClientId: "client-1",
        }),
      ).ok,
    ).toBe(true);
    expect(
      parseRealtimeClientMessage(
        publish("screen-signaling", {
          kind: "signal.access",
          shareId: "screen-session-1",
          sessionId: "screen-session-1",
          targetClientId: "client-2",
          decision: "approved",
        }),
      ).ok,
    ).toBe(true);
    expect(
      parseRealtimeClientMessage(
        publish("screen-signaling", {
          kind: "signal.ice",
          sessionId: "screen-session-1",
          peerConnectionId: "peer-1",
          targetClientId: "client-2",
          candidate: {
            candidate: "candidate:1 1 UDP 1 127.0.0.1 9 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
            usernameFragment: "fragment-1",
          },
        }),
      ).ok,
    ).toBe(true);

    expect(
      parseRealtimeClientMessage(
        publish("screen-signaling", {
          kind: "signal.announce",
          shareId: "screen-session-1",
          label: "작업 화면",
        }),
      ).ok,
    ).toBe(true);
    expect(
      parseRealtimeClientMessage(
        publish("screen-signaling", {
          kind: "signal.stop",
          shareId: "screen-session-1",
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects unknown envelope and payload keys", () => {
    const envelope = JSON.parse(
      publish("presence", { kind: "presence.leave" }),
    ) as Record<string, unknown>;
    envelope.token = "must-not-be-accepted";
    expect(parseRealtimeClientMessage(JSON.stringify(envelope))).toEqual({
      ok: false,
      code: "invalid-envelope",
    });

    expect(
      parseRealtimeClientMessage(
        publish("presence", {
          kind: "presence.leave",
          raster: "unexpected",
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });

    expect(
      parseRealtimeClientMessage(
        publish("presence", {
          kind: "presence.update",
          pageId: null,
          profile: {
            displayName: "작가 1",
            role: "editor",
            state: "active",
            authoritative: true,
          },
          tool: null,
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
  });

  it("rejects channel/payload mismatches and embedded raster data", () => {
    expect(
      parseRealtimeClientMessage(
        publish("comments", { kind: "presence.leave" }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });

    expect(
      parseRealtimeClientMessage(
        publish("comments", {
          kind: "comment.changed",
          threadId: "thread-1",
          activitySequence: "0",
          change: "created",
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });

    expect(
      parseRealtimeClientMessage(
        publish("screen-signaling", {
          kind: "signal.request",
          shareId: "share-1",
          sessionId: "different-session",
          targetClientId: "client-1",
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
    expect(
      parseRealtimeClientMessage(
        publish("screen-signaling", {
          kind: "signal.ice",
          sessionId: "share-1",
          targetClientId: "client-1",
          candidate: {
            candidate: "",
            sdpMid: null,
            sdpMLineIndex: null,
            usernameFragment: null,
          },
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
  });

  it("rejects oversized and malformed frames before dispatch", () => {
    expect(
      parseRealtimeClientMessage("x".repeat(REALTIME_MAX_INBOUND_FRAME_BYTES + 1)),
    ).toEqual({ ok: false, code: "frame-too-large" });
    expect(parseRealtimeClientMessage("{")).toEqual({
      ok: false,
      code: "invalid-json",
    });
  });

  it("accepts exact resume and ping controls", () => {
    expect(
      parseRealtimeClientMessage(
        JSON.stringify({
          version: REALTIME_PROTOCOL_VERSION,
          type: "resume",
          channel: "presence",
          afterSequence: 41,
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        version: REALTIME_PROTOCOL_VERSION,
        type: "resume",
        channel: "presence",
        afterSequence: 41,
      },
    });
    expect(
      parseRealtimeClientMessage(
        JSON.stringify({
          version: REALTIME_PROTOCOL_VERSION,
          type: "ping",
        }),
      ).ok,
    ).toBe(true);
  });

  it("validates and serializes the canonical server event shape", () => {
    const event = {
      version: REALTIME_PROTOCOL_VERSION,
      type: "event",
      sequence: 7,
      idempotencyKey: "event-key-0007",
      actorId: "artist-1",
      clientId: "client-1",
      connectionId: "connection-1",
      channel: "presence",
      serverAtMs: 1_700_000_000_000,
      payload: { kind: "presence.leave" },
    } as const;

    expect(isServerEventMessage(event)).toBe(true);
    expect(JSON.parse(serializeRealtimeServerMessage(event))).toEqual(event);
    expect(isServerEventMessage({ ...event, unexpected: true })).toBe(false);
    expect(
      parseRealtimeServerMessage(serializeRealtimeServerMessage(event)),
    ).toEqual({ ok: true, value: event });
  });

  it("parses exact welcome, snapshot, ack, replay, error, and pong frames", () => {
    const frames = [
      {
        version: REALTIME_PROTOCOL_VERSION,
        type: "welcome",
        workId: "work-1",
        roomId: "room-1",
        connectionId: "connection-1",
        actorId: "actor-1",
        clientId: "client-1",
        scopes: ["presence"],
        channelStates: {
          presence: {
            currentSequence: 0,
            replayFloorSequence: 1,
          },
          comments: {
            currentSequence: 0,
            replayFloorSequence: 1,
          },
          "screen-signaling": {
            currentSequence: 0,
            replayFloorSequence: 1,
          },
        },
        sessionExpiresAtMs: 1_800_000_000_000,
      },
      {
        version: REALTIME_PROTOCOL_VERSION,
        type: "presence-snapshot",
        channel: "presence",
        sequence: 0,
        snapshotId: "snapshot-1",
        page: 0,
        complete: true,
        generatedAtMs: 1_700_000_000_000,
        entries: [
          {
            connectionId: "connection-1",
            actorId: "actor-1",
            clientId: "client-1",
            update: {
              kind: "presence.update",
              pageId: "page-1",
              profile: {
                displayName: "작가 1",
                role: "editor",
                state: "active",
              },
              tool: "g-pen",
            },
            cursor: {
              kind: "presence.cursor",
              x: 0.25,
              y: 0.75,
              pageId: "page-1",
              tool: "g-pen",
              drawing: false,
            },
          },
        ],
      },
      {
        version: REALTIME_PROTOCOL_VERSION,
        type: "ack",
        channel: "presence",
        idempotencyKey: "event-key-0001",
        sequence: 1,
        duplicate: false,
      },
      {
        version: REALTIME_PROTOCOL_VERSION,
        type: "replay",
        channel: "presence",
        fromSequence: 1,
        toSequence: 0,
        currentSequence: 0,
        complete: true,
        events: [],
      },
      {
        version: REALTIME_PROTOCOL_VERSION,
        type: "error",
        code: "backpressure",
        retryable: true,
      },
      { version: REALTIME_PROTOCOL_VERSION, type: "pong" },
    ] as const;
    for (const frame of frames) {
      expect(parseRealtimeServerMessage(JSON.stringify(frame))).toEqual({
        ok: true,
        value: frame,
      });
    }
    expect(
      parseRealtimeServerMessage(
        JSON.stringify({ ...frames[0], ticket: "must-not-pass" }),
      ),
    ).toEqual({ ok: false, code: "invalid-envelope" });
  });

  it("compares idempotent payloads independently of object key order", () => {
    expect(
      areRealtimePayloadsEquivalent(
        {
          kind: "presence.update",
          pageId: "page-1",
          profile: {
            displayName: "작가 1",
            role: "editor",
            state: "active",
          },
          tool: "pen",
        },
        {
          kind: "presence.update",
          tool: "pen",
          profile: {
            displayName: "작가 1",
            role: "editor",
            state: "active",
          },
          pageId: "page-1",
        },
      ),
    ).toBe(true);
  });
});
