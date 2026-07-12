import { describe, expect, it } from "vitest";

import {
  STUDIO_LIVE_LOCK_MAX_LEASE_MS,
  STUDIO_LIVE_MESSAGE_MAX_AGE_MS,
  STUDIO_LIVE_MESSAGE_MAX_BYTES,
  createStudioLiveEnvelope,
  parseStudioLiveEnvelope,
  studioLiveEnvelopeByteLength,
  studioLocalLiveChannelName,
  type StudioLiveMessageKind,
  type StudioLiveParticipant,
  type StudioLivePayloadMap,
} from "./studio-live-collaboration-protocol";

const NOW = 2_000_000;
const WORK_ID = "work/local-1";
const LOCAL_SESSION = "session-local";
const participant: StudioLiveParticipant = {
  sessionId: "session-peer",
  displayName: "서윤",
  role: "editor",
};

function message<K extends StudioLiveMessageKind>(
  kind: K,
  payload: StudioLivePayloadMap[K],
  targetSessionId: string | null = null,
  sentAt = NOW
) {
  return createStudioLiveEnvelope({
    workId: WORK_ID,
    sender: participant,
    sentAt,
    sequence: 1,
    kind,
    targetSessionId,
    payload,
  });
}

function parse(value: unknown, now = NOW) {
  return parseStudioLiveEnvelope(value, {
    expectedWorkId: WORK_ID,
    selfSessionId: LOCAL_SESSION,
    now,
  });
}

describe("studio live collaboration protocol", () => {
  it("accepts a strict same-work presence envelope without persistent account identifiers", () => {
    const value = message("presence:hello", { visibility: "active", pageId: "page-1" });

    expect(parse(value)).toEqual(value);
    expect(Object.keys(value.sender).sort()).toEqual(["displayName", "role", "sessionId"]);
    expect(value.sender).not.toHaveProperty("userId");
  });

  it("rejects cross-work, self, stale and future messages", () => {
    const value = message("presence:heartbeat", { visibility: "idle", pageId: null });

    expect(parse({ ...value, workId: "work-other" })).toBeNull();
    expect(parse({ ...value, sender: { ...value.sender, sessionId: LOCAL_SESSION } })).toBeNull();
    expect(parse({ ...value, sentAt: NOW - STUDIO_LIVE_MESSAGE_MAX_AGE_MS - 1 })).toBeNull();
    expect(parse({ ...value, sentAt: NOW + 5_001 })).toBeNull();
  });

  it("requires exact plain-object envelope, participant and payload fields", () => {
    const value = message("cursor:update", {
      x: 0.25,
      y: 0.75,
      pageId: "page-1",
      tool: "brush",
    });

    expect(parse({ ...value, authToken: "secret" })).toBeNull();
    expect(parse({ ...value, sender: { ...value.sender, userId: "db-user" } })).toBeNull();
    expect(parse({ ...value, payload: { ...value.payload, pressure: 0.5 } })).toBeNull();
    expect(parse(Object.assign(Object.create({ polluted: true }), value))).toBeNull();
  });

  it("bounds normalized cursor coordinates, labels and ids", () => {
    const value = message("cursor:update", { x: 0, y: 1, pageId: null, tool: null });
    expect(parse(value)).not.toBeNull();
    expect(parse({ ...value, payload: { ...value.payload, x: -0.01 } })).toBeNull();
    expect(parse({ ...value, payload: { ...value.payload, y: 1.01 } })).toBeNull();
    expect(parse({ ...value, payload: { ...value.payload, tool: "x".repeat(49) } })).toBeNull();
  });

  it("accepts only targeted request/SDP/ICE messages addressed to this session", () => {
    const request = message("screen:request", { shareId: "share-1" }, LOCAL_SESSION);
    const access = message(
      "screen:access",
      { shareId: "share-1", decision: "approved" },
      LOCAL_SESSION
    );
    const offer = message(
      "webrtc:description",
      { shareId: "share-1", type: "offer", sdp: "v=0" },
      LOCAL_SESSION
    );
    const ice = message(
      "webrtc:ice",
      {
        shareId: "share-1",
        candidate: "candidate:1 1 UDP 1 127.0.0.1 5000 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: null,
      },
      LOCAL_SESSION
    );

    expect(parse(request)).not.toBeNull();
    expect(parse(access)).not.toBeNull();
    expect(parse(offer)).not.toBeNull();
    expect(parse(ice)).not.toBeNull();
    expect(parse({ ...request, targetSessionId: "session-other" })).toBeNull();
    expect(parse({ ...request, targetSessionId: null })).toBeNull();
    expect(parse({ ...access, targetSessionId: null })).toBeNull();
    expect(parse({ ...offer, targetSessionId: null })).toBeNull();
    expect(parse({ ...ice, targetSessionId: null })).toBeNull();
  });

  it("rejects a target on broadcast-only messages", () => {
    const announce = message("screen:announce", { shareId: "share-1", label: "작업 화면" });
    const stop = message("screen:stop", { shareId: "share-1" });

    expect(parse(announce)).not.toBeNull();
    expect(parse(stop)).not.toBeNull();
    expect(parse({ ...announce, targetSessionId: LOCAL_SESSION })).toBeNull();
    expect(parse({ ...stop, targetSessionId: LOCAL_SESSION })).toBeNull();
  });

  it("validates lease bounds and claim-scoped releases", () => {
    const claim = message("lock:claim", {
      resource: "page:page-1",
      claimId: "claim-1",
      leaseUntil: NOW + STUDIO_LIVE_LOCK_MAX_LEASE_MS,
    });
    const release = message("lock:release", {
      resource: "page:page-1",
      claimId: "claim-1",
    });

    expect(parse(claim)).not.toBeNull();
    expect(parse(release)).not.toBeNull();
    expect(
      parse({
        ...claim,
        payload: { ...claim.payload, leaseUntil: NOW + STUDIO_LIVE_LOCK_MAX_LEASE_MS + 1 },
      })
    ).toBeNull();
    expect(parse({ ...claim, payload: { ...claim.payload, leaseUntil: NOW } })).toBeNull();
    expect(parse({ ...release, payload: { resource: release.payload.resource } })).toBeNull();
  });

  it("rejects invalid SDP types and oversized signaling before state mutation", () => {
    const offer = message(
      "webrtc:description",
      { shareId: "share-1", type: "offer", sdp: "v=0" },
      LOCAL_SESSION
    );
    expect(parse({ ...offer, payload: { ...offer.payload, type: "rollback" } })).toBeNull();
    expect(parse({ ...offer, payload: { ...offer.payload, sdp: "x".repeat(49 * 1024) } })).toBeNull();

    const tooLarge = { ...offer, padding: "x".repeat(STUDIO_LIVE_MESSAGE_MAX_BYTES) };
    expect(studioLiveEnvelopeByteLength(tooLarge)).toBeGreaterThan(STUDIO_LIVE_MESSAGE_MAX_BYTES);
    expect(parse(tooLarge)).toBeNull();
  });

  it("rejects control characters in ids and labels while allowing SDP line endings", () => {
    const presence = message("presence:hello", { visibility: "active", pageId: "page-1" });
    const offer = message(
      "webrtc:description",
      { shareId: "share-1", type: "offer", sdp: "v=0\r\no=peer\r\n" },
      LOCAL_SESSION
    );

    expect(parse(offer)).not.toBeNull();
    expect(
      parse({
        ...presence,
        sender: { ...presence.sender, displayName: "악성\n이름" },
      })
    ).toBeNull();
    expect(parse({ ...presence, payload: { ...presence.payload, pageId: "page\u0000other" } })).toBeNull();
    expect(
      parse({ ...offer, payload: { ...offer.payload, sdp: "v=0\r\no=peer\u0000tail" } })
    ).toBeNull();
  });

  it("rejects non-serializable and cyclic transport values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(studioLiveEnvelopeByteLength(cyclic)).toBeNull();
    expect(parse(cyclic)).toBeNull();
    expect(parse(undefined)).toBeNull();
  });

  it("builds a deterministic, non-raw local room name while envelope work id prevents hash mixing", () => {
    const first = studioLocalLiveChannelName("private/work/123");
    expect(first).toBe(studioLocalLiveChannelName("private/work/123"));
    expect(first).not.toContain("private/work/123");
    expect(first).not.toBe(studioLocalLiveChannelName("private/work/124"));
    expect(() => studioLocalLiveChannelName(" ")).toThrow("유효한 작품 ID");
  });
});
