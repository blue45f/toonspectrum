import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/**
 * 마지막 위치 영속 기록 (W-2 공간 연결성).
 *
 * 세션 단위 위치 복원(`studio-virtual-space-session-position`)은 탭 세션이 끝나면 사라진다.
 * 로그인 사용자는 마지막으로 있던 장소·좌표를 localStorage에도 남겨, 다음 방문에서
 * 같은 장소면 조용히 복원하고 다른 장소면 입장 로비에서 "이어서 시작/처음부터"를 고르게 한다.
 * 게스트는 이 기록을 쓰지 않는다(세션 복원만).
 */

const LAST_POSITION_STORAGE_PREFIX = "toonspectrum:virtual-space-last-position:v1";

export interface StudioVirtualSpaceLastPositionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StudioVirtualSpaceLastPosition {
  /** URL 장소 id(캠퍼스 구역 id 또는 하위 장소 id). */
  readonly placeId: string;
  readonly point: StudioVirtualSpacePoint;
  readonly savedAt: number;
}

export function studioVirtualSpaceLastPositionStorageKey(projectId: string): string {
  return `${LAST_POSITION_STORAGE_PREFIX}:${projectId.length}:${projectId}`;
}

function browserLocalStorage(): StudioVirtualSpaceLastPositionStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function validRecord(value: unknown): StudioVirtualSpaceLastPosition | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as { placeId?: unknown; point?: unknown; savedAt?: unknown };
  if (typeof parsed.placeId !== "string" || parsed.placeId.length === 0) return null;
  const point = parsed.point as { x?: unknown; y?: unknown } | null;
  if (!point || typeof point !== "object") return null;
  if (typeof point.x !== "number" || typeof point.y !== "number"
    || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return {
    placeId: parsed.placeId,
    point: { x: point.x, y: point.y },
    savedAt: typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0,
  };
}

export function readStudioVirtualSpaceLastPosition(
  projectId: string,
  storage: StudioVirtualSpaceLastPositionStorage | null = browserLocalStorage(),
): StudioVirtualSpaceLastPosition | null {
  if (!storage || !projectId) return null;
  try {
    const raw = storage.getItem(studioVirtualSpaceLastPositionStorageKey(projectId));
    if (!raw) return null;
    return validRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeStudioVirtualSpaceLastPosition(
  projectId: string,
  value: { readonly placeId: string; readonly point: StudioVirtualSpacePoint },
  storage: StudioVirtualSpaceLastPositionStorage | null = browserLocalStorage(),
  now: number = Date.now(),
): boolean {
  if (!storage || !projectId || !value.placeId) return false;
  if (!Number.isFinite(value.point.x) || !Number.isFinite(value.point.y)) return false;
  try {
    storage.setItem(studioVirtualSpaceLastPositionStorageKey(projectId), JSON.stringify({
      version: 1,
      placeId: value.placeId,
      point: { x: Math.round(value.point.x), y: Math.round(value.point.y) },
      savedAt: Number.isFinite(now) ? now : 0,
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearStudioVirtualSpaceLastPosition(
  projectId: string,
  storage: StudioVirtualSpaceLastPositionStorage | null = browserLocalStorage(),
): void {
  if (!storage || !projectId) return;
  try {
    storage.removeItem(studioVirtualSpaceLastPositionStorageKey(projectId));
  } catch {
    // 저장소를 지울 수 없어도 입장 자체는 막지 않는다.
  }
}

/**
 * 복원 방식 판정.
 * - "none": 기록이 없다.
 * - "silent": 지금 열려는 장소와 같은 장소의 기록 — 묻지 않고 세션 위치로 이어 심는다.
 * - "ask": 다른 장소의 기록 — 입장 로비에서 이어서 시작할지 처음부터 시작할지 고른다.
 */
export type StudioVirtualSpaceResumeDecision = "none" | "silent" | "ask";

export function studioVirtualSpaceResumeDecision(
  record: StudioVirtualSpaceLastPosition | null,
  currentPlaceId: string,
): StudioVirtualSpaceResumeDecision {
  if (!record) return "none";
  return record.placeId === currentPlaceId ? "silent" : "ask";
}
