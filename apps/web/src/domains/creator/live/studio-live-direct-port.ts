import type { StudioLiveParticipant } from "./studio-live-collaboration-protocol";

export const STUDIO_DIRECT_WIRE = "studio-direct-v1";
export const STUDIO_DIRECT_MAX_BYTES = 64 * 1024;
export const STUDIO_DIRECT_MAX_BUFFERED_BYTES = 128 * 1024;

/** Targeted RTC-only lane. Never fall back to server or BroadcastChannel. */
export interface StudioLiveDirectPort {
  getPeers(): StudioLiveParticipant[];
  send(targetSessionId: string, payload: string): boolean;
  subscribe(listener: (sender: StudioLiveParticipant, payload: string) => void): () => void;
}

export function encodeStudioDirectPacket(workId: string, payload: string): string | null {
  if (typeof payload !== "string" || payload.length > STUDIO_DIRECT_MAX_BYTES) return null;
  const packet = JSON.stringify({ wire: STUDIO_DIRECT_WIRE, workId, payload });
  return new TextEncoder().encode(packet).byteLength <= STUDIO_DIRECT_MAX_BYTES ? packet : null;
}

export function parseStudioDirectPacket(value: unknown, workId: string): string | null {
  if (!value || typeof value !== "object") return null;
  const packet = value as Record<string, unknown>;
  return packet.wire === STUDIO_DIRECT_WIRE && packet.workId === workId
    && typeof packet.payload === "string" && packet.payload.length <= STUDIO_DIRECT_MAX_BYTES
    ? packet.payload : null;
}
