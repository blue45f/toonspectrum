import { describe, expect, it, vi } from "vitest";

import { DIRECT_PACKET_TRACE_LIMIT, traceStudioP2pDirectPort } from "./studio-p2p-direct-diagnostics";

import type { StudioLiveDirectPort } from "../../src/domains/creator/live/studio-live-direct-port";

function fixture() {
  const peer = { sessionId: "peer-1", displayName: "Private display name", role: "editor" as const };
  const peers = [peer];
  const listeners = new Set<Parameters<StudioLiveDirectPort["subscribe"]>[0]>();
  const unsubscribe = vi.fn(() => listeners.clear());
  const base: StudioLiveDirectPort = {
    getPeers: vi.fn(function (this: StudioLiveDirectPort) { expect(this).toBe(base); return peers; }),
    send: vi.fn(function (this: StudioLiveDirectPort) { expect(this).toBe(base); return false; }),
    subscribe: vi.fn(function (this: StudioLiveDirectPort, listener) {
      expect(this).toBe(base); listeners.add(listener); return unsubscribe;
    }),
  };
  const trace = traceStudioP2pDirectPort(base);
  return { ...trace, base, peer, peers, unsubscribe, receive: (raw: string) => listeners.forEach((fn) => fn(peer, raw)) };
}

describe("fixture direct packet metadata", () => {
  it("preserves receivers, arguments, return values and unsubscribe identity", () => {
    const f = fixture();
    const listener = vi.fn();
    expect(f.direct.getPeers()).toBe(f.peers);
    expect(f.direct.subscribe(listener)).toBe(f.unsubscribe);
    const payload = JSON.stringify({ kind: "description", epoch: "e1", toEpoch: "e2", type: "offer", sdp: "private-sdp" });
    expect(f.direct.send(f.peer.sessionId, payload)).toBe(false);
    expect(f.base.send).toHaveBeenCalledExactlyOnceWith(f.peer.sessionId, payload);
    f.receive(payload);
    expect(listener).toHaveBeenCalledExactlyOnceWith(f.peer, payload);
    expect(f.packets).toEqual(["out", "in"].map((direction) => ({
      direction, peer: "peer-1", kind: "description", epoch: "e1", toEpoch: "e2", type: "offer", sdpLength: 11,
    })));
    f.unsubscribe();
    f.receive(payload);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("retains only a bounded tail and never retains packet or participant content", () => {
    const f = fixture();
    for (let i = 0; i < DIRECT_PACKET_TRACE_LIMIT + 7; i++) {
      f.direct.send("peer-1", JSON.stringify({ kind: "ice", epoch: `epoch-${i}`, toEpoch: "receiver",
        candidate: { candidate: "private-candidate", usernameFragment: "private-ice-token" },
        sdp: "private-sdp", token: "private-token", text: "private-chat", state: { question: "private-poll" },
      }));
    }
    expect(f.packets).toHaveLength(DIRECT_PACKET_TRACE_LIMIT);
    expect(f.packets[0]?.epoch).toBe("epoch-7");
    expect(f.packets.at(-1)?.epoch).toBe(`epoch-${DIRECT_PACKET_TRACE_LIMIT + 6}`);
    expect(JSON.stringify(f.packets)).not.toMatch(/private|candidate|token|text|question|displayName/iu);
    expect(f.packets.every((packet) => packet.sdpLength === null)).toBe(true);
  });

  it.each(["not-json", "null", "[]", "17", '"text"', "x".repeat(64 * 1024 + 1)])(
    "does not interrupt transport delivery for malformed or oversized input %#", (payload) => {
      const f = fixture();
      const listener = vi.fn();
      f.direct.subscribe(listener);
      expect(() => f.direct.send("peer-1", payload)).not.toThrow();
      expect(() => f.receive(payload)).not.toThrow();
      expect(f.base.send).toHaveBeenCalledExactlyOnceWith("peer-1", payload);
      expect(listener).toHaveBeenCalledExactlyOnceWith(f.peer, payload);
      expect(f.packets.every((packet) => packet.kind === null && packet.epoch === null)).toBe(true);
    },
  );

  it("rejects arbitrary kind/type strings and oversized identifiers from metadata", () => {
    const f = fixture();
    f.direct.send("x".repeat(81), JSON.stringify({ kind: "private-kind", epoch: "e".repeat(81),
      toEpoch: "contains private content", type: "private-type", sdp: "private-sdp" }));
    expect(f.packets).toEqual([{ direction: "out", peer: null, kind: null, epoch: null, toEpoch: null, type: null, sdpLength: null }]);
  });

  it("preserves thrown errors and successful sends instead of absorbing failures", () => {
    const f = fixture();
    vi.mocked(f.base.send).mockReturnValueOnce(true);
    expect(f.direct.send("peer-1", "{}")).toBe(true);
    const error = new Error("transport failure");
    vi.mocked(f.base.send).mockImplementationOnce(() => { throw error; });
    expect(() => f.direct.send("peer-1", "{}")).toThrow(error);
    const listenerError = new Error("listener failure");
    f.direct.subscribe(() => { throw listenerError; });
    expect(() => f.receive("{}")).toThrow(listenerError);
    expect(f.packets).toHaveLength(3);
  });
});
