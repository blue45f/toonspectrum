/**
 * 가상 스튜디오 주야 사이클 → 조명 프리셋 연결
 *
 * 가상 시계(주야 사이클)의 현재 시각을 조명 프리셋 4종 중 하나로 잇는다.
 * 사이클이 켜지면 아침·낮·황혼·밤 시간대에 맞는 프리셋이 자동으로
 * 권고·적용되고, 밤에는 창문 조명과 네온사인이 도드라지도록
 * 조명 기구별 밝기를 보정한다.
 *
 * 순수 로직 모듈. 프리셋 픽스처 생성은
 * `studio-virtual-space-lighting-presets`를 그대로 재사용하고,
 * 실제 렌더링은 호출 측(페이지·캔버스)이 담당한다.
 */

import type {
  StudioLightFixture,
  StudioLightFixtureKind,
} from "./studio-virtual-space-lighting";
import {
  STUDIO_LIGHTING_PRESETS,
  type StudioLightingPresetKey,
} from "./studio-virtual-space-lighting-presets";

/** 주야 라이팅 시간대 (하루 4단). */
export type StudioDayNightLightingPhase = "morning" | "day" | "dusk" | "night";

/** 시간대 순서 (사이클 진행 방향). */
export const STUDIO_DAY_NIGHT_LIGHTING_PHASES: readonly StudioDayNightLightingPhase[] = Object.freeze([
  "morning", "day", "dusk", "night",
]);

const PHASE_LABEL: Readonly<Record<StudioDayNightLightingPhase, { readonly ko: string; readonly en: string }>> = Object.freeze({
  morning: { ko: "아침", en: "Morning" },
  day: { ko: "낮", en: "Day" },
  dusk: { ko: "황혼", en: "Dusk" },
  night: { ko: "밤", en: "Night" },
});

/** 시간대 한글·영문 라벨. */
export function studioDayNightLightingPhaseLabel(
  phase: StudioDayNightLightingPhase,
): { readonly ko: string; readonly en: string } {
  return PHASE_LABEL[phase];
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * 하루 중 비율(0~1) → 라이팅 시간대.
 * 아침 06–12시 · 낮 12–17시 · 황혼 17–20시 · 밤 20–06시.
 */
export function studioDayNightLightingPhaseAt(timeOfDay: number): StudioDayNightLightingPhase {
  const ratio = clamp01(timeOfDay);
  const hour = ratio * 24;
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

/** 시간대 → 자동 적용할 조명 프리셋. */
export const STUDIO_DAY_NIGHT_LIGHTING_PRESETS: Readonly<Record<StudioDayNightLightingPhase, StudioLightingPresetKey>> = Object.freeze({
  morning: "morning-fresh",
  day: "focus-work",
  dusk: "cozy-evening",
  night: "event-party",
});

export function studioLightingPresetForDayNightPhase(phase: StudioDayNightLightingPhase): StudioLightingPresetKey {
  return STUDIO_DAY_NIGHT_LIGHTING_PRESETS[phase];
}

/** 조명 기구 종류별 밝기 배율 + 밤 장식 보정. */
export interface StudioDayNightFixtureModulation {
  readonly phase: StudioDayNightLightingPhase;
  readonly presetKey: StudioLightingPresetKey;
  /** 조명 기구 종류별 디머 배율 (0~1.2). */
  readonly dimmerMultiplier: Readonly<Record<StudioLightFixtureKind, number>>;
  /** 창문을 통해 새어드는 빛의 강도 0~1 (밤에 커진다). */
  readonly windowGlow: number;
  /** 네온사인 추가 발光 배율 0~1 (밤에 커진다). */
  readonly neonGlow: number;
}

const DIMMER_MULTIPLIERS: Readonly<Record<StudioDayNightLightingPhase, Readonly<Record<StudioLightFixtureKind, number>>>> = Object.freeze({
  morning: Object.freeze({
    "floor-lamp": 0.5, "desk-lamp": 0.6, "ceiling-light": 1, "spotlight": 0.7, "string-lights": 0.3, "neon-sign": 0.4,
  }),
  day: Object.freeze({
    "floor-lamp": 0.4, "desk-lamp": 0.8, "ceiling-light": 0.85, "spotlight": 1, "string-lights": 0.2, "neon-sign": 0.3,
  }),
  dusk: Object.freeze({
    "floor-lamp": 1, "desk-lamp": 0.9, "ceiling-light": 0.6, "spotlight": 0.8, "string-lights": 0.9, "neon-sign": 0.8,
  }),
  night: Object.freeze({
    "floor-lamp": 0.8, "desk-lamp": 0.7, "ceiling-light": 0.35, "spotlight": 0.75, "string-lights": 1.1, "neon-sign": 1.2,
  }),
});

/** 밤 깊이 0~1 (한밤중에 최대). */
function nightDepth(timeOfDay: number): number {
  const hour = clamp01(timeOfDay) * 24;
  if (hour < 20 && hour >= 6) return 0;
  // 20시→자정→6시로 갈수록 깊어졌다가 새벽에 옅어진다.
  const into = hour >= 20 ? hour - 20 : hour + 4;
  return Math.min(1, Math.max(0, Math.sin((into / 10) * Math.PI)));
}

/**
 * 현재 가상 시각의 조명 보정 스냅샷.
 * windowGlow/neonGlow는 밤에만 0보다 커지고 한밤중(자정 전후)에 가장 강하다.
 */
export function studioDayNightModulationAt(timeOfDay: number): StudioDayNightFixtureModulation {
  const phase = studioDayNightLightingPhaseAt(timeOfDay);
  const depth = phase === "night" ? Math.max(0.35, nightDepth(timeOfDay)) : 0;
  return Object.freeze({
    phase,
    presetKey: studioLightingPresetForDayNightPhase(phase),
    dimmerMultiplier: DIMMER_MULTIPLIERS[phase],
    windowGlow: phase === "night" ? Math.round(depth * 0.85 * 100) / 100 : 0,
    neonGlow: phase === "night" ? Math.round(depth * 100) / 100 : 0,
  });
}

/**
 * 조명 기구 목록에 주야 보정을 적용한다 (불변).
 * 밤에는 꺼진 네온사인·스트링 라이트를 켜서 창문·네온이 도드라지게 한다.
 * 그 외 기구는 켜짐 상태를 바꾸지 않고 밝기만 시간대에 맞게 조절한다.
 */
export function modulateStudioDayNightFixtures(
  fixtures: readonly StudioLightFixture[],
  timeOfDay: number,
): readonly StudioLightFixture[] {
  const modulation = studioDayNightModulationAt(timeOfDay);
  return Object.freeze(fixtures.map((fixture) => {
    const multiplier = modulation.dimmerMultiplier[fixture.kind] ?? 1;
    const nightDecor = fixture.kind === "neon-sign" || fixture.kind === "string-lights";
    const on = fixture.on || (modulation.phase === "night" && nightDecor);
    return Object.freeze({
      ...fixture,
      on,
      dimmer: Math.round(Math.min(1, Math.max(0, fixture.dimmer * multiplier)) * 100) / 100,
    });
  }));
}

/** 현재 시간대 프리셋 정보 한 줄 (패널 표시용). */
export function studioDayNightPresetSummary(timeOfDay: number): {
  readonly phase: StudioDayNightLightingPhase;
  readonly phaseLabel: { readonly ko: string; readonly en: string };
  readonly presetKey: StudioLightingPresetKey;
  readonly presetLabel: { readonly ko: string; readonly en: string };
} {
  const modulation = studioDayNightModulationAt(timeOfDay);
  const preset = STUDIO_LIGHTING_PRESETS[modulation.presetKey];
  return Object.freeze({
    phase: modulation.phase,
    phaseLabel: studioDayNightLightingPhaseLabel(modulation.phase),
    presetKey: modulation.presetKey,
    presetLabel: { ko: preset.labelKo, en: preset.labelEn },
  });
}
