export const REALTIME_PROTOCOL_VERSION = "toonspectrum.realtime.v1" as const;
export const REALTIME_WEBSOCKET_PROTOCOL = "toonspectrum-realtime-v1" as const;
export const REALTIME_TICKET_PROTOCOL_PREFIX = "ts-ticket." as const;

export const REALTIME_MAX_INBOUND_FRAME_BYTES = 64 * 1024;
export const REALTIME_MAX_OUTBOUND_FRAME_BYTES = 128 * 1024;
export const REALTIME_MAX_COMMENT_BYTES = 8 * 1024;
export const REALTIME_MAX_SDP_BYTES = 48 * 1024;
export const REALTIME_MAX_ICE_CANDIDATE_BYTES = 8 * 1024;
export const REALTIME_MAX_REPLAY_EVENTS_PER_FRAME = 128;

export const REALTIME_CHANNELS = [
  "presence",
  "comments",
  "screen-signaling",
] as const;

export type RealtimeChannel = (typeof REALTIME_CHANNELS)[number];

export interface PresenceUpdatePayload {
  readonly kind: "presence.update";
  readonly pageId: string | null;
  /**
   * Display-only metadata supplied by the client. It is never used for ACL, ticket scopes, or
   * comment permissions; those remain server-owned authorization decisions.
   */
  readonly profile: {
    readonly displayName: string;
    readonly role: "owner" | "admin" | "editor" | "commenter" | "viewer";
    readonly state: "active" | "idle" | "away";
  };
  readonly tool: string | null;
}

export interface PresenceCursorPayload {
  readonly kind: "presence.cursor";
  readonly x: number;
  readonly y: number;
  readonly pageId: string | null;
  readonly tool: string | null;
  readonly drawing: boolean;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly strokeOpacity?: number;
  readonly points?: readonly number[];
}

export interface PresenceLeavePayload {
  readonly kind: "presence.leave";
}

export type PresencePayload =
  | PresenceUpdatePayload
  | PresenceCursorPayload
  | PresenceLeavePayload;

export interface CommentChangedPayload {
  readonly kind: "comment.changed";
  readonly threadId: string;
  readonly activitySequence: string;
  readonly change: "created" | "replied" | "resolved" | "reopened" | "reanchored";
}

export type CommentPayload = CommentChangedPayload;

export interface ScreenAnnouncePayload {
  readonly kind: "signal.announce";
  readonly shareId: string;
  readonly label: string;
}

export interface ScreenRequestPayload {
  readonly kind: "signal.request";
  readonly shareId: string;
  readonly sessionId: string;
  readonly targetClientId: string;
}

export interface ScreenAccessPayload {
  readonly kind: "signal.access";
  readonly shareId: string;
  readonly sessionId: string;
  readonly targetClientId: string;
  readonly decision: "approved" | "rejected" | "ended";
}

export interface ScreenOfferPayload {
  readonly kind: "signal.offer" | "signal.answer";
  readonly sessionId: string;
  readonly peerConnectionId: string;
  readonly targetClientId: string;
  readonly sdp: string;
}

export interface ScreenIcePayload {
  readonly kind: "signal.ice";
  readonly sessionId: string;
  readonly peerConnectionId: string;
  readonly targetClientId: string;
  readonly candidate: {
    readonly candidate: string;
    readonly sdpMid: string | null;
    readonly sdpMLineIndex: number | null;
    readonly usernameFragment: string | null;
  };
}

export interface ScreenStopPayload {
  readonly kind: "signal.stop";
  readonly shareId: string;
}

export type ScreenSignalingPayload =
  | ScreenAnnouncePayload
  | ScreenRequestPayload
  | ScreenAccessPayload
  | ScreenOfferPayload
  | ScreenIcePayload
  | ScreenStopPayload;

export type RealtimePayload =
  | PresencePayload
  | CommentPayload
  | ScreenSignalingPayload;

export interface ClientPublishMessage {
  readonly version: typeof REALTIME_PROTOCOL_VERSION;
  readonly type: "publish";
  readonly idempotencyKey: string;
  readonly clientSequence: number;
  readonly sentAtMs: number;
  readonly channel: RealtimeChannel;
  readonly payload: RealtimePayload;
}

export interface ClientResumeMessage {
  readonly version: typeof REALTIME_PROTOCOL_VERSION;
  readonly type: "resume";
  readonly channel: RealtimeChannel;
  readonly afterSequence: number;
}

export interface ClientPingMessage {
  readonly version: typeof REALTIME_PROTOCOL_VERSION;
  readonly type: "ping";
}

export type RealtimeClientMessage =
  | ClientPublishMessage
  | ClientResumeMessage
  | ClientPingMessage;

export interface ServerEventMessage {
  readonly version: typeof REALTIME_PROTOCOL_VERSION;
  readonly type: "event";
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly connectionId: string;
  readonly channel: RealtimeChannel;
  readonly serverAtMs: number;
  readonly payload: RealtimePayload;
}

export interface ServerWelcomeMessage {
  readonly version: typeof REALTIME_PROTOCOL_VERSION;
  readonly type: "welcome";
  readonly workId: string;
  readonly roomId: string;
  readonly connectionId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly scopes: readonly RealtimeChannel[];
  readonly channelStates: RealtimeChannelSequenceStates;
  readonly sessionExpiresAtMs: number;
}

export interface RealtimeChannelSequenceState {
  readonly currentSequence: number;
  readonly replayFloorSequence: number;
}

export interface RealtimeChannelSequenceStates {
  readonly presence: RealtimeChannelSequenceState;
  readonly comments: RealtimeChannelSequenceState;
  readonly "screen-signaling": RealtimeChannelSequenceState;
}

export interface ServerAckMessage {
  readonly version: typeof REALTIME_PROTOCOL_VERSION;
  readonly type: "ack";
  readonly channel: RealtimeChannel;
  readonly idempotencyKey: string;
  readonly sequence: number;
  readonly duplicate: boolean;
}

export interface ServerReplayMessage {
  readonly version: typeof REALTIME_PROTOCOL_VERSION;
  readonly type: "replay";
  readonly channel: RealtimeChannel;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly currentSequence: number;
  readonly complete: boolean;
  readonly events: readonly ServerEventMessage[];
}

export type PresenceSnapshotCursorPayload = Omit<
  PresenceCursorPayload,
  "points"
>;

export interface PresenceSnapshotEntry {
  readonly connectionId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly update: PresenceUpdatePayload | null;
  readonly cursor: PresenceSnapshotCursorPayload | null;
}

export interface ServerPresenceSnapshotMessage {
  readonly version: typeof REALTIME_PROTOCOL_VERSION;
  readonly type: "presence-snapshot";
  readonly channel: "presence";
  readonly sequence: number;
  readonly snapshotId: string;
  readonly page: number;
  readonly complete: boolean;
  readonly generatedAtMs: number;
  readonly entries: readonly PresenceSnapshotEntry[];
}

export type RealtimeProtocolErrorCode =
  | "binary-not-supported"
  | "frame-too-large"
  | "invalid-json"
  | "invalid-envelope"
  | "invalid-payload"
  | "scope-denied"
  | "sequence-out-of-order"
  | "event-too-old"
  | "event-from-future"
  | "idempotency-conflict"
  | "rate-limited"
  | "signaling-state-conflict"
  | "resume-gap"
  | "backpressure"
  | "session-expired"
  | "internal-error";

export interface ServerErrorMessage {
  readonly version: typeof REALTIME_PROTOCOL_VERSION;
  readonly type: "error";
  readonly code: RealtimeProtocolErrorCode;
  readonly retryable: boolean;
  readonly channel?: RealtimeChannel;
  readonly idempotencyKey?: string;
  readonly currentSequence?: number;
  readonly replayFloorSequence?: number;
}

export interface ServerPongMessage {
  readonly version: typeof REALTIME_PROTOCOL_VERSION;
  readonly type: "pong";
}

export type RealtimeServerMessage =
  | ServerEventMessage
  | ServerWelcomeMessage
  | ServerAckMessage
  | ServerReplayMessage
  | ServerPresenceSnapshotMessage
  | ServerErrorMessage
  | ServerPongMessage;

export type ServerMessageParseResult =
  | { readonly ok: true; readonly value: RealtimeServerMessage }
  | {
      readonly ok: false;
      readonly code: "frame-too-large" | "invalid-json" | "invalid-envelope";
    };

export const REALTIME_CLIENT_PING_FRAME = JSON.stringify({
  version: REALTIME_PROTOCOL_VERSION,
  type: "ping",
} satisfies ClientPingMessage);

export const REALTIME_SERVER_PONG_FRAME = JSON.stringify({
  version: REALTIME_PROTOCOL_VERSION,
  type: "pong",
} satisfies ServerPongMessage);

export type ClientMessageParseResult =
  | { readonly ok: true; readonly value: RealtimeClientMessage }
  | {
      readonly ok: false;
      readonly code: Extract<
        RealtimeProtocolErrorCode,
        "frame-too-large" | "invalid-json" | "invalid-envelope" | "invalid-payload"
      >;
    };

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/;
const FORBIDDEN_EMBEDDED_BINARY_PATTERN =
  /data:(?:(?:image|audio|video)\/|application\/octet-stream(?:[;,]|$))/i;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function isRealtimeId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function isRealtimeChannel(value: unknown): value is RealtimeChannel {
  return (
    typeof value === "string" &&
    REALTIME_CHANNELS.includes(value as RealtimeChannel)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const actualKeys = Object.keys(value);
  const permitted = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    actualKeys.every((key) => permitted.has(key))
  );
}

function isFiniteCoordinate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= 10_000_000
  );
}

function isSafeInteger(
  value: unknown,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint <= 31 ||
      (codePoint >= 127 && codePoint <= 159)
    ) {
      return true;
    }
  }
  return false;
}

function isBoundedText(
  value: unknown,
  maximumBytes: number,
  options: { readonly allowEmpty?: boolean } = {},
): value is string {
  return (
    typeof value === "string" &&
    (options.allowEmpty === true || value.trim().length > 0) &&
    utf8ByteLength(value) <= maximumBytes &&
    !FORBIDDEN_EMBEDDED_BINARY_PATTERN.test(value)
  );
}

function isNullableBoundedText(
  value: unknown,
  maximumBytes: number,
): value is string | null {
  return value === null || isBoundedText(value, maximumBytes);
}

function validatePresencePayload(value: unknown): value is PresencePayload {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  if (value.kind === "presence.leave") {
    return hasExactKeys(value, ["kind"]);
  }
  if (value.kind === "presence.cursor") {
    return (
      hasExactKeys(value, [
        "kind",
        "x",
        "y",
        "pageId",
        "tool",
        "drawing",
      ], [
        "strokeColor",
        "strokeWidth",
        "strokeOpacity",
        "points",
      ]) &&
      typeof value.x === "number" &&
      Number.isFinite(value.x) &&
      value.x >= 0 &&
      value.x <= 1 &&
      typeof value.y === "number" &&
      Number.isFinite(value.y) &&
      value.y >= 0 &&
      value.y <= 1 &&
      (value.pageId === null || isRealtimeId(value.pageId)) &&
      (value.tool === null ||
        (typeof value.tool === "string" &&
          value.tool.length > 0 &&
          value.tool.length <= 64 &&
          isBoundedText(value.tool, 256))) &&
      typeof value.drawing === "boolean" &&
      (value.strokeColor === undefined ||
        (typeof value.strokeColor === "string" &&
          value.strokeColor.length > 0 &&
          value.strokeColor.length <= 64 &&
          isBoundedText(value.strokeColor, 256))) &&
      (value.strokeWidth === undefined ||
        (typeof value.strokeWidth === "number" &&
          Number.isFinite(value.strokeWidth) &&
          value.strokeWidth >= 0.01 &&
          value.strokeWidth <= 4_096)) &&
      (value.strokeOpacity === undefined ||
        (typeof value.strokeOpacity === "number" &&
          Number.isFinite(value.strokeOpacity) &&
          value.strokeOpacity >= 0 &&
          value.strokeOpacity <= 1)) &&
      (value.points === undefined ||
        (Array.isArray(value.points) &&
          value.points.length <= 512 &&
          value.points.every(isFiniteCoordinate)))
    );
  }
  if (
    value.kind !== "presence.update" ||
    !hasExactKeys(value, ["kind", "pageId", "profile", "tool"]) ||
    (value.pageId !== null && !isRealtimeId(value.pageId)) ||
    (value.tool !== null &&
      (typeof value.tool !== "string" ||
        value.tool.length === 0 ||
        value.tool.length > 64 ||
        !isBoundedText(value.tool, 256))) ||
    !isRecord(value.profile) ||
    !hasExactKeys(value.profile, ["displayName", "role", "state"])
  ) {
    return false;
  }
  return (
    typeof value.profile.displayName === "string" &&
    value.profile.displayName.length <= 80 &&
    isBoundedText(value.profile.displayName, 320) &&
    !containsControlCharacter(value.profile.displayName) &&
    (value.profile.role === "owner" ||
      value.profile.role === "admin" ||
      value.profile.role === "editor" ||
      value.profile.role === "commenter" ||
      value.profile.role === "viewer") &&
    (value.profile.state === "active" ||
      value.profile.state === "idle" ||
      value.profile.state === "away")
  );
}

function validateCommentPayload(value: unknown): value is CommentPayload {
  return (
    isRecord(value) &&
    value.kind === "comment.changed" &&
    hasExactKeys(value, [
      "kind",
      "threadId",
      "activitySequence",
      "change",
    ]) &&
    isRealtimeId(value.threadId) &&
    typeof value.activitySequence === "string" &&
    /^(?:[1-9][0-9]{0,18})$/u.test(value.activitySequence) &&
    BigInt(value.activitySequence) <= BigInt("9223372036854775807") &&
    (value.change === "created" ||
      value.change === "replied" ||
      value.change === "resolved" ||
      value.change === "reopened" ||
      value.change === "reanchored")
  );
}

function validateSignalTarget(
  value: Record<string, unknown>,
): value is Record<string, unknown> & {
  readonly sessionId: string;
  readonly targetClientId: string;
} {
  return (
    isRealtimeId(value.sessionId) && isRealtimeId(value.targetClientId)
  );
}

function validateScreenSignalingPayload(
  value: unknown,
): value is ScreenSignalingPayload {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  if (value.kind === "signal.announce") {
    return (
      hasExactKeys(value, ["kind", "shareId", "label"]) &&
      isRealtimeId(value.shareId) &&
      isBoundedText(value.label, 320) &&
      value.label.length <= 80
    );
  }
  if (value.kind === "signal.request") {
    return (
      hasExactKeys(value, [
        "kind",
        "shareId",
        "sessionId",
        "targetClientId",
      ]) &&
      isRealtimeId(value.shareId) &&
      value.sessionId === value.shareId &&
      isRealtimeId(value.targetClientId)
    );
  }
  if (value.kind === "signal.access") {
    return (
      hasExactKeys(value, [
        "kind",
        "shareId",
        "sessionId",
        "targetClientId",
        "decision",
      ]) &&
      isRealtimeId(value.shareId) &&
      value.sessionId === value.shareId &&
      isRealtimeId(value.targetClientId) &&
      (value.decision === "approved" ||
        value.decision === "rejected" ||
        value.decision === "ended")
    );
  }
  if (value.kind === "signal.offer" || value.kind === "signal.answer") {
    return (
      hasExactKeys(value, [
        "kind",
        "sessionId",
        "peerConnectionId",
        "targetClientId",
        "sdp",
      ]) &&
      validateSignalTarget(value) &&
      isRealtimeId(value.peerConnectionId) &&
      isBoundedText(value.sdp, REALTIME_MAX_SDP_BYTES)
    );
  }
  if (value.kind === "signal.ice") {
    if (
      !hasExactKeys(value, [
        "kind",
        "sessionId",
        "peerConnectionId",
        "targetClientId",
        "candidate",
      ]) ||
      !validateSignalTarget(value) ||
      !isRealtimeId(value.peerConnectionId) ||
      !isRecord(value.candidate) ||
      !hasExactKeys(value.candidate, [
        "candidate",
        "sdpMid",
        "sdpMLineIndex",
        "usernameFragment",
      ])
    ) {
      return false;
    }
    return (
      isBoundedText(
        value.candidate.candidate,
        REALTIME_MAX_ICE_CANDIDATE_BYTES,
        { allowEmpty: true },
      ) &&
      isNullableBoundedText(value.candidate.sdpMid, 256) &&
      (value.candidate.sdpMLineIndex === null ||
        isSafeInteger(value.candidate.sdpMLineIndex, 0, 65_535)) &&
      isNullableBoundedText(value.candidate.usernameFragment, 256)
    );
  }
  if (value.kind === "signal.stop") {
    return (
      hasExactKeys(value, ["kind", "shareId"]) &&
      isRealtimeId(value.shareId)
    );
  }
  return false;
}

export function validatePayloadForChannel(
  channel: RealtimeChannel,
  value: unknown,
): value is RealtimePayload {
  if (channel === "presence") {
    return validatePresencePayload(value);
  }
  if (channel === "comments") {
    return validateCommentPayload(value);
  }
  return validateScreenSignalingPayload(value);
}

function canonicalizeProtocolValue(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => canonicalizeProtocolValue(item))
      .join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalizeProtocolValue(record[key])}`,
    )
    .join(",")}}`;
}

export function areRealtimePayloadsEquivalent(
  left: RealtimePayload,
  right: RealtimePayload,
): boolean {
  return canonicalizeProtocolValue(left) === canonicalizeProtocolValue(right);
}

export function isServerEventMessage(
  value: unknown,
): value is ServerEventMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "version",
      "type",
      "sequence",
      "idempotencyKey",
      "actorId",
      "clientId",
      "connectionId",
      "channel",
      "serverAtMs",
      "payload",
    ]) &&
    value.version === REALTIME_PROTOCOL_VERSION &&
    value.type === "event" &&
    isSafeInteger(value.sequence, 1) &&
    typeof value.idempotencyKey === "string" &&
    IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey) &&
    isRealtimeId(value.actorId) &&
    isRealtimeId(value.clientId) &&
    isRealtimeId(value.connectionId) &&
    isRealtimeChannel(value.channel) &&
    isSafeInteger(value.serverAtMs) &&
    validatePayloadForChannel(value.channel, value.payload)
  );
}

function isChannelSequenceState(
  value: unknown,
): value is RealtimeChannelSequenceState {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "currentSequence",
      "replayFloorSequence",
    ]) &&
    isSafeInteger(value.currentSequence) &&
    isSafeInteger(value.replayFloorSequence, 1) &&
    value.replayFloorSequence <= value.currentSequence + 1
  );
}

function isChannelSequenceStates(
  value: unknown,
): value is RealtimeChannelSequenceStates {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "presence",
      "comments",
      "screen-signaling",
    ]) &&
    isChannelSequenceState(value.presence) &&
    isChannelSequenceState(value.comments) &&
    isChannelSequenceState(value["screen-signaling"])
  );
}

function isServerWelcomeMessage(
  value: unknown,
): value is ServerWelcomeMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "version",
      "type",
      "workId",
      "roomId",
      "connectionId",
      "actorId",
      "clientId",
      "scopes",
      "channelStates",
      "sessionExpiresAtMs",
    ]) &&
    value.version === REALTIME_PROTOCOL_VERSION &&
    value.type === "welcome" &&
    isRealtimeId(value.workId) &&
    isRealtimeId(value.roomId) &&
    isRealtimeId(value.connectionId) &&
    isRealtimeId(value.actorId) &&
    isRealtimeId(value.clientId) &&
    Array.isArray(value.scopes) &&
    value.scopes.length >= 1 &&
    value.scopes.length <= REALTIME_CHANNELS.length &&
    value.scopes.every(isRealtimeChannel) &&
    new Set(value.scopes).size === value.scopes.length &&
    isChannelSequenceStates(value.channelStates) &&
    isSafeInteger(value.sessionExpiresAtMs, 1)
  );
}

function isServerAckMessage(value: unknown): value is ServerAckMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "version",
      "type",
      "channel",
      "idempotencyKey",
      "sequence",
      "duplicate",
    ]) &&
    value.version === REALTIME_PROTOCOL_VERSION &&
    value.type === "ack" &&
    isRealtimeChannel(value.channel) &&
    typeof value.idempotencyKey === "string" &&
    IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey) &&
    isSafeInteger(value.sequence, 1) &&
    typeof value.duplicate === "boolean"
  );
}

function isServerReplayMessage(
  value: unknown,
): value is ServerReplayMessage {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "type",
      "channel",
      "fromSequence",
      "toSequence",
      "currentSequence",
      "complete",
      "events",
    ]) ||
    value.version !== REALTIME_PROTOCOL_VERSION ||
    value.type !== "replay" ||
    !isRealtimeChannel(value.channel) ||
    !isSafeInteger(value.fromSequence, 1) ||
    !isSafeInteger(value.toSequence) ||
    !isSafeInteger(value.currentSequence) ||
    value.toSequence > value.currentSequence ||
    typeof value.complete !== "boolean" ||
    !Array.isArray(value.events) ||
    value.events.length > REALTIME_MAX_REPLAY_EVENTS_PER_FRAME ||
    !value.events.every(
      (event) =>
        isServerEventMessage(event) &&
        event.channel === value.channel,
    )
  ) {
    return false;
  }
  let previous = value.fromSequence - 1;
  for (const event of value.events) {
    if (
      event.sequence < value.fromSequence ||
      event.sequence > value.toSequence ||
      event.sequence <= previous
    ) {
      return false;
    }
    previous = event.sequence;
  }
  return (
    (value.complete
      ? value.toSequence === value.currentSequence
      : value.toSequence < value.currentSequence) &&
    (value.events.length === 0 || value.toSequence >= value.fromSequence)
  );
}

function isPresenceSnapshotEntry(
  value: unknown,
): value is PresenceSnapshotEntry {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "connectionId",
      "actorId",
      "clientId",
      "update",
      "cursor",
    ]) &&
    isRealtimeId(value.connectionId) &&
    isRealtimeId(value.actorId) &&
    isRealtimeId(value.clientId) &&
    (value.update === null ||
      (validatePresencePayload(value.update) &&
        value.update.kind === "presence.update")) &&
    (value.cursor === null ||
      (validatePresencePayload(value.cursor) &&
        value.cursor.kind === "presence.cursor" &&
        !Object.hasOwn(value.cursor, "points")))
  );
}

function isServerPresenceSnapshotMessage(
  value: unknown,
): value is ServerPresenceSnapshotMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "version",
      "type",
      "channel",
      "sequence",
      "snapshotId",
      "page",
      "complete",
      "generatedAtMs",
      "entries",
    ]) &&
    value.version === REALTIME_PROTOCOL_VERSION &&
    value.type === "presence-snapshot" &&
    value.channel === "presence" &&
    isSafeInteger(value.sequence) &&
    isRealtimeId(value.snapshotId) &&
    isSafeInteger(value.page) &&
    typeof value.complete === "boolean" &&
    isSafeInteger(value.generatedAtMs) &&
    Array.isArray(value.entries) &&
    value.entries.length <= 128 &&
    value.entries.every(isPresenceSnapshotEntry)
  );
}

function isServerErrorMessage(value: unknown): value is ServerErrorMessage {
  const codes: readonly RealtimeProtocolErrorCode[] = [
    "binary-not-supported",
    "frame-too-large",
    "invalid-json",
    "invalid-envelope",
    "invalid-payload",
    "scope-denied",
    "sequence-out-of-order",
    "event-too-old",
    "event-from-future",
    "idempotency-conflict",
    "rate-limited",
    "signaling-state-conflict",
    "resume-gap",
    "backpressure",
    "session-expired",
    "internal-error",
  ];
  return (
    isRecord(value) &&
    hasExactKeys(
      value,
      ["version", "type", "code", "retryable"],
      [
        "channel",
        "idempotencyKey",
        "currentSequence",
        "replayFloorSequence",
      ],
    ) &&
    value.version === REALTIME_PROTOCOL_VERSION &&
    value.type === "error" &&
    typeof value.code === "string" &&
    codes.includes(value.code as RealtimeProtocolErrorCode) &&
    typeof value.retryable === "boolean" &&
    (value.channel === undefined || isRealtimeChannel(value.channel)) &&
    (value.idempotencyKey === undefined ||
      (typeof value.idempotencyKey === "string" &&
        IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey))) &&
    (value.currentSequence === undefined ||
      isSafeInteger(value.currentSequence)) &&
    (value.replayFloorSequence === undefined ||
      isSafeInteger(value.replayFloorSequence))
  );
}

export function parseRealtimeServerMessage(
  source: string,
): ServerMessageParseResult {
  if (utf8ByteLength(source) > REALTIME_MAX_OUTBOUND_FRAME_BYTES) {
    return { ok: false, code: "frame-too-large" };
  }
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    return { ok: false, code: "invalid-json" };
  }
  if (
    isServerEventMessage(value) ||
    isServerWelcomeMessage(value) ||
    isServerAckMessage(value) ||
    isServerReplayMessage(value) ||
    isServerPresenceSnapshotMessage(value) ||
    isServerErrorMessage(value) ||
    (isRecord(value) &&
      hasExactKeys(value, ["version", "type"]) &&
      value.version === REALTIME_PROTOCOL_VERSION &&
      value.type === "pong")
  ) {
    return { ok: true, value: value as RealtimeServerMessage };
  }
  return { ok: false, code: "invalid-envelope" };
}

export function parseRealtimeClientMessage(
  source: string,
  maximumBytes = REALTIME_MAX_INBOUND_FRAME_BYTES,
): ClientMessageParseResult {
  if (utf8ByteLength(source) > maximumBytes) {
    return { ok: false, code: "frame-too-large" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return { ok: false, code: "invalid-json" };
  }

  if (
    !isRecord(parsed) ||
    parsed.version !== REALTIME_PROTOCOL_VERSION ||
    typeof parsed.type !== "string"
  ) {
    return { ok: false, code: "invalid-envelope" };
  }

  if (parsed.type === "ping") {
    return hasExactKeys(parsed, ["version", "type"])
      ? { ok: true, value: parsed as unknown as ClientPingMessage }
      : { ok: false, code: "invalid-envelope" };
  }

  if (parsed.type === "resume") {
    if (
      !hasExactKeys(parsed, [
        "version",
        "type",
        "channel",
        "afterSequence",
      ]) ||
      !isRealtimeChannel(parsed.channel) ||
      !isSafeInteger(parsed.afterSequence)
    ) {
      return { ok: false, code: "invalid-envelope" };
    }
    return { ok: true, value: parsed as unknown as ClientResumeMessage };
  }

  if (parsed.type !== "publish") {
    return { ok: false, code: "invalid-envelope" };
  }
  if (
    !hasExactKeys(parsed, [
      "version",
      "type",
      "idempotencyKey",
      "clientSequence",
      "sentAtMs",
      "channel",
      "payload",
    ]) ||
    typeof parsed.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(parsed.idempotencyKey) ||
    !isSafeInteger(parsed.clientSequence, 1) ||
    !isSafeInteger(parsed.sentAtMs) ||
    !isRealtimeChannel(parsed.channel)
  ) {
    return { ok: false, code: "invalid-envelope" };
  }
  if (!validatePayloadForChannel(parsed.channel, parsed.payload)) {
    return { ok: false, code: "invalid-payload" };
  }
  return { ok: true, value: parsed as unknown as ClientPublishMessage };
}

export function serializeRealtimeServerMessage(
  message: RealtimeServerMessage,
): string {
  const serialized = JSON.stringify(message);
  if (utf8ByteLength(serialized) > REALTIME_MAX_OUTBOUND_FRAME_BYTES) {
    throw new Error("Realtime server frame exceeds the protocol limit");
  }
  return serialized;
}
