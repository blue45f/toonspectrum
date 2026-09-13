export const HUDDLE_MAX_REMOTE_PEERS = 3;
export const HUDDLE_HISTORY_LIMIT = 150;
export const HUDDLE_TEXT_LIMIT = 2_000;
export const HUDDLE_REACTIONS = ["👍", "👏", "💡", "❤️"] as const;
export type HuddleReaction = (typeof HUDDLE_REACTIONS)[number];
export interface HuddleState { muted: boolean; camera: boolean; sharing: boolean; hand: boolean }
export type HuddlePacket = { epoch: string } & (
  | ({ kind: "state" } & HuddleState)
  | { kind: "left" }
  | { kind: "chat"; id: string; text: string }
  | { kind: "ack"; id: string }
  | { kind: "reaction"; id: string; emoji: HuddleReaction }
  | { kind: "description"; toEpoch: string; type: "offer" | "answer"; sdp: string }
  | { kind: "ice"; toEpoch: string; candidate: RTCIceCandidateInit }
);
const validId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,80}$/u.test(v);
const optionalText = (v: unknown, limit: number): boolean => v == null || (typeof v === "string" && v.length <= limit);
export function parseHuddlePacket(raw: string): HuddlePacket | null {
  if (typeof raw !== "string" || raw.length > 48 * 1024) return null;
  let v: Record<string, unknown>;
  try { v = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  if (!v || typeof v !== "object" || !validId(v.epoch)) return null;
  switch (v.kind) {
    case "state":
      if (![v.muted, v.camera, v.sharing, v.hand].every((x) => typeof x === "boolean") || (v.camera && v.sharing)) return null;
      break;
    case "left": break;
    case "chat":
      if (!validId(v.id) || typeof v.text !== "string" || !v.text.trim() || v.text.length > HUDDLE_TEXT_LIMIT) return null;
      break;
    case "ack": if (!validId(v.id)) return null; break;
    case "reaction":
      if (!validId(v.id) || !HUDDLE_REACTIONS.includes(v.emoji as HuddleReaction)) return null;
      break;
    case "description":
      if (!validId(v.toEpoch) || (v.type !== "offer" && v.type !== "answer")
        || typeof v.sdp !== "string" || !v.sdp || v.sdp.length > 32_000) return null;
      break;
    case "ice": {
      const c = v.candidate as Record<string, unknown> | null;
      if (!validId(v.toEpoch) || !c || typeof c !== "object" || typeof c.candidate !== "string"
        || !c.candidate || c.candidate.length > 4_096 || !optionalText(c.sdpMid, 256)
        || !optionalText(c.usernameFragment, 256)
        || !(c.sdpMLineIndex == null || (Number.isInteger(c.sdpMLineIndex)
          && Number(c.sdpMLineIndex) >= 0 && Number(c.sdpMLineIndex) <= 64))) return null;
      break;
    }
    default: return null;
  }
  return v as unknown as HuddlePacket;
}
/** No legacy credential endpoint, TURN, SDK or paid fallback. */
export function huddleRtcConfiguration(): RTCConfiguration {
  return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    bundlePolicy: "max-bundle", rtcpMuxPolicy: "require", iceCandidatePoolSize: 0 };
}
