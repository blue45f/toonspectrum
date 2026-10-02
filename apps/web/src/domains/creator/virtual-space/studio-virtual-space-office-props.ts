/**
 * 사무실 소품 생동감 (비주얼 웨이브 트랙 G)
 *
 * 모니터 화면 빛 · 벽시계 바늘 · 네온 깜빡임 · 화분 흔들림처럼 저비용으로
 * 공간을 살아 있게 만드는 소품 애니메이션의 순수 계산 모듈.
 *
 * - 모든 값은 시각(nowMs)과 시드의 결정적 함수다. 타이머·난수·렌더러 의존 없음.
 * - `reducedMotion`이면 움직임/깜빡임을 멈추고 정적 값을 돌려준다.
 * - 전면 오버레이·틴트는 만들지 않는다. 오브젝트 국소 효과 전용이다.
 *
 * 실제 적용은 호출 측(캠퍼스 런타임·빌드 모드)이 프레임 값을 스프라이트에 매핑한다.
 */

/** 사무실 소품 애니메이션 종류. */
export type StudioOfficePropKind = "monitor-glow" | "wall-clock" | "neon-flicker" | "plant-sway";

export const STUDIO_OFFICE_PROP_KINDS: readonly StudioOfficePropKind[] = Object.freeze([
  "monitor-glow", "wall-clock", "neon-flicker", "plant-sway",
]);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const TAU = Math.PI * 2;

function hash01(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

function safeNow(nowMs: number): number {
  return Number.isFinite(nowMs) && nowMs > 0 ? nowMs : 0;
}

export interface StudioOfficeClockHands {
  /** 12시 방향이 0, 시계 방향이 양수인 라디안. */
  readonly hourAngle: number;
  readonly minuteAngle: number;
  readonly secondAngle: number;
  /** 초 바늘이 가리키는 정수 초 (0~59). 다시 그릴지 판단할 때 쓴다. */
  readonly second: number;
}

/**
 * 벽시계 바늘 각도. nowMs를 하루 경과 시간으로 해석한다.
 * 현지 시각을 보여 주려면 호출 측이 타임존 오프셋을 보정한 값을 넘긴다.
 * 초침은 부드럽게 흐르고 시·분침은 하위 단위를 반영해 천천히 이동한다.
 */
export function officeClockHands(nowMs: number): StudioOfficeClockHands {
  const now = safeNow(nowMs);
  const totalSeconds = now / 1000;
  const seconds = totalSeconds % 60;
  const minutes = (totalSeconds / 60) % 60;
  const hours = (totalSeconds / 3600) % 12;
  return Object.freeze({
    hourAngle: (hours / 12) * TAU,
    minuteAngle: (minutes / 60) * TAU,
    secondAngle: (seconds / 60) * TAU,
    second: Math.floor(seconds),
  });
}

/** 초 단위 버킷. 시계 바늘을 매 프레임 다시 그리지 않기 위한 비교 키. */
export function officeClockSecondBucket(nowMs: number): number {
  return Math.floor(safeNow(nowMs) / 1000);
}

/**
 * 모니터 화면 빛 강도 0~1.
 * 은은한 호흡 + 드문 미세 깜빡임. reducedMotion이면 고정 밝기.
 */
export function officeMonitorGlow(nowMs: number, seed: string, reducedMotion: boolean): number {
  if (reducedMotion) return 0.85;
  const now = safeNow(nowMs);
  const phase = hash01(seed) * TAU;
  const breath = 0.78 + 0.13 * Math.sin(now / 900 + phase);
  const bucket = Math.floor(now / 160);
  const flicker = hash01(`${seed}:monitor:${bucket}`) < 0.08 ? -0.1 : 0;
  return clamp01(breath + flicker);
}

/**
 * 네온 사인 빛 강도 0~1.
 * 대부분 켜져 있고 가끔 짧게 떨어지는 네온 특유의 깜빡임. reducedMotion이면 항상 켜짐.
 */
export function officeNeonFlicker(nowMs: number, seed: string, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const now = safeNow(nowMs);
  const bucket = Math.floor(now / 90);
  const roll = hash01(`${seed}:neon:${bucket}`);
  if (roll < 0.05) return 0.3 + roll * 6;
  return clamp01(0.93 + 0.07 * Math.sin(now / 300 + hash01(seed) * TAU));
}

export interface StudioOfficePlantSway {
  /** 잎 흔들림 회전 (라디안, ±0.05 이내). */
  readonly rotation: number;
  /** 수평 오프셋 (px, ±2 이내). */
  readonly offsetX: number;
}

/** 화분 잎 흔들림. 느린 바람 + 짧은 떨림의 합성. reducedMotion이면 정지. */
export function officePlantSway(nowMs: number, seed: string, reducedMotion: boolean): StudioOfficePlantSway {
  if (reducedMotion) return Object.freeze({ rotation: 0, offsetX: 0 });
  const now = safeNow(nowMs);
  const phase = hash01(seed) * TAU;
  const sway = Math.sin(now / 1400 + phase);
  const tremble = Math.sin(now / 517 + phase * 2);
  return Object.freeze({
    rotation: 0.032 * sway + 0.012 * tremble,
    offsetX: 1.6 * sway,
  });
}

export interface StudioOfficePropFrame {
  readonly kind: StudioOfficePropKind;
  /** 빛 강도 0~1 — monitor-glow · neon-flicker. */
  readonly intensity: number;
  /** 흔들림 회전 (라디안) — plant-sway. */
  readonly rotation: number;
  /** 흔들림 오프셋 (px) — plant-sway. */
  readonly offsetX: number;
  /** 시계 바늘 — wall-clock 전용, 그 외 종류는 null. */
  readonly clock: StudioOfficeClockHands | null;
}

/** 소품 종류별 통합 프레임 계산. */
export function officePropFrame(
  kind: StudioOfficePropKind,
  nowMs: number,
  seed: string,
  reducedMotion: boolean,
): StudioOfficePropFrame {
  switch (kind) {
    case "monitor-glow":
      return Object.freeze({ kind, intensity: officeMonitorGlow(nowMs, seed, reducedMotion), rotation: 0, offsetX: 0, clock: null });
    case "neon-flicker":
      return Object.freeze({ kind, intensity: officeNeonFlicker(nowMs, seed, reducedMotion), rotation: 0, offsetX: 0, clock: null });
    case "plant-sway": {
      const sway = officePlantSway(nowMs, seed, reducedMotion);
      return Object.freeze({ kind, intensity: 0, rotation: sway.rotation, offsetX: sway.offsetX, clock: null });
    }
    case "wall-clock": {
      // reducedMotion이면 초침을 1초 단위로 끊어 움직인다 (부드러운 흐름 대신 틱).
      const clockNow = reducedMotion ? Math.floor(safeNow(nowMs) / 1000) * 1000 : nowMs;
      return Object.freeze({ kind, intensity: 0, rotation: 0, offsetX: 0, clock: officeClockHands(clockNow) });
    }
  }
}

/**
 * 캠퍼스 오브젝트 kind → 소품 애니메이션 kind 매핑.
 * 해당 없으면 null (정적 오브젝트).
 */
export function officePropKindForCampusObject(objectKind: string): StudioOfficePropKind | null {
  switch (objectKind) {
    case "desk-monitor": return "monitor-glow";
    case "wall-clock": return "wall-clock";
    case "neon-sign": return "neon-flicker";
    default: return null;
  }
}

/** 가구 카탈로그 kind → 소품 애니메이션 kind 매핑 (빌드 모드·구 월드용). */
export function officePropKindForFurniture(furnitureKind: string): StudioOfficePropKind | null {
  switch (furnitureKind) {
    case "desk-monitor": return "monitor-glow";
    case "wall-clock": return "wall-clock";
    case "neon-sign": return "neon-flicker";
    case "plant": return "plant-sway";
    default: return null;
  }
}
