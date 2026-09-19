/**
 * Passed directly to page.evaluate: keep this function self-contained. Tests supply mock browser
 * state. Allowlist fields so SDP, candidates, credentials, content and raw stats never reach JSON.
 */
export async function collectStudioP2pFailureDiagnostics(qa = globalThis) {
  const CONNECTION_LIMIT = 16;
  const TRACK_LIMIT = 16;
  const RTP_LIMIT = 32;
  const STATS_TIMEOUT_MS = 500;
  const counter = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const trackSummary = (track) => ({
    kind: track?.kind ?? null,
    readyState: track?.readyState ?? null,
  });
  const rtc = await Promise.all((qa.qaConnections ?? []).slice(-CONNECTION_LIMIT).map(async (pc) => {
    const result = {
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      signalingState: pc.signalingState,
      localType: pc.localDescription?.type ?? null,
      remoteType: pc.remoteDescription?.type ?? null,
      localSdpLength: pc.localDescription?.sdp?.length ?? 0,
      remoteSdpLength: pc.remoteDescription?.sdp?.length ?? 0,
      senders: pc.getSenders().slice(0, TRACK_LIMIT).map((sender) => trackSummary(sender.track)),
      receivers: pc.getReceivers().slice(0, TRACK_LIMIT).map((receiver) => ({
        ...trackSummary(receiver.track), muted: receiver.track?.muted ?? null,
      })),
      stats: [],
      statsStatus: "unavailable",
    };
    let timer;
    try {
      const report = await Promise.race([
        Promise.resolve().then(() => pc.getStats()),
        new Promise((resolve) => { timer = setTimeout(() => resolve(null), STATS_TIMEOUT_MS); }),
      ]);
      if (report === null) {
        result.statsStatus = "timeout";
      } else {
        for (const stat of report.values()) {
          if (stat.type !== "inbound-rtp" && stat.type !== "outbound-rtp") continue;
          result.stats.push({
            type: stat.type,
            kind: stat.kind === "audio" || stat.kind === "video" ? stat.kind : null,
            bytesReceived: counter(stat.bytesReceived), bytesSent: counter(stat.bytesSent),
            framesDecoded: counter(stat.framesDecoded), framesEncoded: counter(stat.framesEncoded),
          });
          if (result.stats.length === RTP_LIMIT) break;
        }
        result.statsStatus = "ok";
      }
    } catch { /* Closed/unavailable stats must not discard connection or track diagnostics. */ }
    finally { clearTimeout(timer); }
    return result;
  }).map((pending) => pending.catch(() => ({ inspectionStatus: "unavailable" }))));
  return {
    capture: {
      calls: qa.qaCaptureCalls ?? 0,
      tracks: (qa.qaTracks ?? []).map(trackSummary),
      getUserMedia: String(qa.navigator?.mediaDevices?.getUserMedia).slice(0, 80),
    },
    directPackets: (qa.qaFixture?.directPackets ?? []).slice(-128),
    rtc,
  };
}
