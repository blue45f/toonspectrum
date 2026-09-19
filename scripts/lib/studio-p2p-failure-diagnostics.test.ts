import { runInNewContext } from "node:vm";

import { afterEach, describe, expect, it, vi } from "vitest";

import { traceStudioP2pDirectPort } from "../../apps/web/tools/browser-harnesses/studio-p2p-direct-diagnostics";

import { collectStudioP2pFailureDiagnostics } from "./studio-p2p-failure-diagnostics.mjs";

afterEach(() => vi.useRealTimers());

function connection(stats: Record<string, unknown>[] = []) {
  return {
    connectionState: "failed", iceConnectionState: "disconnected", signalingState: "have-local-offer",
    localDescription: { type: "offer", sdp: "private-local-sdp" },
    remoteDescription: { type: "answer", sdp: "private-remote-sdp" },
    getSenders: () => [{ track: { kind: "video", readyState: "live" } }],
    getReceivers: () => [{ track: { kind: "video", readyState: "live", muted: true } }],
    getStats: vi.fn(async () => new Map(stats.map((stat, i) => [i, stat]))),
  };
}

describe("P2P failure report diagnostics", () => {
  it("serializes connection failure metadata, muted receiver and RTP counters without wire content", async () => {
    const traced = traceStudioP2pDirectPort({ getPeers: () => [], send: () => true, subscribe: () => () => undefined });
    traced.direct.send("peer-1", JSON.stringify({ kind: "description", epoch: "e1", toEpoch: "e2", type: "offer",
      sdp: "private-offer", token: "private-token", text: "private-chat" }));
    const pc = connection([
      { type: "inbound-rtp", kind: "video", bytesReceived: 4096, framesDecoded: 7, candidate: "private-candidate", token: "private-token" },
      { type: "outbound-rtp", kind: "audio", bytesSent: 512, framesEncoded: 0, payload: "private-content" },
      { type: "candidate-pair", localCandidateId: "private-candidate" },
    ]);
    const report = await collectStudioP2pFailureDiagnostics({
      qaConnections: [pc], qaFixture: { directPackets: traced.packets }, qaCaptureCalls: 2,
      qaTracks: [{ kind: "audio", readyState: "ended", label: "private-device" }],
      navigator: { mediaDevices: { getUserMedia: "generated capture" } },
    });
    const serialized = JSON.stringify({ result: "FAIL", ...report });
    expect(serialized).not.toMatch(/private-|candidate|payload|token/u);
    expect(JSON.parse(serialized)).toMatchObject({
      result: "FAIL", capture: { calls: 2, tracks: [{ kind: "audio", readyState: "ended" }], getUserMedia: "generated capture" },
      directPackets: [{ direction: "out", kind: "description", epoch: "e1", toEpoch: "e2", type: "offer", sdpLength: 13 }],
      rtc: [{ localType: "offer", remoteType: "answer", localSdpLength: 17, remoteSdpLength: 18,
        senders: [{ kind: "video", readyState: "live" }], receivers: [{ kind: "video", readyState: "live", muted: true }],
        statsStatus: "ok", stats: [
          { type: "inbound-rtp", kind: "video", bytesReceived: 4096, framesDecoded: 7, bytesSent: null, framesEncoded: null },
          { type: "outbound-rtp", kind: "audio", bytesSent: 512, framesEncoded: 0, bytesReceived: null, framesDecoded: null },
        ] }],
    });
  });

  it("bounds connections, tracks and RTP rows and drops nonfinite or invalid counters", async () => {
    const pc = connection(Array.from({ length: 50 }, () => ({ type: "inbound-rtp", kind: "video",
      bytesReceived: Infinity, bytesSent: -1, framesDecoded: NaN, framesEncoded: "secret-counter" })));
    pc.getReceivers = () => Array.from({ length: 50 }, () => ({ track: { kind: "audio", readyState: "live", muted: false } }));
    const ignored = connection();
    const report = await collectStudioP2pFailureDiagnostics({ qaConnections: [ignored, ...Array.from({ length: 16 }, () => pc)] });
    expect(report.rtc).toHaveLength(16);
    expect(ignored.getStats).not.toHaveBeenCalled();
    expect(report.rtc.every((entry) => entry.receivers.length === 16 && entry.stats.length === 32)).toBe(true);
    expect(report.rtc[0].stats[0]).toEqual({ type: "inbound-rtp", kind: "video", bytesReceived: null, bytesSent: null,
      framesDecoded: null, framesEncoded: null });
  });

  it("keeps RTC and capture state when one connection rejects or throws from getStats", async () => {
    const rejected = connection();
    rejected.getStats.mockRejectedValue(new Error("private-stats-error"));
    const thrown = connection();
    thrown.getStats.mockImplementation(() => { throw new Error("private-sync-error"); });
    const report = await collectStudioP2pFailureDiagnostics({ qaConnections: [rejected, thrown, connection()], qaCaptureCalls: 3 });
    expect(report.rtc.map((entry) => entry.statsStatus)).toEqual(["unavailable", "unavailable", "ok"]);
    expect(report.rtc.every((entry) => entry.connectionState === "failed" && entry.receivers[0].muted)).toBe(true);
    expect(report.capture.calls).toBe(3);
    expect(JSON.stringify(report)).not.toContain("private-");
  });

  it("bounds a stalled stats request without dropping connection state", async () => {
    vi.useFakeTimers();
    const pc = connection();
    pc.getStats.mockImplementation(() => new Promise(() => undefined));
    const pending = collectStudioP2pFailureDiagnostics({ qaConnections: [pc] });
    await vi.advanceTimersByTimeAsync(500);
    expect((await pending).rtc[0]).toMatchObject({ connectionState: "failed", statsStatus: "timeout", stats: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["getSenders", "getReceivers"] as const)(
    "preserves capture, trace and other RTC entries when %s inspection throws", async (method) => {
      const broken = connection();
      broken[method] = () => { throw new Error("private-inspection-error"); };
      const packet = { direction: "out", peer: "peer-1", kind: "ice", epoch: "e1", toEpoch: "e2", type: null, sdpLength: null };
      const report = await collectStudioP2pFailureDiagnostics({
        qaConnections: [broken, connection()], qaFixture: { directPackets: [packet] },
        qaCaptureCalls: 4, qaTracks: [{ kind: "video", readyState: "live" }],
      });
      expect(report.capture).toMatchObject({ calls: 4, tracks: [{ kind: "video", readyState: "live" }] });
      expect(report.directPackets).toEqual([packet]);
      expect(report.rtc[0]).toEqual({ inspectionStatus: "unavailable" });
      expect(report.rtc[1]).toMatchObject({ connectionState: "failed", statsStatus: "ok" });
      expect(JSON.stringify(report)).not.toContain("private-");
    },
  );

  it("runs as a standalone serialized browser callback without module globals", async () => {
    const pc = connection();
    const report = await runInNewContext(`(${collectStudioP2pFailureDiagnostics.toString()})()`, {
      qaConnections: [pc], setTimeout, clearTimeout,
    });
    expect(report.rtc[0].localType).toBe("offer");
    expect(report.directPackets).toEqual([]);
  });
});
