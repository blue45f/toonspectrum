import { describe, expect, it, vi } from "vitest";

import {
  StudioPeerFabric,
  type StudioPeerFabricLinkPort,
  type StudioPeerFabricPeer,
} from "./studio-peer-fabric";
import {
  STUDIO_PEER_FABRIC_MAX_PAYLOAD_BYTES,
  STUDIO_PEER_FABRIC_WIRE,
  encodeStudioPeerFabricPacket,
  parseStudioPeerFabricPacket,
  type StudioPeerCapability,
  type StudioPeerTrafficClass,
} from "./studio-peer-fabric-protocol";

const NOW = Date.parse("2026-09-15T00:00:00.000Z");
const A = { sessionId: "peer-a", displayName: "A", role: "owner" as const };
const B = { sessionId: "peer-b", displayName: "B", role: "editor" as const };

class MemoryLink implements StudioPeerFabricLinkPort {
  remote: MemoryLink | null = null;
  private readonly listeners = new Set<
    (sender: StudioPeerFabricPeer, payload: string) => void
  >();

  constructor(
    readonly participant: typeof A | typeof B,
    readonly capabilities: readonly StudioPeerCapability[],
  ) {}

  getPeers(): readonly StudioPeerFabricPeer[] {
    const remote = this.remote;
    return remote
      ? [{ ...remote.participant, capabilities: remote.capabilities }]
      : [];
  }

  send(
    targetSessionId: string,
    payload: string,
    _trafficClass: StudioPeerTrafficClass,
  ): boolean {
    const remote = this.remote;
    if (!remote || remote.participant.sessionId !== targetSessionId) return false;
    const sender: StudioPeerFabricPeer = {
      ...this.participant,
      capabilities: this.capabilities,
    };
    for (const listener of remote.listeners) listener(sender, payload);
    return true;
  }

  subscribe(
    listener: (sender: StudioPeerFabricPeer, payload: string) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function pair(
  leftCapabilities: readonly StudioPeerCapability[],
  rightCapabilities: readonly StudioPeerCapability[],
) {
  const leftLink = new MemoryLink(A, leftCapabilities);
  const rightLink = new MemoryLink(B, rightCapabilities);
  leftLink.remote = rightLink;
  rightLink.remote = leftLink;
  let id = 0;
  const left = new StudioPeerFabric(leftLink, {
    capabilities: leftCapabilities,
    now: () => NOW,
    randomId: () => `left-${++id}`,
  });
  const right = new StudioPeerFabric(rightLink, {
    capabilities: rightCapabilities,
    now: () => NOW,
    randomId: () => `right-${++id}`,
  });
  return { left, right, leftLink, rightLink };
}

describe("studio peer fabric protocol", () => {
  it("round-trips one bounded capability packet", () => {
    const encoded = encodeStudioPeerFabricPacket({
      capability: "animatic-playback-v1",
      trafficClass: "realtime",
      messageId: "message-1",
      sequence: 1,
      sentAt: NOW,
      expiresAt: NOW + 1_000,
      payload: JSON.stringify({ action: "play" }),
    });
    expect(encoded).not.toBeNull();
    expect(parseStudioPeerFabricPacket(JSON.parse(encoded!), { now: NOW })).toMatchObject({
      wire: STUDIO_PEER_FABRIC_WIRE,
      capability: "animatic-playback-v1",
      trafficClass: "realtime",
    });
  });

  it("rejects expired, unknown, and oversized packets", () => {
    const base = {
      wire: STUDIO_PEER_FABRIC_WIRE,
      capability: "comment-hint-v1",
      trafficClass: "control",
      messageId: "message-2",
      sequence: 1,
      sentAt: NOW - 10_000,
      expiresAt: NOW - 1,
      payload: "{}",
    };
    expect(parseStudioPeerFabricPacket(base, { now: NOW })).toBeNull();
    expect(parseStudioPeerFabricPacket({ ...base, capability: "unknown" }, {
      now: NOW,
      allowExpired: true,
    })).toBeNull();
    expect(parseStudioPeerFabricPacket({
      ...base,
      sentAt: NOW,
      expiresAt: NOW + 1_000,
      payload: "x".repeat(STUDIO_PEER_FABRIC_MAX_PAYLOAD_BYTES.control + 1),
    }, { now: NOW })).toBeNull();
  });
});

describe("StudioPeerFabric", () => {
  it("delivers only mutually advertised capabilities", () => {
    const { left, right } = pair(
      ["animatic-playback-v1", "comment-hint-v1"],
      ["animatic-playback-v1"],
    );
    const listener = vi.fn();
    right.subscribe("animatic-playback-v1", listener);
    expect(left.getPeers("animatic-playback-v1")).toHaveLength(1);
    expect(left.getPeers("comment-hint-v1")).toHaveLength(0);
    expect(left.send("peer-b", "animatic-playback-v1", "play", {
      trafficClass: "realtime",
    })).toBe(true);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      capability: "animatic-playback-v1",
      payload: "play",
      sender: expect.objectContaining({ sessionId: "peer-a" }),
    }));
    expect(left.send("peer-b", "comment-hint-v1", "{}")) .toBe(false);
    left.close();
    right.close();
  });

  it("reports per-peer broadcast success and closes without server fallback", () => {
    const { left, right, rightLink } = pair(
      ["cross-device-clipboard-v1"],
      ["cross-device-clipboard-v1"],
    );
    const listener = vi.fn();
    right.subscribe(null, listener);
    expect(left.broadcast("cross-device-clipboard-v1", "clipboard")).toEqual({
      targets: ["peer-b"],
      sent: ["peer-b"],
      failed: [],
    });
    expect(listener).toHaveBeenCalledTimes(1);
    left.close();
    expect(left.send("peer-b", "cross-device-clipboard-v1", "late")).toBe(false);
    rightLink.remote = null;
    right.close();
  });

  it("deduplicates repeated message IDs", () => {
    const { left, right } = pair(["comment-hint-v1"], ["comment-hint-v1"]);
    const listener = vi.fn();
    right.subscribe("comment-hint-v1", listener);
    const options = { messageId: "same-message", ttlMs: 30_000 } as const;
    expect(left.send("peer-b", "comment-hint-v1", "one", options)).toBe(true);
    expect(left.send("peer-b", "comment-hint-v1", "two", options)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    left.close();
    right.close();
  });
});
