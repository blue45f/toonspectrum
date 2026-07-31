import { describe, expect, it } from "vitest";

import {
  REALTIME_MAX_SDP_BYTES,
  REALTIME_PROTOCOL_VERSION,
  REALTIME_TICKET_PROTOCOL_PREFIX,
  REALTIME_WEBSOCKET_PROTOCOL,
  parseRealtimeClientMessage,
} from "./protocol";
import { isClientSequenceAccepted } from "./room-core";
import {
  hasForbiddenCredentialQuery,
  parseRealtimeRoomPath,
} from "./security";
import {
  REALTIME_TICKET_MAX_BYTES,
  extractRealtimeTicketFromSubprotocols,
} from "./ticket";

function signalingPublish(sdp: string): string {
  return JSON.stringify({
    version: REALTIME_PROTOCOL_VERSION,
    type: "publish",
    idempotencyKey: "event-key-hardening-0001",
    clientSequence: 1,
    sentAtMs: 1_700_000_000_000,
    channel: "screen-signaling",
    payload: {
      kind: "signal.offer",
      sessionId: "screen-session-1",
      peerConnectionId: "peer-1",
      targetClientId: "client-2",
      sdp,
    },
  });
}

describe("realtime edge hardening regressions", () => {
  it("enforces byte-bounded valid signaling and rejects embedded binary data URLs", () => {
    expect(
      parseRealtimeClientMessage(
        signalingPublish("v".repeat(REALTIME_MAX_SDP_BYTES)),
      ).ok,
    ).toBe(true);
    expect(
      parseRealtimeClientMessage(
        signalingPublish("v".repeat(REALTIME_MAX_SDP_BYTES + 1)),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
    expect(
      parseRealtimeClientMessage(
        signalingPublish(
          "data:application/octet-stream;base64,AAECAwQ=",
        ),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
  });

  it("rejects encoded, case-varied, duplicated credential queries and unsafe paths", () => {
    for (const source of [
      "https://realtime.example/v1/rooms/work-1/room-1?TiCkEt=secret",
      "https://realtime.example/v1/rooms/work-1/room-1?%74icket=secret",
      "https://realtime.example/v1/rooms/work-1/room-1?token=a&token=b",
    ]) {
      expect(hasForbiddenCredentialQuery(new URL(source))).toBe(true);
    }
    expect(
      parseRealtimeRoomPath("/v1/rooms/work-1/%252Fescape"),
    ).toBeNull();
  });

  it("requires exactly two non-empty websocket subprotocol tokens", () => {
    const ticket = "payload.signature";
    const required = REALTIME_WEBSOCKET_PROTOCOL;
    const credential = `${REALTIME_TICKET_PROTOCOL_PREFIX}${ticket}`;

    expect(
      extractRealtimeTicketFromSubprotocols(
        `${required}, ${credential}`,
      ),
    ).toEqual({ ok: true, ticket });
    for (const header of [
      `${required},,${credential}`,
      `${required},${credential},`,
      `,${required},${credential}`,
      `${required},${required}`,
      `${credential},${credential}`,
      `${required},${credential},extra`,
      "x".repeat(REALTIME_TICKET_MAX_BYTES + 257),
    ]) {
      expect(extractRealtimeTicketFromSubprotocols(header)).toEqual({
        ok: false,
      });
    }
  });

  it("rejects duplicate and regressing per-connection client sequences", () => {
    expect(isClientSequenceAccepted(41, 42)).toBe(true);
    expect(isClientSequenceAccepted(41, 41)).toBe(false);
    expect(isClientSequenceAccepted(41, 40)).toBe(false);
  });
});
