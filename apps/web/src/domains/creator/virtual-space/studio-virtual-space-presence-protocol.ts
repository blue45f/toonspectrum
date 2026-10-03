/**
 * 가상 스튜디오 presence 와이어 프로토콜.
 *
 * `studio-virtual-space-presence.ts`(컨트롤러)에서 응집 단위로 분리한 파일이다.
 * 와이어 상수·패킷/스냅샷 타입·presence state 검증/살균·패킷 파싱/인코딩만 다루고,
 * 세션 상태나 전송 타이머 같은 컨트롤러 상태는 갖지 않는다.
 * 컨트롤러 파일이 이 모듈을 다시 export하므로 기존 import 경로는 그대로 유지된다.
 */
import { parseStudioVirtualSpaceAppearance, type StudioVirtualSpaceAppearance } from "./studio-virtual-space-appearance";
import {
  isStudioVirtualSpaceChatScope,
  maskStudioChatProfanity,
  type StudioVirtualSpaceChatBubble,
  type StudioVirtualSpaceChatMessage,
  type StudioVirtualSpaceChatScope,
  type StudioVirtualSpaceChatTyping,
} from "./studio-virtual-space-chat";
import type { StudioEmoteKind } from "./studio-virtual-space-emotes";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import {
  isStudioSpaceEmoteId,
  type StudioSpaceEmoteId,
} from "./studio-virtual-space-emote-catalog";
import {
  STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  STUDIO_VIRTUAL_SPACE_AVATAR_COUNT,
  studioVirtualSpaceState,
  type StudioVirtualSpaceActivity,
  type StudioVirtualSpaceFacing,
  type StudioVirtualSpacePeer,
  type StudioVirtualSpacePoint,
  type StudioVirtualSpacePresenceState,
  type StudioVirtualSpaceZoneId,
} from "./studio-virtual-space-model";

export const STUDIO_VIRTUAL_SPACE_WIRE = "toonstudio-space-v1";
export const STUDIO_VIRTUAL_SPACE_PRESENCE_INTERVAL_MS = 90;
export const STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS = 2_500;
export const STUDIO_VIRTUAL_SPACE_STALE_MS = 10_000;
export const STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES = 1_024;
/** 기본 리액션 표시 시간. 수신·송신 만료는 이모트별 durationMs(1200~4000ms)를 따른다. */
export const STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS = 2_400;
/** 같은 사용자의 리액션 패킷은 250ms 안에 한 번만 보낸다(단축키 연타 폭주 방지). */
export const STUDIO_VIRTUAL_SPACE_REACTION_THROTTLE_MS = 250;
/** 말풍선 텍스트 최대 길이 (1024바이트 패킷 제한 안에서 여유 있게). */
export const STUDIO_PRESENCE_BUBBLE_MAX_LENGTH = 140;
/** 말풍선 표시 시간. 만료되면 송신 측이 직접 지워 브로드캐스트한다. */
export const STUDIO_PRESENCE_BUBBLE_TTL_MS = 5_000;
/**
 * 타이핑 신호 신선도. 입력 중에는 presence가 dirty 전송·하트비트(2.5초)로 계속
 * 갱신되므로, 이 시간 안에 새 패킷이 없으면 송신 측이 비정상 종료한 것으로 보고
 * 수신 측이 타이핑 표시를 스스로 거둔다.
 */
export const STUDIO_PRESENCE_TYPING_STALE_MS = 6_000;

/** 와이어 값은 이모트 카탈로그 id다. 기존 wave·heart·sparkles·thumbs-up 값은 그대로 유지된다. */
export type StudioVirtualSpaceReaction = StudioSpaceEmoteId;

export interface StudioVirtualSpaceReactionSnapshot {
  readonly sessionId: string;
  readonly reaction: StudioVirtualSpaceReaction;
  readonly expiresAt: number;
}

interface StudioVirtualSpacePresencePacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly worldScope?: string;
  readonly kind: "presence";
  readonly sequence: number;
  readonly at: number;
  readonly state: StudioVirtualSpacePresenceState;
}

interface StudioVirtualSpaceLeavePacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly worldScope?: string;
  readonly kind: "leave";
  readonly sequence: number;
  readonly at: number;
}

interface StudioVirtualSpaceReactionPacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly worldScope?: string;
  readonly kind: "reaction";
  readonly sequence: number;
  readonly at: number;
  readonly reaction: StudioVirtualSpaceReaction;
}

/**
 * 플레이어 말풍선 채팅 패킷. 와이어("toonstudio-space-v1")는 그대로 두고 kind만
 * 추가한 하위호환 확장이다 — 구버전 파서는 모르는 kind를 패킷째 무시하므로
 * 구버전 클라이언트가 섞인 방에서도 presence는 깨지지 않는다.
 * 범위(nearby/all)는 발신자가 선언하고, 실제 거리 필터는 수신 측이 자기 위치와
 * 발신자의 마지막 presence 위치로 판정한다.
 */
interface StudioVirtualSpaceChatPacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly worldScope?: string;
  readonly kind: "chat";
  readonly sequence: number;
  readonly at: number;
  readonly scope: StudioVirtualSpaceChatScope;
  readonly text: string;
}

interface StudioVirtualSpaceTypingPacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly worldScope?: string;
  readonly kind: "typing";
  readonly sequence: number;
  readonly at: number;
  readonly scope: StudioVirtualSpaceChatScope;
  readonly typing: boolean;
}

export type StudioVirtualSpacePacket =
  | StudioVirtualSpacePresencePacket
  | StudioVirtualSpaceLeavePacket
  | StudioVirtualSpaceReactionPacket
  | StudioVirtualSpaceChatPacket
  | StudioVirtualSpaceTypingPacket;

export interface StudioVirtualSpaceSnapshot {
  readonly self: StudioVirtualSpacePresenceState;
  readonly peers: readonly StudioVirtualSpacePeer[];
  readonly nearbyPeers: readonly StudioVirtualSpacePeer[];
  readonly selfReaction: StudioVirtualSpaceReaction | null;
  readonly peerReactions: readonly StudioVirtualSpaceReactionSnapshot[];
  /** 말풍선 채팅 로그(오래된 순). nearby 범위는 수신 시점에 거리로 걸러진 것만 남는다. */
  readonly chatMessages: readonly StudioVirtualSpaceChatMessage[];
  /** 피어들의 표시 중 채팅 말풍선. 자기 말풍선은 selfChatBubble로 분리한다. */
  readonly chatBubbles: readonly StudioVirtualSpaceChatBubble[];
  readonly selfChatBubble: StudioVirtualSpaceChatBubble | null;
  /** 입력 중인 피어. nearby 범위는 현재 거리로 다시 걸러진다. */
  readonly peerTyping: readonly StudioVirtualSpaceChatTyping[];
  readonly direct: boolean;
}

export interface StudioVirtualSpacePresenceDependencies {
  /** Only the current server publication reader supplies this scope. Absence keeps bundled-world wire compatibility. */
  readonly worldScope?: string;
  readonly appearanceForAvatarIndex?: (avatarIndex: number, identity: string) => StudioVirtualSpaceAppearance;
  readonly now?: () => number;
  readonly setInterval?: (handler: () => void, delayMs: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

function isSafeZoneId(value: unknown): value is StudioVirtualSpaceZoneId {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 64
    && /^[a-z0-9][a-z0-9_-]*$/iu.test(value);
}
const FACINGS = new Set<StudioVirtualSpaceFacing>(["down", "left", "right", "up"]);
const ACTIVITIES = new Set<StudioVirtualSpaceActivity>(["available", "focused", "reviewing", "away"]);
// A 트랙 studio-virtual-space-emotes.ts의 StudioEmoteKind와 1:1 대응하는 파싱용 allowlist.
// 값 import는 하지 않고(import type만) 목록을 여기서 유지한다 — A 트랙이 kind를
// 추가하면 이 목록에도 같은 값을 추가해야 피어에게 전달된다. 모르는 값은 필드만
// 무시하고 패킷 전체는 버리지 않아 구버전·신버전 혼재 방에서도 presence가 유지된다.
const EMOTE_KINDS = new Set<string>([
  "wave", "dance", "clap", "cheer", "sit", "sleep", "think", "laugh", "bow", "celebrate",
]);
const USER_STATUSES = new Set<string>(["available", "in-meeting", "presenting", "focusing", "away", "break"]);
// eslint-disable-next-line no-control-regex -- 말풍선 입력에서 제어 문자(U+0000–U+001F, U+007F)를 지우려는 의도된 패턴이다.
const BUBBLE_CONTROL_CHARS = /[\u0000-\u001F\u007F]/gu;

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 10_000;
}

/** presence state의 optional 확장 필드 묶음. */
export interface StudioVirtualSpacePresenceExtras {
  readonly emote?: StudioEmoteKind;
  readonly bubble?: string;
  readonly userStatus?: StudioUserStatus;
  readonly typing?: boolean;
}

/**
 * 타이핑 신호를 검증한다. 정확히 boolean true일 때만 입력 중으로 본다.
 * 그 외 값(문자열·숫자·false)은 전부 "입력 중 아님" — 패킷은 유지한다.
 */
export function parseStudioPresenceTyping(value: unknown): boolean | undefined {
  return value === true ? true : undefined;
}

/** 이모트 값을 검증한다. 모르는 값은 undefined (패킷은 유지, 필드만 무시). */
export function parseStudioPresenceEmote(value: unknown): StudioEmoteKind | undefined {
  return typeof value === "string" && EMOTE_KINDS.has(value) ? (value as StudioEmoteKind) : undefined;
}

/** 사용자 상태 값을 검증한다. 모르는 값은 undefined. */
export function parseStudioPresenceUserStatus(value: unknown): StudioUserStatus | undefined {
  return typeof value === "string" && USER_STATUSES.has(value) ? (value as StudioUserStatus) : undefined;
}

/** 말풍선 텍스트를 살균한다. 빈 문자열·제어문자는 제거, 최대 길이로 자른다. */
export function sanitizeStudioPresenceBubble(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(BUBBLE_CONTROL_CHARS, "").trim().slice(0, STUDIO_PRESENCE_BUBBLE_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function runtimePresenceState(
  point: StudioVirtualSpacePoint,
  facing: StudioVirtualSpaceFacing = "down",
  activity: StudioVirtualSpaceActivity = "available",
  moving = false,
  avatarIndex = STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  zoneId?: StudioVirtualSpaceZoneId,
  appearance?: StudioVirtualSpaceAppearance,
  extras: StudioVirtualSpacePresenceExtras = {},
): StudioVirtualSpacePresenceState {
  // The Phaser/Tiled world may be larger than the built-in 850×798 master scene. Use the
  // model helper for avatar/facing/activity sanitization and default-room fallback, but preserve
  // the engine-clamped world coordinates so P2P peers do not snap to the default-world edge.
  const fallback = studioVirtualSpaceState(point, facing, activity, moving, avatarIndex, zoneId);
  return Object.freeze({
    ...fallback,
    x: point.x,
    y: point.y,
    zoneId: zoneId ?? fallback.zoneId,
    ...(appearance ? { appearance } : {}),
    ...(extras.emote ? { emote: extras.emote } : {}),
    ...(extras.bubble ? { bubble: extras.bubble } : {}),
    ...(extras.userStatus ? { userStatus: extras.userStatus } : {}),
    ...(extras.typing ? { typing: true } : {}),
  });
}

function packetBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function parseStudioVirtualSpacePacket(raw: string): StudioVirtualSpacePacket | null {
  if (typeof raw !== "string" || raw.length === 0 || packetBytes(raw) > STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES) {
    return null;
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const packet = candidate as Record<string, unknown>;
  if (
    packet.wire !== STUDIO_VIRTUAL_SPACE_WIRE
    || (packet.kind !== "presence" && packet.kind !== "leave" && packet.kind !== "reaction" && packet.kind !== "chat" && packet.kind !== "typing")
    || !Number.isSafeInteger(packet.sequence)
    || Number(packet.sequence) < 0
    || !Number.isFinite(packet.at)
  ) {
    return null;
  }
  if (packet.worldScope !== undefined && (typeof packet.worldScope !== "string" || !/^[a-f0-9]{64}$/u.test(packet.worldScope))) return null;
  const scope = typeof packet.worldScope === "string" ? { worldScope: packet.worldScope } : {};
  if (packet.kind === "leave") {
    return {
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...scope,
      kind: "leave",
      sequence: Number(packet.sequence),
      at: Number(packet.at),
    };
  }
  if (packet.kind === "reaction") {
    // 모르는 이모트 값은 구버전과 같이 패킷째 버린다.
    if (!isStudioSpaceEmoteId(packet.reaction)) return null;
    return {
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...scope,
      kind: "reaction",
      sequence: Number(packet.sequence),
      at: Number(packet.at),
      reaction: packet.reaction,
    };
  }
  if (packet.kind === "chat") {
    // 범위를 모르거나 살균 후 빈 문장이면 패킷째 버린다. 금칙 마스킹은 수신 측에서도
    // 한 번 더 적용해 변조 클라이언트가 우회하지 못하게 한다.
    if (!isStudioVirtualSpaceChatScope(packet.scope)) return null;
    const text = sanitizeStudioPresenceBubble(packet.text);
    if (!text) return null;
    return {
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...scope,
      kind: "chat",
      sequence: Number(packet.sequence),
      at: Number(packet.at),
      scope: packet.scope,
      text: maskStudioChatProfanity(text),
    };
  }
  if (packet.kind === "typing") {
    if (!isStudioVirtualSpaceChatScope(packet.scope) || typeof packet.typing !== "boolean") return null;
    return {
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...scope,
      kind: "typing",
      sequence: Number(packet.sequence),
      at: Number(packet.at),
      scope: packet.scope,
      typing: packet.typing,
    };
  }
  if (!packet.state || typeof packet.state !== "object" || Array.isArray(packet.state)) return null;
  const state = packet.state as Record<string, unknown>;
  if (
    !isFiniteCoordinate(state.x)
    || !isFiniteCoordinate(state.y)
    || !isSafeZoneId(state.zoneId)
    || typeof state.facing !== "string"
    || !FACINGS.has(state.facing as StudioVirtualSpaceFacing)
    || typeof state.activity !== "string"
    || !ACTIVITIES.has(state.activity as StudioVirtualSpaceActivity)
  ) {
    return null;
  }
  const point = { x: state.x, y: state.y };
  const appearance = state.appearance === undefined ? undefined : parseStudioVirtualSpaceAppearance(state.appearance);
  if (appearance === null) return null;
  // emote/bubble/userStatus는 optional 확장 필드: 모르는 값이어도 패킷은 유지하고
  // 필드만 무시한다. 구버전 패킷(필드 없음)은 그대로 파싱된다.
  const extras: StudioVirtualSpacePresenceExtras = {
    ...(state.emote !== undefined ? { emote: parseStudioPresenceEmote(state.emote) } : {}),
    ...(state.bubble !== undefined ? (() => {
      const bubble = sanitizeStudioPresenceBubble(state.bubble);
      return bubble ? { bubble } : {};
    })() : {}),
    ...(state.userStatus !== undefined ? (() => {
      const userStatus = parseStudioPresenceUserStatus(state.userStatus);
      return userStatus ? { userStatus } : {};
    })() : {}),
    ...(state.typing !== undefined ? (() => {
      const typing = parseStudioPresenceTyping(state.typing);
      return typing ? { typing } : {};
    })() : {}),
  };
  return {
    wire: STUDIO_VIRTUAL_SPACE_WIRE,
    ...scope,
    kind: "presence",
    sequence: Number(packet.sequence),
    at: Number(packet.at),
    state: runtimePresenceState(
      point,
      state.facing as StudioVirtualSpaceFacing,
      state.activity as StudioVirtualSpaceActivity,
      typeof state.moving === "boolean" ? state.moving : false,
      Number.isInteger(state.avatarIndex)
        && Number(state.avatarIndex) >= 0
        && Number(state.avatarIndex) < STUDIO_VIRTUAL_SPACE_AVATAR_COUNT
        ? Number(state.avatarIndex)
        : STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
      state.zoneId as StudioVirtualSpaceZoneId,
      appearance,
      extras,
    ),
  };
}

export function encodePacket(packet: StudioVirtualSpacePacket): string | null {
  const raw = JSON.stringify(packet);
  return packetBytes(raw) <= STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES ? raw : null;
}
