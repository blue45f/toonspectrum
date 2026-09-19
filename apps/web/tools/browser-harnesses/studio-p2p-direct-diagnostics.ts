import type { StudioLiveDirectPort } from "../../src/domains/creator/live/studio-live-direct-port";

export const DIRECT_PACKET_TRACE_LIMIT = 128;
const MAX_DIAGNOSTIC_PACKET_LENGTH = 64 * 1024;
const PACKET_KINDS = new Set(["state", "left", "chat", "ack", "reaction", "description", "ice", "activity", "space-state", "space-left"]);

export interface DirectPacketDiagnostic {
  direction: "in" | "out";
  peer: string | null;
  kind: string | null;
  epoch: string | null;
  toEpoch: string | null;
  type: "offer" | "answer" | null;
  sdpLength: number | null;
}

const diagnosticId = (value: unknown): string | null =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/u.test(value) ? value : null;

/** Fixture-only observer: retain metadata, never the wire payload or parsed packet. */
export function traceStudioP2pDirectPort(base: StudioLiveDirectPort) {
  const packets: DirectPacketDiagnostic[] = [];
  function record(direction: "in" | "out", peer: string, payload: string): void {
    let packet: Record<string, unknown> = {};
    if (payload.length <= MAX_DIAGNOSTIC_PACKET_LENGTH) {
      try {
        const parsed: unknown = JSON.parse(payload);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          packet = parsed as Record<string, unknown>;
        }
      } catch { /* Invalid wire data still reaches the original transport/listener. */ }
    }
    const kind = typeof packet.kind === "string" && PACKET_KINDS.has(packet.kind) ? packet.kind : null;
    packets.push({
      direction, peer: diagnosticId(peer), kind,
      epoch: diagnosticId(packet.epoch), toEpoch: diagnosticId(packet.toEpoch),
      type: kind === "description" && (packet.type === "offer" || packet.type === "answer") ? packet.type : null,
      sdpLength: kind === "description" && typeof packet.sdp === "string" ? packet.sdp.length : null,
    });
    if (packets.length > DIRECT_PACKET_TRACE_LIMIT) packets.splice(0, packets.length - DIRECT_PACKET_TRACE_LIMIT);
  }

  // Contextual typing uses the current port's participant/callback types.
  const direct: StudioLiveDirectPort = {
    getPeers: () => base.getPeers(),
    send: (target, payload) => {
      record("out", target, payload);
      return base.send(target, payload);
    },
    subscribe: (listener) => base.subscribe((sender, payload) => {
      record("in", sender.sessionId, payload);
      listener(sender, payload);
    }),
  };
  return { direct, packets };
}
