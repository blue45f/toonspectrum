export const STUDIO_PEER_FABRIC_WIRE = "studio-peer-fabric-v2" as const;

export const STUDIO_PEER_CAPABILITIES = [
  "companion-control-v1",
  "cross-device-clipboard-v1",
  "animatic-playback-v1",
  "comment-hint-v1",
  "screen-signal-v2",
  "dcc-session-hint-v1",
  "bulk-transfer-v1",
  "work-asset-transfer-v1",
  "recovery-handoff-v1",
  "library-cas-transfer-v1",
  "mobile-reference-camera-v1",
  "trusted-compute-v1",
  "peer-render-v1",
  "xr-review-v1",
] as const;

export type StudioPeerCapability = (typeof STUDIO_PEER_CAPABILITIES)[number];

export const STUDIO_PEER_TRAFFIC_CLASSES = ["control", "realtime", "bulk"] as const;
export type StudioPeerTrafficClass = (typeof STUDIO_PEER_TRAFFIC_CLASSES)[number];

export const STUDIO_PEER_FABRIC_MAX_MESSAGE_BYTES = 60 * 1024;
export const STUDIO_PEER_FABRIC_MAX_PAYLOAD_BYTES = Object.freeze({
  control: 24 * 1024,
  realtime: 16 * 1024,
  bulk: 48 * 1024,
} satisfies Readonly<Record<StudioPeerTrafficClass, number>>);
export const STUDIO_PEER_FABRIC_MAX_TTL_MS = Object.freeze({
  control: 60_000,
  realtime: 5_000,
  bulk: 5 * 60_000,
} satisfies Readonly<Record<StudioPeerTrafficClass, number>>);

const CAPABILITY_SET = new Set<string>(STUDIO_PEER_CAPABILITIES);
const TRAFFIC_CLASS_SET = new Set<string>(STUDIO_PEER_TRAFFIC_CLASSES);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,159}$/u;

export interface StudioPeerFabricPacket {
  readonly wire: typeof STUDIO_PEER_FABRIC_WIRE;
  readonly capability: StudioPeerCapability;
  readonly trafficClass: StudioPeerTrafficClass;
  readonly messageId: string;
  readonly sequence: number;
  readonly sentAt: number;
  readonly expiresAt: number;
  readonly payload: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStudioPeerCapability(value: unknown): value is StudioPeerCapability {
  return typeof value === "string" && CAPABILITY_SET.has(value);
}

export function isStudioPeerTrafficClass(value: unknown): value is StudioPeerTrafficClass {
  return typeof value === "string" && TRAFFIC_CLASS_SET.has(value);
}
export function studioPeerUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function parseStudioPeerFabricPacket(
  value: unknown,
  options: { readonly now?: number; readonly allowExpired?: boolean } = {},
): StudioPeerFabricPacket | null {
  if (!isRecord(value) || Object.keys(value).length !== 8) return null;
  if (
    value.wire !== STUDIO_PEER_FABRIC_WIRE
    || !isStudioPeerCapability(value.capability)
    || !isStudioPeerTrafficClass(value.trafficClass)
    || typeof value.messageId !== "string"
    || !ID_PATTERN.test(value.messageId)
    || !Number.isSafeInteger(value.sequence)
    || Number(value.sequence) < 1
    || typeof value.sentAt !== "number"
    || !Number.isFinite(value.sentAt)
    || typeof value.expiresAt !== "number"
    || !Number.isFinite(value.expiresAt)
    || value.expiresAt < value.sentAt
  ) return null;
  if (
    value.expiresAt - value.sentAt
      > STUDIO_PEER_FABRIC_MAX_TTL_MS[value.trafficClass]
    || typeof value.payload !== "string"
    || studioPeerUtf8ByteLength(value.payload)
      > STUDIO_PEER_FABRIC_MAX_PAYLOAD_BYTES[value.trafficClass]
  ) return null;
  const now = options.now;
  if (
    !options.allowExpired
    && typeof now === "number"
    && (value.expiresAt < now || value.sentAt > now + 5_000)
  ) return null;
  return {
    wire: STUDIO_PEER_FABRIC_WIRE,
    capability: value.capability,
    trafficClass: value.trafficClass,
    messageId: value.messageId,
    sequence: Number(value.sequence),
    sentAt: value.sentAt,
    expiresAt: value.expiresAt,
    payload: value.payload,
  };
}

export function encodeStudioPeerFabricPacket(
  input: Omit<StudioPeerFabricPacket, "wire">,
): string | null {
  const parsed = parseStudioPeerFabricPacket(
    { wire: STUDIO_PEER_FABRIC_WIRE, ...input },
    { allowExpired: true },
  );
  if (!parsed) return null;
  const encoded = JSON.stringify(parsed);
  return studioPeerUtf8ByteLength(encoded) <= STUDIO_PEER_FABRIC_MAX_MESSAGE_BYTES
    ? encoded
    : null;
}

/** Capabilities that may cross an authenticated review/viewer session. */
export const STUDIO_PEER_VIEWER_SAFE_CAPABILITIES: ReadonlySet<StudioPeerCapability> =
  new Set<StudioPeerCapability>([
    "animatic-playback-v1",
    "comment-hint-v1",
    "screen-signal-v2",
    "xr-review-v1",
  ]);
