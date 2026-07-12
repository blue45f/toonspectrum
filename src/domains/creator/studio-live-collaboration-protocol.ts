import { STUDIO_TEAM_ROLES, type StudioTeamRole } from "./studio-team-client";

/**
 * Ephemeral collaboration protocol shared by local BroadcastChannel and future server transports.
 *
 * The protocol deliberately carries no document content, API key, auth token, email, image or
 * captured video. WebRTC SDP/ICE are memory-only signaling records and are bounded separately.
 * Server transports must still authenticate the socket and authorize every work room; accepting a
 * structurally valid envelope is not an authorization decision.
 */
export const STUDIO_LIVE_PROTOCOL_VERSION = 1 as const;
export const STUDIO_LIVE_MESSAGE_MAX_BYTES = 64 * 1024;
export const STUDIO_LIVE_MESSAGE_MAX_AGE_MS = 30_000;
export const STUDIO_LIVE_MESSAGE_FUTURE_SKEW_MS = 5_000;
export const STUDIO_LIVE_LOCK_MAX_LEASE_MS = 30_000;

const MAX_ID_LENGTH = 160;
export const STUDIO_LIVE_DISPLAY_NAME_MAX_LENGTH = 80;
const MAX_TOOL_LENGTH = 48;
export const STUDIO_LIVE_RESOURCE_MAX_LENGTH = 200;
const MAX_SHARE_LABEL_LENGTH = 80;
export const STUDIO_LIVE_SDP_MAX_LENGTH = 48 * 1024;
export const STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH = 8 * 1024;
export const STUDIO_LIVE_SDP_MID_MAX_LENGTH = 128;
export const STUDIO_LIVE_USERNAME_FRAGMENT_MAX_LENGTH = 256;

export interface StudioLiveParticipant {
  sessionId: string;
  displayName: string;
  role: StudioTeamRole;
}

export interface StudioLivePresencePayload {
  visibility: "active" | "idle";
  pageId: string | null;
}

export interface StudioLiveCursorPayload {
  x: number;
  y: number;
  pageId: string | null;
  tool: string | null;
}

export interface StudioLiveLockClaimPayload {
  resource: string;
  claimId: string;
  leaseUntil: number;
}

export interface StudioLiveLockReleasePayload {
  resource: string;
  claimId: string;
}

export interface StudioLiveScreenAnnouncePayload {
  shareId: string;
  label: string;
}

export interface StudioLiveScreenRequestPayload {
  shareId: string;
}

export interface StudioLiveScreenAccessPayload {
  shareId: string;
  decision: "approved" | "rejected" | "ended";
}

export interface StudioLiveWebRtcDescriptionPayload {
  shareId: string;
  type: "offer" | "answer";
  sdp: string;
}

export interface StudioLiveWebRtcIcePayload {
  shareId: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;
}

export interface StudioLiveScreenStopPayload {
  shareId: string;
}

export interface StudioLivePayloadMap {
  "presence:hello": StudioLivePresencePayload;
  "presence:heartbeat": StudioLivePresencePayload;
  "presence:leave": Record<string, never>;
  "cursor:update": StudioLiveCursorPayload;
  "lock:claim": StudioLiveLockClaimPayload;
  "lock:release": StudioLiveLockReleasePayload;
  "screen:announce": StudioLiveScreenAnnouncePayload;
  "screen:request": StudioLiveScreenRequestPayload;
  "screen:access": StudioLiveScreenAccessPayload;
  "webrtc:description": StudioLiveWebRtcDescriptionPayload;
  "webrtc:ice": StudioLiveWebRtcIcePayload;
  "screen:stop": StudioLiveScreenStopPayload;
}

export type StudioLiveMessageKind = keyof StudioLivePayloadMap;

export type StudioLiveEnvelope<K extends StudioLiveMessageKind = StudioLiveMessageKind> = {
  version: typeof STUDIO_LIVE_PROTOCOL_VERSION;
  workId: string;
  sender: StudioLiveParticipant;
  sentAt: number;
  sequence: number;
  kind: K;
  targetSessionId: string | null;
  payload: StudioLivePayloadMap[K];
};

export interface ParseStudioLiveEnvelopeOptions {
  expectedWorkId: string;
  selfSessionId?: string | null;
  now?: number;
}

export class StudioLiveProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioLiveProtocolError";
  }
}

const STUDIO_LIVE_TEXT_ENCODER = new TextEncoder();

export function studioLiveUtf8ByteLength(value: string): number {
  return STUDIO_LIVE_TEXT_ENCODER.encode(value).byteLength;
}

/** Byte length of JSON's escaped string body, excluding the two surrounding quote bytes. */
export function studioLiveJsonEscapedContentByteLength(value: string): number {
  const serialized = JSON.stringify(value);
  return STUDIO_LIVE_TEXT_ENCODER.encode(serialized).byteLength - 2;
}

export function studioLiveStringFitsByteContract(value: string, maximumBytes: number): boolean {
  return (
    studioLiveUtf8ByteLength(value) <= maximumBytes &&
    studioLiveJsonEscapedContentByteLength(value) <= maximumBytes
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const ownKeys = Object.keys(value);
  return ownKeys.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function containsControlCharacter(value: string, allowSdpLineEndings = false): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (allowSdpLineEndings && (code === 10 || code === 13)) continue;
    if (code <= 31 || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

function sanitizeDisplayNamePart(value: unknown): string {
  if (typeof value !== "string") return "";
  let sanitized = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    sanitized += codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? " " : character;
  }
  return sanitized.replace(/\s+/gu, " ").trim();
}

function truncateWithoutSplittingSurrogate(value: string, maximumCodeUnits: number): string {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > maximumCodeUnits) break;
    result += character;
  }
  return result.trim();
}

/** Safely adapts profile copy to the stricter ephemeral participant-name contract. */
export function studioLiveDisplayName(
  value: unknown,
  options: { suffix?: string; fallback?: string } = {}
): string {
  const suffix = truncateWithoutSplittingSurrogate(
    sanitizeDisplayNamePart(options.suffix),
    STUDIO_LIVE_DISPLAY_NAME_MAX_LENGTH
  );
  const separator = suffix ? " " : "";
  const maximumBaseLength =
    STUDIO_LIVE_DISPLAY_NAME_MAX_LENGTH - suffix.length - separator.length;
  const preferred = truncateWithoutSplittingSurrogate(
    sanitizeDisplayNamePart(value),
    maximumBaseLength
  );
  const fallback = truncateWithoutSplittingSurrogate(
    sanitizeDisplayNamePart(options.fallback) || "팀원",
    maximumBaseLength
  );
  const base = preferred || fallback;
  if (base) return `${base}${separator}${suffix}`;
  return suffix || "팀원";
}

function exactString(value: unknown, maximum: number, allowEmpty = false): value is string {
  return (
    typeof value === "string" &&
    value.length <= maximum &&
    !containsControlCharacter(value) &&
    (allowEmpty || (value.length > 0 && value.trim().length > 0))
  );
}

function exactSdpString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= STUDIO_LIVE_SDP_MAX_LENGTH &&
    studioLiveStringFitsByteContract(value, STUDIO_LIVE_SDP_MAX_LENGTH) &&
    value.length > 0 &&
    value.trim().length > 0 &&
    !containsControlCharacter(value, true)
  );
}

function nullableId(value: unknown): value is string | null {
  return value === null || exactString(value, MAX_ID_LENGTH);
}

function isRole(value: unknown): value is StudioTeamRole {
  return (
    typeof value === "string" &&
    (STUDIO_TEAM_ROLES as readonly string[]).includes(value)
  );
}

function isParticipant(value: unknown): value is StudioLiveParticipant {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["sessionId", "displayName", "role"]) &&
    exactString(value.sessionId, MAX_ID_LENGTH) &&
    exactString(value.displayName, STUDIO_LIVE_DISPLAY_NAME_MAX_LENGTH) &&
    isRole(value.role)
  );
}

function isFiniteInteger(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isNormalizedRatio(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isPresencePayload(value: unknown): value is StudioLivePresencePayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["visibility", "pageId"]) &&
    (value.visibility === "active" || value.visibility === "idle") &&
    nullableId(value.pageId)
  );
}

function isEmptyPayload(value: unknown): value is Record<string, never> {
  return isRecord(value) && hasExactKeys(value, []);
}

function isCursorPayload(value: unknown): value is StudioLiveCursorPayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["x", "y", "pageId", "tool"]) &&
    isNormalizedRatio(value.x) &&
    isNormalizedRatio(value.y) &&
    nullableId(value.pageId) &&
    (value.tool === null || exactString(value.tool, MAX_TOOL_LENGTH))
  );
}

function isLockClaimPayload(
  value: unknown,
  sentAt: number
): value is StudioLiveLockClaimPayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["resource", "claimId", "leaseUntil"]) &&
    exactString(value.resource, STUDIO_LIVE_RESOURCE_MAX_LENGTH) &&
    exactString(value.claimId, MAX_ID_LENGTH) &&
    typeof value.leaseUntil === "number" &&
    Number.isSafeInteger(value.leaseUntil) &&
    value.leaseUntil > sentAt &&
    value.leaseUntil <= sentAt + STUDIO_LIVE_LOCK_MAX_LEASE_MS
  );
}

function isLockReleasePayload(value: unknown): value is StudioLiveLockReleasePayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["resource", "claimId"]) &&
    exactString(value.resource, STUDIO_LIVE_RESOURCE_MAX_LENGTH) &&
    exactString(value.claimId, MAX_ID_LENGTH)
  );
}

function isShareAnnouncePayload(value: unknown): value is StudioLiveScreenAnnouncePayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["shareId", "label"]) &&
    exactString(value.shareId, MAX_ID_LENGTH) &&
    exactString(value.label, MAX_SHARE_LABEL_LENGTH)
  );
}

function isShareRequestPayload(value: unknown): value is StudioLiveScreenRequestPayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["shareId"]) &&
    exactString(value.shareId, MAX_ID_LENGTH)
  );
}

function isScreenAccessPayload(value: unknown): value is StudioLiveScreenAccessPayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["shareId", "decision"]) &&
    exactString(value.shareId, MAX_ID_LENGTH) &&
    (value.decision === "approved" ||
      value.decision === "rejected" ||
      value.decision === "ended")
  );
}

function isDescriptionPayload(value: unknown): value is StudioLiveWebRtcDescriptionPayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["shareId", "type", "sdp"]) &&
    exactString(value.shareId, MAX_ID_LENGTH) &&
    (value.type === "offer" || value.type === "answer") &&
    exactSdpString(value.sdp)
  );
}

function isIcePayload(value: unknown): value is StudioLiveWebRtcIcePayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "shareId",
      "candidate",
      "sdpMid",
      "sdpMLineIndex",
      "usernameFragment",
    ]) &&
    exactString(value.shareId, MAX_ID_LENGTH) &&
    exactString(value.candidate, STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH) &&
    studioLiveStringFitsByteContract(
      value.candidate,
      STUDIO_LIVE_ICE_CANDIDATE_MAX_LENGTH
    ) &&
    (value.sdpMid === null ||
      exactString(value.sdpMid, STUDIO_LIVE_SDP_MID_MAX_LENGTH, true)) &&
    (value.sdpMLineIndex === null ||
      isFiniteInteger(value.sdpMLineIndex, 0, 65_535)) &&
    (value.usernameFragment === null ||
      exactString(value.usernameFragment, STUDIO_LIVE_USERNAME_FRAGMENT_MAX_LENGTH, true))
  );
}

function isScreenStopPayload(value: unknown): value is StudioLiveScreenStopPayload {
  return isShareRequestPayload(value);
}

const MESSAGE_KINDS = new Set<StudioLiveMessageKind>([
  "presence:hello",
  "presence:heartbeat",
  "presence:leave",
  "cursor:update",
  "lock:claim",
  "lock:release",
  "screen:announce",
  "screen:request",
  "screen:access",
  "webrtc:description",
  "webrtc:ice",
  "screen:stop",
]);

function isKind(value: unknown): value is StudioLiveMessageKind {
  return typeof value === "string" && MESSAGE_KINDS.has(value as StudioLiveMessageKind);
}

function payloadMatchesKind(
  kind: StudioLiveMessageKind,
  payload: unknown,
  sentAt: number
): boolean {
  switch (kind) {
    case "presence:hello":
    case "presence:heartbeat":
      return isPresencePayload(payload);
    case "presence:leave":
      return isEmptyPayload(payload);
    case "cursor:update":
      return isCursorPayload(payload);
    case "lock:claim":
      return isLockClaimPayload(payload, sentAt);
    case "lock:release":
      return isLockReleasePayload(payload);
    case "screen:announce":
      return isShareAnnouncePayload(payload);
    case "screen:request":
      return isShareRequestPayload(payload);
    case "screen:access":
      return isScreenAccessPayload(payload);
    case "webrtc:description":
      return isDescriptionPayload(payload);
    case "webrtc:ice":
      return isIcePayload(payload);
    case "screen:stop":
      return isScreenStopPayload(payload);
  }
}

function targetMatchesKind(kind: StudioLiveMessageKind, targetSessionId: string | null): boolean {
  const targeted =
    kind === "screen:request" ||
    kind === "screen:access" ||
    kind === "webrtc:description" ||
    kind === "webrtc:ice";
  return targeted ? targetSessionId !== null : targetSessionId === null;
}

export function studioLiveEnvelopeByteLength(value: unknown): number | null {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return null;
    return STUDIO_LIVE_TEXT_ENCODER.encode(serialized).byteLength;
  } catch {
    return null;
  }
}

/**
 * Strictly validates an untrusted transport message. Invalid/replayed/cross-work/untargeted data is
 * rejected before it can mutate presence, lock or WebRTC state.
 */
export function parseStudioLiveEnvelope(
  value: unknown,
  options: ParseStudioLiveEnvelopeOptions
): StudioLiveEnvelope | null {
  const bytes = studioLiveEnvelopeByteLength(value);
  if (bytes === null || bytes > STUDIO_LIVE_MESSAGE_MAX_BYTES || !isRecord(value)) return null;
  if (
    !hasExactKeys(value, [
      "version",
      "workId",
      "sender",
      "sentAt",
      "sequence",
      "kind",
      "targetSessionId",
      "payload",
    ]) ||
    value.version !== STUDIO_LIVE_PROTOCOL_VERSION ||
    !exactString(value.workId, MAX_ID_LENGTH) ||
    value.workId !== options.expectedWorkId ||
    !isParticipant(value.sender) ||
    !isFiniteInteger(value.sentAt, 0, Number.MAX_SAFE_INTEGER) ||
    !isFiniteInteger(value.sequence, 1, Number.MAX_SAFE_INTEGER) ||
    !isKind(value.kind) ||
    !nullableId(value.targetSessionId)
  ) {
    return null;
  }

  const now = options.now ?? Date.now();
  if (
    value.sentAt < now - STUDIO_LIVE_MESSAGE_MAX_AGE_MS ||
    value.sentAt > now + STUDIO_LIVE_MESSAGE_FUTURE_SKEW_MS ||
    (options.selfSessionId != null && options.selfSessionId === value.sender.sessionId) ||
    (options.selfSessionId != null &&
      value.targetSessionId !== null &&
      value.targetSessionId !== options.selfSessionId) ||
    !targetMatchesKind(value.kind, value.targetSessionId) ||
    !payloadMatchesKind(value.kind, value.payload, value.sentAt)
  ) {
    return null;
  }

  return value as StudioLiveEnvelope;
}

export interface CreateStudioLiveEnvelopeInput<K extends StudioLiveMessageKind> {
  workId: string;
  sender: StudioLiveParticipant;
  sentAt: number;
  sequence: number;
  kind: K;
  targetSessionId?: string | null;
  payload: StudioLivePayloadMap[K];
}

export function createStudioLiveEnvelope<K extends StudioLiveMessageKind>(
  input: CreateStudioLiveEnvelopeInput<K>
): StudioLiveEnvelope<K> {
  const candidate: StudioLiveEnvelope<K> = {
    version: STUDIO_LIVE_PROTOCOL_VERSION,
    workId: input.workId,
    sender: input.sender,
    sentAt: input.sentAt,
    sequence: input.sequence,
    kind: input.kind,
    targetSessionId: input.targetSessionId ?? null,
    payload: input.payload,
  };
  const parsed = parseStudioLiveEnvelope(candidate, {
    expectedWorkId: input.workId,
    now: input.sentAt,
  });
  if (!parsed) throw new StudioLiveProtocolError("유효하지 않은 실시간 협업 메시지입니다.");
  return candidate;
}

/** Stable, non-secret room name. Work-id collision is still rejected by the envelope parser. */
export function studioLocalLiveChannelName(workId: string): string {
  if (!exactString(workId, MAX_ID_LENGTH)) {
    throw new StudioLiveProtocolError("유효한 작품 ID가 필요합니다.");
  }
  let hash = 2_166_136_261;
  for (const character of workId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return `toonspectrum:studio-live:v${STUDIO_LIVE_PROTOCOL_VERSION}:${(hash >>> 0).toString(16)}`;
}
