import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/**
 * 가상 스튜디오 공유 커서 프로토콜 (브리지).
 *
 * 기존 `studio-virtual-space-presence.ts`의 P2P 프레즌스 패킷 스키마는 그대로 두고,
 * 커서 좌표는 같은 와이어(`toonstudio-space-v1`) 위의 별도 `kind: "cursor"` 사이드채널
 * 패킷으로 주고받는다. 프레즌스 컨트롤러의 `receive`는 모르는 kind를 무시하므로
 * 기존 패킷 파서·시퀀스 로직을 손대지 않고도 공존한다.
 *
 * 순수 로직 모듈: 패킷 인코딩/파싱, 월드→스크린 좌표 변환, 스로틀링,
 * 커서 색상 배정, idle 숨김, lerp 보간 헬퍼를 제공한다.
 * 실제 송수신·렌더링은 호출 측(`StudioVirtualSpaceSharedCursors`)에서 담당한다.
 */

/** 커서 패킷이 함께 다니는 와이어 식별자 (프레즌스와 공유). */
export const STUDIO_SHARED_CURSOR_WIRE = "toonstudio-space-v1";
/** 커서 패킷 최대 크기 (프레즌스 패킷과 동일한 상한). */
export const STUDIO_SHARED_CURSOR_PACKET_MAX_BYTES = 1_024;
/** 커서 전송 최소 간격. 프레즌스 90ms 틱과 맞춘다. */
export const STUDIO_SHARED_CURSOR_SEND_INTERVAL_MS = 90;
/** 이 거리(px) 이상 움직여야 스로틀 창 안에서 재전송한다. */
export const STUDIO_SHARED_CURSOR_MIN_MOVE_PX = 2;
/** 마지막 움직임 후 이 시간이 지나면 커서를 숨긴다. */
export const STUDIO_SHARED_CURSOR_IDLE_HIDE_MS = 3_000;
/** 이 시간 동안 패킷이 없으면 피어 커서를 디렉터리에서 제거한다. */
export const STUDIO_SHARED_CURSOR_STALE_MS = 10_000;
/** 보간이 "도착했다"고 보는 임계 거리. */
export const STUDIO_SHARED_CURSOR_LERP_EPSILON_PX = 0.5;
/** 프레임당 보간 계수 (0~1). */
export const STUDIO_SHARED_CURSOR_LERP_ALPHA = 0.35;

export interface StudioSharedCursor {
  readonly x: number;
  readonly y: number;
  /** true면 피어가 커서를 화면 밖으로 빼거나 idle 상태다. */
  readonly hidden: boolean;
}

export interface StudioSharedCursorPacket {
  readonly wire: typeof STUDIO_SHARED_CURSOR_WIRE;
  readonly worldScope?: string;
  readonly kind: "cursor";
  readonly sequence: number;
  readonly at: number;
  readonly cursor: StudioSharedCursor;
}

export interface StudioSharedCursorCamera {
  /** 뷰포트 좌상단의 월드 좌표. */
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface StudioSharedCursorPeerState {
  readonly sessionId: string;
  readonly displayName: string;
  /** `#rrggbb` 형태의 커서 색상. */
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly hidden: boolean;
  readonly lastSeen: number;
  readonly sequence: number;
}

export type StudioSharedCursorDirectory = Readonly<Record<string, StudioSharedCursorPeerState>>;

const SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,127}$/iu;
const WORLD_SCOPE_PATTERN = /^[a-f0-9]{64}$/u;

/** 다크·라이트 모두에서 이름표가 잘 읽히는 커서 팔레트. */
export const STUDIO_SHARED_CURSOR_PALETTE = Object.freeze([
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
] as const);

function packetBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;
}

function isSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

function hashSessionId(sessionId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < sessionId.length; index += 1) {
    hash ^= sessionId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * 세션 id에서 결정적으로 커서 색상을 배정한다.
 * 같은 세션은 항상 같은 색을 얻어 피어 식별이 안정적이다.
 */
export function assignSharedCursorColor(sessionId: string): string {
  const palette = STUDIO_SHARED_CURSOR_PALETTE;
  if (!isSessionId(sessionId)) return palette[0];
  return palette[hashSessionId(sessionId) % palette.length];
}

/**
 * 월드 좌표를 스크린(뷰포트) 좌표로 변환한다.
 * 뷰포트 밖에 있으면 `visible: false`와 함께 클램프된 좌표를 반환한다.
 */
export function worldToScreenCursor(
  point: StudioVirtualSpacePoint,
  camera: StudioSharedCursorCamera,
): { readonly x: number; readonly y: number; readonly visible: boolean } {
  const zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  const x = (point.x - camera.x) * zoom;
  const y = (point.y - camera.y) * zoom;
  const visible = x >= 0 && y >= 0 && x <= camera.viewportWidth && y <= camera.viewportHeight;
  return Object.freeze({
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    visible,
  });
}

/**
 * 커서 패킷 전송 여부를 판단한다 (스로틀링).
 * - 숨김 상태가 바뀌었으면 즉시 전송
 * - 최소 간격이 지났거나, 최소 이동 거리를 넘었으면 전송
 */
export function shouldSendSharedCursor(input: {
  readonly lastSentAt: number;
  readonly now: number;
  readonly lastSent: StudioVirtualSpacePoint | null;
  readonly next: StudioVirtualSpacePoint;
  readonly hiddenChanged: boolean;
}): boolean {
  if (input.hiddenChanged) return true;
  if (input.now - input.lastSentAt < 0) return false;
  if (input.lastSent === null) return true;
  const moved = Math.hypot(input.next.x - input.lastSent.x, input.next.y - input.lastSent.y);
  if (moved >= STUDIO_SHARED_CURSOR_MIN_MOVE_PX) return true;
  return input.now - input.lastSentAt >= STUDIO_SHARED_CURSOR_SEND_INTERVAL_MS;
}

/** 마지막 커서 움직임 이후 idle 시간이 지나면 커서를 숨긴다. */
export function sharedCursorIdleHidden(lastActivityAt: number, now: number): boolean {
  if (!Number.isFinite(lastActivityAt) || !Number.isFinite(now)) return true;
  return now - lastActivityAt >= STUDIO_SHARED_CURSOR_IDLE_HIDE_MS;
}

/**
 * 커서 위치를 목표 지점으로 보간한다 (선형 보간).
 * reduced-motion 모드에서는 호출 측이 alpha 1(=즉시 스냅)을 사용한다.
 */
export function lerpSharedCursorPosition(
  current: StudioVirtualSpacePoint,
  target: StudioVirtualSpacePoint,
  alpha: number = STUDIO_SHARED_CURSOR_LERP_ALPHA,
): StudioVirtualSpacePoint {
  const safeAlpha = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
  if (safeAlpha >= 1) return Object.freeze({ x: target.x, y: target.y });
  if (safeAlpha <= 0) return Object.freeze({ x: current.x, y: current.y });
  const x = current.x + (target.x - current.x) * safeAlpha;
  const y = current.y + (target.y - current.y) * safeAlpha;
  if (Math.hypot(target.x - x, target.y - y) <= STUDIO_SHARED_CURSOR_LERP_EPSILON_PX) {
    return Object.freeze({ x: target.x, y: target.y });
  }
  return Object.freeze({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
}

export function parseStudioSharedCursorPacket(raw: string): StudioSharedCursorPacket | null {
  if (typeof raw !== "string" || raw.length === 0 || packetBytes(raw) > STUDIO_SHARED_CURSOR_PACKET_MAX_BYTES) {
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
    packet.wire !== STUDIO_SHARED_CURSOR_WIRE
    || packet.kind !== "cursor"
    || !Number.isSafeInteger(packet.sequence)
    || Number(packet.sequence) < 0
    || !Number.isFinite(packet.at)
  ) {
    return null;
  }
  if (
    packet.worldScope !== undefined
    && (typeof packet.worldScope !== "string" || !WORLD_SCOPE_PATTERN.test(packet.worldScope))
  ) {
    return null;
  }
  if (!packet.cursor || typeof packet.cursor !== "object" || Array.isArray(packet.cursor)) return null;
  const cursor = packet.cursor as Record<string, unknown>;
  if (!isFiniteCoordinate(cursor.x) || !isFiniteCoordinate(cursor.y) || typeof cursor.hidden !== "boolean") {
    return null;
  }
  return Object.freeze({
    wire: STUDIO_SHARED_CURSOR_WIRE,
    ...(typeof packet.worldScope === "string" ? { worldScope: packet.worldScope } : {}),
    kind: "cursor",
    sequence: Number(packet.sequence),
    at: Number(packet.at),
    cursor: Object.freeze({ x: cursor.x, y: cursor.y, hidden: cursor.hidden }),
  });
}

export function encodeStudioSharedCursorPacket(packet: StudioSharedCursorPacket): string | null {
  const raw = JSON.stringify(packet);
  return packetBytes(raw) <= STUDIO_SHARED_CURSOR_PACKET_MAX_BYTES ? raw : null;
}

/**
 * 수신한 커서 패킷을 디렉터리에 병합한다.
 * - worldScope가 다르면 무시
 * - 오래된(또는 같은) 시퀀스는 무시
 */
export function mergeSharedCursorPacket(
  directory: StudioSharedCursorDirectory,
  raw: string,
  senderSessionId: string,
  senderDisplayName: string,
  worldScope: string | undefined,
  now: number,
): StudioSharedCursorDirectory {
  if (!isSessionId(senderSessionId)) return directory;
  const packet = parseStudioSharedCursorPacket(raw);
  if (!packet || packet.worldScope !== worldScope) return directory;
  const previous = directory[senderSessionId];
  if (previous && packet.sequence <= previous.sequence) return directory;
  const displayName = senderDisplayName.trim().slice(0, 64) || senderSessionId;
  return Object.freeze({
    ...directory,
    [senderSessionId]: Object.freeze({
      sessionId: senderSessionId,
      displayName,
      color: previous?.color ?? assignSharedCursorColor(senderSessionId),
      x: packet.cursor.x,
      y: packet.cursor.y,
      hidden: packet.cursor.hidden,
      lastSeen: now,
      sequence: packet.sequence,
    }),
  });
}

/** 오래된 피어 커서를 디렉터리에서 제거한다. */
export function pruneSharedCursorDirectory(
  directory: StudioSharedCursorDirectory,
  now: number,
): StudioSharedCursorDirectory {
  let changed = false;
  const next: Record<string, StudioSharedCursorPeerState> = {};
  for (const [sessionId, peer] of Object.entries(directory)) {
    if (now - peer.lastSeen > STUDIO_SHARED_CURSOR_STALE_MS) {
      changed = true;
      continue;
    }
    next[sessionId] = peer;
  }
  return changed ? Object.freeze(next) : directory;
}

/** 렌더링용으로 정렬된 피어 커서 목록을 만든다 (숨김 포함, 호출 측에서 필터). */
export function listSharedCursorPeers(
  directory: StudioSharedCursorDirectory,
  selfSessionId: string | undefined,
): readonly StudioSharedCursorPeerState[] {
  return Object.freeze(
    Object.values(directory)
      .filter((peer) => peer.sessionId !== selfSessionId)
      .sort((left, right) =>
        left.displayName.localeCompare(right.displayName)
        || left.sessionId.localeCompare(right.sessionId),
      ),
  );
}
