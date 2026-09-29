import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioWeatherCondition } from "./studio-virtual-space-weather";

/**
 * 스튜디오 조명 시스템
 *
 * - 시간대(새벽→심야)에 따른 실내 기본 조명 변화
 * - 실시간 날씨와 연동 (흐림·비에 실내가 어두워지면 조명 자동 강조)
 * - 배치 가능한 조명 오브젝트 (플로어 램프·스탠드·스포트라이트·스트링 라이트·네온사인)
 * - 조명 켜기/끄기·밝기 조절 (디머)
 *
 * 순수 로직 모듈. 실제 캔버스 렌더링은 호출 측에서 담당한다.
 */

/** 하루 시간대. */
export type StudioDayPhase =
  | "dawn"      // 새벽 (5-7시)
  | "morning"   // 아침 (7-11시)
  | "noon"      // 정오 (11-15시)
  | "afternoon" // 오후 (15-18시)
  | "sunset"    // 해질녘 (18-20시)
  | "night"     // 밤 (20-24시)
  | "midnight"; // 심야 (0-5시)

/** 조명 기구 종류. */
export type StudioLightFixtureKind =
  | "floor-lamp"    // 플로어 스탠드
  | "desk-lamp"     // 책상 스탠드
  | "ceiling-light" // 천장등
  | "spotlight"     // 스포트라이트
  | "string-lights" // 스트링 라이트 (전구 줄)
  | "neon-sign";    // 네온사인

export interface StudioLightFixtureKindMeta {
  readonly kind: StudioLightFixtureKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly icon: string;
  /** 기본 비춤 반경(px). */
  readonly defaultRadius: number;
  /** 따뜻한 색 기본 여부. */
  readonly warmByDefault: boolean;
}

function kindMeta(meta: StudioLightFixtureKindMeta): StudioLightFixtureKindMeta {
  return Object.freeze(meta);
}

export const STUDIO_LIGHT_FIXTURE_KINDS: readonly StudioLightFixtureKindMeta[] = Object.freeze([
  kindMeta({ kind: "floor-lamp", labelKo: "플로어 스탠드", labelEn: "Floor lamp", icon: "🛋️", defaultRadius: 190, warmByDefault: true }),
  kindMeta({ kind: "desk-lamp", labelKo: "책상 스탠드", labelEn: "Desk lamp", icon: "💡", defaultRadius: 120, warmByDefault: true }),
  kindMeta({ kind: "ceiling-light", labelKo: "천장등", labelEn: "Ceiling light", icon: "🔆", defaultRadius: 260, warmByDefault: false }),
  kindMeta({ kind: "spotlight", labelKo: "스포트라이트", labelEn: "Spotlight", icon: "🔦", defaultRadius: 150, warmByDefault: false }),
  kindMeta({ kind: "string-lights", labelKo: "스트링 라이트", labelEn: "String lights", icon: "✨", defaultRadius: 170, warmByDefault: true }),
  kindMeta({ kind: "neon-sign", labelKo: "네온사인", labelEn: "Neon sign", icon: "🌈", defaultRadius: 140, warmByDefault: false }),
]);

const KIND_META = new Map<StudioLightFixtureKind, StudioLightFixtureKindMeta>(
  STUDIO_LIGHT_FIXTURE_KINDS.map((meta) => [meta.kind, meta]),
);

export function studioLightFixtureKindMeta(kind: StudioLightFixtureKind): StudioLightFixtureKindMeta | null {
  return KIND_META.get(kind) ?? null;
}

/** 배치된 조명 기구. */
export interface StudioLightFixture {
  readonly id: string;
  readonly kind: StudioLightFixtureKind;
  readonly position: StudioVirtualSpacePoint;
  /** 비춤 반경(px). */
  readonly radius: number;
  readonly on: boolean;
  /** 밝기 0~1. */
  readonly dimmer: number;
  /** true면 따뜻한 색, false면 차가운 색. */
  readonly warm: boolean;
}

export function createStudioLightFixture(input: {
  readonly id: string;
  readonly kind: StudioLightFixtureKind;
  readonly position: StudioVirtualSpacePoint;
  readonly radius?: number;
  readonly on?: boolean;
  readonly dimmer?: number;
  readonly warm?: boolean;
}): StudioLightFixture {
  const meta = studioLightFixtureKindMeta(input.kind);
  const clamp01 = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return Object.freeze({
    id: input.id,
    kind: input.kind,
    position: { x: input.position.x, y: input.position.y },
    radius: Number.isFinite(input.radius) && (input.radius as number) > 0
      ? input.radius as number : (meta?.defaultRadius ?? 150),
    on: input.on ?? true,
    dimmer: clamp01(input.dimmer ?? 1),
    warm: input.warm ?? meta?.warmByDefault ?? true,
  });
}

/** 조명 켜기/끄기 토글 (불변 업데이트). */
export function toggleStudioLightFixture(
  fixtures: readonly StudioLightFixture[],
  id: string,
): readonly StudioLightFixture[] {
  return Object.freeze(fixtures.map((fixture) =>
    fixture.id === id ? Object.freeze({ ...fixture, on: !fixture.on }) : fixture,
  ));
}

/** 밝기 조절 (불변 업데이트, 0~1 클램프). */
export function setStudioLightFixtureDimmer(
  fixtures: readonly StudioLightFixture[],
  id: string,
  dimmer: number,
): readonly StudioLightFixture[] {
  const clamped = Number.isFinite(dimmer) ? Math.min(1, Math.max(0, dimmer)) : 0;
  return Object.freeze(fixtures.map((fixture) =>
    fixture.id === id ? Object.freeze({ ...fixture, dimmer: clamped }) : fixture,
  ));
}

/** 시간(0-23) → 시간대. */
export function studioDayPhaseForHour(hour: number): StudioDayPhase {
  const h = Number.isFinite(hour) ? Math.floor(hour) : 12;
  const normalized = ((h % 24) + 24) % 24;
  if (normalized >= 5 && normalized < 7) return "dawn";
  if (normalized >= 7 && normalized < 11) return "morning";
  if (normalized >= 11 && normalized < 15) return "noon";
  if (normalized >= 15 && normalized < 18) return "afternoon";
  if (normalized >= 18 && normalized < 20) return "sunset";
  if (normalized >= 20 && normalized < 24) return "night";
  return "midnight";
}

/** 시간대별 기본 실내 밝기·틴트. */
const PHASE_AMBIENT: Record<StudioDayPhase, { readonly level: number; readonly tint: string; readonly tintStrength: number }> = {
  dawn:      { level: 0.55, tint: "#ffb37a", tintStrength: 0.35 },
  morning:   { level: 0.9,  tint: "#fff3d6", tintStrength: 0.15 },
  noon:      { level: 1.0,  tint: "#ffffff", tintStrength: 0.0 },
  afternoon: { level: 0.92, tint: "#ffedbe", tintStrength: 0.12 },
  sunset:    { level: 0.6,  tint: "#ff8f5c", tintStrength: 0.4 },
  night:     { level: 0.38, tint: "#7a8fc9", tintStrength: 0.35 },
  midnight:  { level: 0.3,  tint: "#5a6fa8", tintStrength: 0.4 },
};

const PHASE_LABEL: Record<StudioDayPhase, { readonly ko: string; readonly en: string }> = {
  dawn:      { ko: "새벽", en: "Dawn" },
  morning:   { ko: "아침", en: "Morning" },
  noon:      { ko: "정오", en: "Noon" },
  afternoon: { ko: "오후", en: "Afternoon" },
  sunset:    { ko: "해질녘", en: "Sunset" },
  night:     { ko: "밤", en: "Night" },
  midnight:  { ko: "심야", en: "Midnight" },
};

export function studioDayPhaseLabel(phase: StudioDayPhase): { readonly ko: string; readonly en: string } {
  return PHASE_LABEL[phase];
}

/** 날씨가 실내 밝기에 주는 보정 (0~1, 1이면 영향 없음). */
function weatherDimFactor(condition: StudioWeatherCondition | null): number {
  switch (condition) {
    case "clear": return 1.0;
    case "cloudy": return 0.85;
    case "fog": return 0.75;
    case "rain": return 0.7;
    case "snow": return 0.8;
    case "thunderstorm": return 0.55;
    default: return 1.0;
  }
}

/** 주변광 상태. */
export interface StudioAmbientLight {
  readonly phase: StudioDayPhase;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 전체 밝기 0~1. */
  readonly level: number;
  readonly tint: string;
  readonly tintStrength: number;
}

/** 시간대 + 날씨 → 주변광. */
export function studioAmbientLightFor(
  hour: number,
  weather: StudioWeatherCondition | null,
): StudioAmbientLight {
  const phase = studioDayPhaseForHour(hour);
  const base = PHASE_AMBIENT[phase];
  const label = PHASE_LABEL[phase];
  const level = Math.min(1, Math.max(0.05, base.level * weatherDimFactor(weather)));
  return Object.freeze({
    phase,
    labelKo: label.ko,
    labelEn: label.en,
    level: Math.round(level * 100) / 100,
    tint: base.tint,
    tintStrength: base.tintStrength,
  });
}

function distance(a: StudioVirtualSpacePoint, b: StudioVirtualSpacePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 특정 지점의 최종 밝기 0~1.
 * 주변광 + 켜진 조명 기구들의 기여도를 합산 (감쇠: 거리에 따라 선형 감소).
 * 조명이 꺼진 밤에도 기구 불빛으로 공간이 살아나도록 설계.
 */
export function studioLightLevelAt(
  fixtures: readonly StudioLightFixture[],
  ambient: StudioAmbientLight,
  point: StudioVirtualSpacePoint,
): number {
  let level = ambient.level * 0.7; // 주변광 기본 기여
  for (const fixture of fixtures) {
    if (!fixture.on || fixture.dimmer <= 0 || fixture.radius <= 0) continue;
    const d = distance(fixture.position, point);
    if (d >= fixture.radius) continue;
    const falloff = 1 - d / fixture.radius;
    level += falloff * falloff * 0.55 * fixture.dimmer;
  }
  return Math.round(Math.min(1.15, Math.max(0, level)) * 100) / 100;
}

/** 밤 시간대에 켜진 조명이 하나라도 있는지 (분위기 체크용). */
export function studioHasActiveLighting(
  fixtures: readonly StudioLightFixture[],
  ambient: StudioAmbientLight,
): boolean {
  if (ambient.level >= 0.75) return true; // 낮에는 주변광으로 충분
  return fixtures.some((fixture) => fixture.on && fixture.dimmer > 0);
}

/** 현재 시각 기준 주변광을 계산하는 헬퍼 (UI·렌더러에서 사용). */
export function studioCurrentAmbientLight(
  date: Date = new Date(),
  weather: StudioWeatherCondition | null = null,
): StudioAmbientLight {
  return studioAmbientLightFor(date.getHours(), weather);
}
