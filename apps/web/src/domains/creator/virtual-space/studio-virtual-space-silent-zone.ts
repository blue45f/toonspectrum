/**
 * 조용한 구역 Silent Zone (E-2).
 *
 * 지정 영역 안에서는 로컬 마이크가 자동으로 음소되고, 구역을 벗어나면
 * 진입 전의 마이크 상태로 복원된다. 집중 작업실·녹음부스 용도.
 *
 * D-1 타일 이펙트의 `zone` kind와 개념을 공유한다: 타일 에디터에서 구역 태그를
 * `silent`로 지정하면 이 모듈의 Silent Zone으로 취급한다(D-1 파일은 수정하지
 * 않으며, 매핑은 이 주석과 `STUDIO_SILENT_ZONE_TILE_TAG` 상수로 문서화).
 *
 * 이 모듈은 "로컬 상태 + UI" 범위만 다룬다. 실제 마이크 장치 제어는
 * `mutedByZone` 값을 읽은 호출자(부모 컴포넌트)가 수행한다.
 */

/** D-1 타일 이펙트 zone 태그 중 조용한 구역에 대응하는 값. */
export const STUDIO_SILENT_ZONE_TILE_TAG = "silent";

export interface StudioSilentZoneRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioSilentZone {
  readonly id: string;
  readonly name: string;
  readonly rect: StudioSilentZoneRect;
}

const cleanId = (value: string): string | null => {
  const text = value.trim();
  return /^[a-z0-9][a-z0-9:_-]{0,127}$/iu.test(text) ? text : null;
};

function cleanRect(rect: StudioSilentZoneRect): StudioSilentZoneRect | null {
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every((value) => Number.isFinite(value))) return null;
  if (width <= 0 || height <= 0) return null;
  if (x < 0 || y < 0 || x > 100_000 || y > 100_000) return null;
  return { x, y, width, height };
}

/** 조용한 구역 생성. id·이름·rect를 살균하고, 무효 입력이면 null. */
export function createSilentZone(input: {
  readonly id: string;
  readonly name: string;
  readonly rect: StudioSilentZoneRect;
}): StudioSilentZone | null {
  const id = cleanId(input.id);
  const rect = cleanRect(input.rect);
  const name = input.name.trim().slice(0, 40);
  if (!id || !rect || !name) return null;
  return Object.freeze({ id, name, rect: Object.freeze(rect) });
}

/** 점이 구역 안에 있는지 판정 (경계 포함). */
export function studioSilentZoneContains(zone: StudioSilentZone, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const { rect } = zone;
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/** 현재 위치가 속한 조용한 구역을 찾는다. 여러 개가 겹치면 첫 번째를 반환. */
export function findSilentZone(
  zones: readonly StudioSilentZone[],
  x: number,
  y: number,
): StudioSilentZone | null {
  return zones.find((zone) => studioSilentZoneContains(zone, x, y)) ?? null;
}

export type StudioSilentZoneTransition = "enter" | "exit" | "switch" | "stay-inside" | "stay-outside";

/**
 * 구역 전이 판정. 이전에 속한 구역 id와 지금 속한 구역 id를 비교한다.
 * - enter: 밖 → 안, exit: 안 → 밖, switch: 구역 A → 구역 B
 * - stay-inside / stay-outside: 변화 없음
 */
export function resolveSilentZoneTransition(
  previousZoneId: string | null,
  currentZoneId: string | null,
): StudioSilentZoneTransition {
  if (previousZoneId === currentZoneId) {
    return currentZoneId === null ? "stay-outside" : "stay-inside";
  }
  if (previousZoneId === null) return "enter";
  if (currentZoneId === null) return "exit";
  return "switch";
}

export interface StudioSilentMuteState {
  /** 조용한 구역 때문에 음소된 상태인지. */
  readonly mutedByZone: boolean;
  /** 구역 진입 직전의 마이크 음소 상태 (퇴장 시 복원용). */
  readonly rememberedMuted: boolean;
  /** 현재 속한 구역 id. */
  readonly zoneId: string | null;
}

export const INITIAL_STUDIO_SILENT_MUTE_STATE: StudioSilentMuteState = Object.freeze({
  mutedByZone: false,
  rememberedMuted: false,
  zoneId: null,
});

/**
 * 순수 리듀서: 전이에 따라 음소 상태를 갱신한다.
 * - enter: 진입 전 마이크 상태를 기억하고 음소 적용.
 * - exit: 기억했던 상태로 복원.
 * - switch: 음소 유지, 구역 id만 교체.
 * - stay-*: 변화 없음.
 *
 * `micMutedNow`는 리듀서 바깥(호출자)이 알고 있는 현재 마이크 음소 상태다.
 */
export function reduceSilentMuteState(
  state: StudioSilentMuteState,
  transition: StudioSilentZoneTransition,
  zoneId: string | null,
  micMutedNow: boolean,
): StudioSilentMuteState {
  switch (transition) {
    case "enter":
      return Object.freeze({ mutedByZone: true, rememberedMuted: micMutedNow, zoneId });
    case "exit":
      return Object.freeze({ mutedByZone: false, rememberedMuted: state.rememberedMuted, zoneId: null });
    case "switch":
      return Object.freeze({ ...state, zoneId });
    default:
      return state;
  }
}

/** 실제로 마이크에 적용할 음소 값: 구역 음소가 켜져 있으면 true, 아니면 호출자의 원래 값. */
export function resolveSilentMicMuted(state: StudioSilentMuteState, micMutedByUser: boolean): boolean {
  if (state.mutedByZone) return true;
  return micMutedByUser;
}
