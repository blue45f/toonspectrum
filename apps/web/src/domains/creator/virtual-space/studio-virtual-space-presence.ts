import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import { parseStudioVirtualSpaceAppearance, type StudioVirtualSpaceAppearance } from "./studio-virtual-space-appearance";
import type { StudioEmoteKind } from "./studio-virtual-space-emotes";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import {
  isStudioSpaceEmoteId,
  studioSpaceEmoteDurationMs,
  type StudioSpaceEmoteId,
} from "./studio-virtual-space-emote-catalog";
import {
  STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  STUDIO_VIRTUAL_SPACE_AVATAR_COUNT,
  STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS,
  STUDIO_VIRTUAL_SPACE_NEARBY_RADIUS,
  selectNearbyStudioVirtualPeers,
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

export type StudioVirtualSpacePacket =
  | StudioVirtualSpacePresencePacket
  | StudioVirtualSpaceLeavePacket
  | StudioVirtualSpaceReactionPacket;

export interface StudioVirtualSpaceSnapshot {
  readonly self: StudioVirtualSpacePresenceState;
  readonly peers: readonly StudioVirtualSpacePeer[];
  readonly nearbyPeers: readonly StudioVirtualSpacePeer[];
  readonly selfReaction: StudioVirtualSpaceReaction | null;
  readonly peerReactions: readonly StudioVirtualSpaceReactionSnapshot[];
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

const outboundSequenceBySessionId = new Map<string, number>();
const OUTBOUND_SEQUENCE_STORAGE_PREFIX = "toonspectrum:virtual-space-sequence:v1";

function outboundSequenceStorageKey(sessionId: string): string {
  return `${OUTBOUND_SEQUENCE_STORAGE_PREFIX}:${sessionId.length}:${sessionId}`;
}

function outboundSequenceStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function readStoredOutboundSequence(sessionId: string): number {
  try {
    const value = Number(outboundSequenceStorage()?.getItem(outboundSequenceStorageKey(sessionId)));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeStoredOutboundSequence(sessionId: string, sequence: number): void {
  try {
    outboundSequenceStorage()?.setItem(outboundSequenceStorageKey(sessionId), String(sequence));
  } catch {
    // Direct presence remains available when browser storage is privacy-restricted.
  }
}

function nextOutboundSequence(sessionId: string): number {
  const timeFloor = Date.now() * 1_000;
  const sequence = Math.max(
    outboundSequenceBySessionId.get(sessionId) ?? 0,
    readStoredOutboundSequence(sessionId),
    timeFloor,
  ) + 1;
  if (!Number.isSafeInteger(sequence)) {
    throw new Error("Virtual Studio presence sequence exhausted the safe integer range");
  }
  outboundSequenceBySessionId.set(sessionId, sequence);
  writeStoredOutboundSequence(sessionId, sequence);
  return sequence;
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
const USER_STATUSES = new Set<string>(["available", "in-meeting", "away", "break"]);
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

function runtimePresenceState(
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
    || (packet.kind !== "presence" && packet.kind !== "leave" && packet.kind !== "reaction")
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

function encodePacket(packet: StudioVirtualSpacePacket): string | null {
  const raw = JSON.stringify(packet);
  return packetBytes(raw) <= STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES ? raw : null;
}

/**
 * Ephemeral spatial presence over the already-authorized RTC direct port.
 *
 * Nothing here is persisted or relayed through the application server. The server only remains
 * responsible for room admission/peer discovery; movement packets go browser-to-browser and are
 * discarded when the session ends.
 */
export class StudioVirtualSpacePresenceController {
  private self: StudioVirtualSpacePresenceState;
  private readonly peers = new Map<string, StudioVirtualSpacePeer>();
  private readonly peerReactions = new Map<string, StudioVirtualSpaceReactionSnapshot>();
  private readonly reactionSequences = new Map<string, number>();
  private selfReaction: StudioVirtualSpaceReactionSnapshot | null = null;
  private lastReactionSentAt = Number.NEGATIVE_INFINITY;
  private bubbleExpiresAt = 0;
  private readonly listeners = new Set<() => void>();
  private dirty = true;
  private lastSentAt = 0;
  private closed = false;
  private unsubscribe: (() => void) | null = null;
  private timer: unknown | null = null;

  constructor(
    private readonly participant: StudioLiveParticipant,
    private readonly port: StudioLiveDirectPort,
    initialPoint: StudioVirtualSpacePoint | StudioVirtualSpacePresenceState,
    private readonly dependencies: StudioVirtualSpacePresenceDependencies = {},
  ) {
    const initialState = "facing" in initialPoint
      ? runtimePresenceState(
        initialPoint, initialPoint.facing, initialPoint.activity, initialPoint.moving,
        initialPoint.avatarIndex, initialPoint.zoneId, undefined,
        { emote: initialPoint.emote, bubble: initialPoint.bubble, userStatus: initialPoint.userStatus },
      )
      : runtimePresenceState(initialPoint);
    const appearance = parseStudioVirtualSpaceAppearance(
      dependencies.appearanceForAvatarIndex?.(initialState.avatarIndex, participant.sessionId)
        ?? ("appearance" in initialPoint ? initialPoint.appearance : undefined),
    );
    this.self = Object.freeze({ ...initialState, ...(appearance ? { appearance } : {}) });
  }

  private now(): number {
    return this.dependencies.now?.() ?? Date.now();
  }

  private nextSequence(): number {
    return nextOutboundSequence(this.participant.sessionId);
  }

  private scheduleInterval(handler: () => void, delayMs: number): unknown {
    return this.dependencies.setInterval?.(handler, delayMs)
      ?? globalThis.setInterval(handler, delayMs);
  }

  private cancelInterval(handle: unknown): void {
    if (this.dependencies.clearInterval) {
      this.dependencies.clearInterval(handle);
      return;
    }
    globalThis.clearInterval(handle as ReturnType<typeof setInterval>);
  }

  snapshot(): StudioVirtualSpaceSnapshot {
    const peers = [...this.peers.values()]
      .sort((left, right) =>
        left.participant.displayName.localeCompare(right.participant.displayName)
        || left.participant.sessionId.localeCompare(right.participant.sessionId)
      )
      .slice(0, STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS - 1)
      .map((peer) => Object.freeze({ ...peer, state: Object.freeze({ ...peer.state }) }));
    const now = this.now();
    const peerReactions = [...this.peerReactions.values()]
      .filter((reaction) => reaction.expiresAt > now)
      .sort((left, right) => left.sessionId.localeCompare(right.sessionId))
      .map((reaction) => Object.freeze({ ...reaction }));
    return Object.freeze({
      self: Object.freeze({ ...this.self }),
      peers: Object.freeze(peers),
      nearbyPeers: Object.freeze(
        [...selectNearbyStudioVirtualPeers(this.self, peers, STUDIO_VIRTUAL_SPACE_NEARBY_RADIUS)],
      ),
      selfReaction: this.selfReaction && this.selfReaction.expiresAt > now
        ? this.selfReaction.reaction
        : null,
      peerReactions: Object.freeze(peerReactions),
      direct: true,
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.closed || this.unsubscribe) return;
    this.unsubscribe = this.port.subscribe((sender, raw) => this.receive(sender, raw));
    this.broadcast(true);
    this.timer = this.scheduleInterval(() => this.tick(), STUDIO_VIRTUAL_SPACE_PRESENCE_INTERVAL_MS);
    this.emit();
  }

  update(
    point: StudioVirtualSpacePoint,
    facing: StudioVirtualSpaceFacing = this.self.facing,
    activity: StudioVirtualSpaceActivity = this.self.activity,
    moving: boolean = this.self.moving,
    avatarIndex: number = this.self.avatarIndex,
    zoneId?: StudioVirtualSpaceZoneId,
  ): void {
    if (this.closed) return;
    const nextState = runtimePresenceState(point, facing, activity, moving, avatarIndex, zoneId, undefined, {
      emote: this.self.emote,
      bubble: this.self.bubble,
      userStatus: this.self.userStatus,
    });
    const appearance = nextState.avatarIndex === this.self.avatarIndex
      ? this.self.appearance
      : parseStudioVirtualSpaceAppearance(this.dependencies.appearanceForAvatarIndex?.(nextState.avatarIndex, this.participant.sessionId)) ?? undefined;
    const next = Object.freeze({ ...nextState, ...(appearance ? { appearance } : {}) });
    if (
      next.x === this.self.x
      && next.y === this.self.y
      && next.zoneId === this.self.zoneId
      && next.facing === this.self.facing
      && next.activity === this.self.activity
      && next.moving === this.self.moving
      && next.avatarIndex === this.self.avatarIndex
      && next.emote === this.self.emote
      && next.bubble === this.self.bubble
      && next.userStatus === this.self.userStatus
    ) {
      return;
    }
    this.self = next;
    this.dirty = true;
    this.emit();
  }

  setActivity(activity: StudioVirtualSpaceActivity): void {
    this.update(this.self, this.self.facing, activity, this.self.moving, this.self.avatarIndex, this.self.zoneId);
  }

  setMoving(moving: boolean): void {
    this.update(this.self, this.self.facing, this.self.activity, moving, this.self.avatarIndex, this.self.zoneId);
  }

  setAvatarIndex(avatarIndex: number): void {
    this.update(this.self, this.self.facing, this.self.activity, this.self.moving, avatarIndex, this.self.zoneId);
  }

  setAppearance(appearance: StudioVirtualSpaceAppearance): void {
    if (this.closed) return;
    const parsed = parseStudioVirtualSpaceAppearance(appearance);
    if (!parsed || JSON.stringify(parsed) === JSON.stringify(this.self.appearance)) return;
    this.self = Object.freeze({ ...this.self, appearance: parsed });
    this.dirty = true;
    this.emit();
  }

  /**
   * 실행 중인 이모트를 피어에게 브로드캐스트한다.
   * B 트랙(Phaser 캔버스)이 `snapshot().peers[].state.emote`를 읽어 렌더한다.
   * null이면 이모트를 종료한다.
   */
  setEmote(emote: StudioEmoteKind | null): void {
    if (this.closed) return;
    const parsed = emote === null ? undefined : parseStudioPresenceEmote(emote);
    if (parsed === this.self.emote) return;
    const next = { ...this.self };
    if (parsed) next.emote = parsed;
    else delete next.emote;
    this.self = Object.freeze(next);
    this.dirty = true;
    this.emit();
  }

  /**
   * 아바타 위 말풍선 텍스트를 피어에게 브로드캐스트한다.
   * TTL이 지나면 송신 측이 직접 지워 다시 브로드캐스트한다.
   */
  setBubbleText(text: string): void {
    if (this.closed) return;
    const bubble = sanitizeStudioPresenceBubble(text);
    if (bubble === undefined) {
      this.clearBubble();
      return;
    }
    if (bubble === this.self.bubble) return;
    this.self = Object.freeze({ ...this.self, bubble });
    this.bubbleExpiresAt = this.now() + STUDIO_PRESENCE_BUBBLE_TTL_MS;
    this.dirty = true;
    this.emit();
  }

  clearBubble(): void {
    if (this.closed || this.self.bubble === undefined) return;
    const next = { ...this.self };
    delete next.bubble;
    this.self = Object.freeze(next);
    this.bubbleExpiresAt = 0;
    this.dirty = true;
    this.emit();
  }

  /**
   * 사용자 상태(회의 중/자리 비움/휴식 중)를 피어에게 브로드캐스트한다.
   * presence `activity`와 별도의 optional 필드로 실린다. null이면 필드를 지워 활동 표시로 돌아간다.
   */
  setUserStatus(status: StudioUserStatus | null): void {
    if (this.closed) return;
    if (status === null) {
      if (this.self.userStatus === undefined) return;
      this.self = Object.freeze({ ...this.self, userStatus: undefined });
      this.dirty = true;
      this.emit();
      return;
    }
    const parsed = parseStudioPresenceUserStatus(status);
    if (!parsed || parsed === this.self.userStatus) return;
    this.self = Object.freeze({ ...this.self, userStatus: parsed });
    this.dirty = true;
    this.emit();
  }

  sendReaction(reaction: StudioVirtualSpaceReaction): void {
    if (this.closed || !isStudioSpaceEmoteId(reaction)) return;
    const now = this.now();
    if (now - this.lastReactionSentAt < STUDIO_VIRTUAL_SPACE_REACTION_THROTTLE_MS) return;
    this.lastReactionSentAt = now;
    this.selfReaction = Object.freeze({
      sessionId: this.participant.sessionId,
      reaction,
      expiresAt: now + studioSpaceEmoteDurationMs(reaction),
    });
    const packet = encodePacket({
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...(this.dependencies.worldScope ? { worldScope: this.dependencies.worldScope } : {}),
      kind: "reaction",
      sequence: this.nextSequence(),
      at: now,
      reaction,
    });
    if (packet) {
      for (const peer of this.port.getPeers().slice(0, STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS - 1)) {
        if (peer.sessionId !== this.participant.sessionId) {
          this.port.send(peer.sessionId, packet);
        }
      }
    }
    this.emit();
  }

  refresh(): void {
    if (this.closed) return;
    this.prune();
    this.broadcast(true);
    this.emit();
  }

  private tick(): void {
    if (this.closed) return;
    const changed = this.prune();
    const reactionsChanged = this.pruneReactions();
    const bubbleExpired = this.expireBubble();
    const dueHeartbeat = this.now() - this.lastSentAt >= STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS;
    if (this.dirty || dueHeartbeat) this.broadcast(dueHeartbeat);
    if (changed || reactionsChanged || bubbleExpired) this.emit();
  }

  private availablePeerIds(): Set<string> {
    return new Set(
      this.port.getPeers()
        .filter((peer) => peer.sessionId !== this.participant.sessionId)
        .slice(0, STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS - 1)
        .map((peer) => peer.sessionId),
    );
  }

  private prune(): boolean {
    const now = this.now();
    const available = this.availablePeerIds();
    let changed = false;
    for (const [sessionId, peer] of this.peers) {
      if (!available.has(sessionId) || now - peer.lastSeen > STUDIO_VIRTUAL_SPACE_STALE_MS) {
        this.peers.delete(sessionId);
        this.peerReactions.delete(sessionId);
        this.reactionSequences.delete(sessionId);
        changed = true;
      }
    }
    return changed;
  }

  private pruneReactions(): boolean {
    const now = this.now();
    let changed = false;
    if (this.selfReaction && this.selfReaction.expiresAt <= now) {
      this.selfReaction = null;
      changed = true;
    }
    for (const [sessionId, reaction] of this.peerReactions) {
      if (reaction.expiresAt <= now) {
        this.peerReactions.delete(sessionId);
        changed = true;
      }
    }
    return changed;
  }

  /** 말풍선 TTL이 지나면 송신 측에서 직접 지우고 브로드캐스트한다. */
  private expireBubble(): boolean {
    if (this.self.bubble === undefined || this.bubbleExpiresAt <= 0) return false;
    if (this.now() < this.bubbleExpiresAt) return false;
    const next = { ...this.self };
    delete next.bubble;
    this.self = Object.freeze(next);
    this.bubbleExpiresAt = 0;
    this.dirty = true;
    return true;
  }

  private broadcast(force = false): void {
    if (this.closed || (!this.dirty && !force)) return;
    const now = this.now();
    const packet = encodePacket({
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...(this.dependencies.worldScope ? { worldScope: this.dependencies.worldScope } : {}),
      kind: "presence",
      sequence: this.nextSequence(),
      at: now,
      state: this.self,
    });
    if (!packet) return;
    for (const peer of this.port.getPeers().slice(0, STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS - 1)) {
      if (peer.sessionId !== this.participant.sessionId) {
        this.port.send(peer.sessionId, packet);
      }
    }
    this.lastSentAt = now;
    this.dirty = false;
  }

  private receive(sender: StudioLiveParticipant, raw: string): void {
    if (this.closed || sender.sessionId === this.participant.sessionId) return;
    if (!this.availablePeerIds().has(sender.sessionId)) return;
    const packet = parseStudioVirtualSpacePacket(raw);
    if (!packet || packet.worldScope !== this.dependencies.worldScope) return;

    if (packet.kind === "reaction") {
      const previousReactionSequence = this.reactionSequences.get(sender.sessionId) ?? -1;
      if (packet.sequence <= previousReactionSequence) return;
      this.reactionSequences.set(sender.sessionId, packet.sequence);
      this.peerReactions.set(sender.sessionId, Object.freeze({
        sessionId: sender.sessionId,
        reaction: packet.reaction,
        expiresAt: this.now() + studioSpaceEmoteDurationMs(packet.reaction),
      }));
      this.emit();
      return;
    }

    const previous = this.peers.get(sender.sessionId);
    if (previous && packet.sequence <= previous.sequence) return;
    if (packet.kind === "leave") {
      if (previous || this.peerReactions.has(sender.sessionId)) {
        this.peers.delete(sender.sessionId);
        this.peerReactions.delete(sender.sessionId);
        this.reactionSequences.delete(sender.sessionId);
        this.emit();
      }
      return;
    }
    this.peers.set(sender.sessionId, {
      participant: sender,
      state: packet.state,
      lastSeen: this.now(),
      sequence: packet.sequence,
    });
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  close(): void {
    if (this.closed) return;
    const packet = encodePacket({
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...(this.dependencies.worldScope ? { worldScope: this.dependencies.worldScope } : {}),
      kind: "leave",
      sequence: this.nextSequence(),
      at: this.now(),
    });
    if (packet) {
      for (const peer of this.port.getPeers().slice(0, STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS - 1)) {
        if (peer.sessionId !== this.participant.sessionId) {
          this.port.send(peer.sessionId, packet);
        }
      }
    }
    this.closed = true;
    if (this.timer !== null) this.cancelInterval(this.timer);
    this.timer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.peers.clear();
    this.peerReactions.clear();
    this.reactionSequences.clear();
    this.selfReaction = null;
    this.bubbleExpiresAt = 0;
    this.listeners.clear();
  }
}
