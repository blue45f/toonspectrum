/**
 * 스튜디오 조명 프리셋 4종 (Track 4 · 꾸미기)
 *
 * `createStudioLightFixture`(조명 모듈)의 픽스처 설정을 테마 단위로 묶은
 * 원클릭 프리셋이다. 방 분위기를 바꾸는 진입장벽을 낮춘다.
 *
 * - morning-fresh: 아침 — 밝고 시원한 작업실
 * - focus-work: 집중 — 작업 구역을 또렷하게 비추는 집중등
 * - cozy-evening: 저녁 — 따뜻하고 아늑한 무드등
 * - event-party: 파티 — 화려한 파티 조명
 */

import {
  createStudioLightFixture,
  type StudioLightFixture,
  type StudioLightFixtureKind,
} from "./studio-virtual-space-lighting";

/** 조명 프리셋 키. */
export const STUDIO_LIGHTING_PRESET_KEYS = [
  "morning-fresh",
  "focus-work",
  "cozy-evening",
  "event-party",
] as const;
export type StudioLightingPresetKey = (typeof STUDIO_LIGHTING_PRESET_KEYS)[number];

/** 프리셋에 들어가는 픽스처 스펙. */
export interface StudioLightingPresetFixtureSpec {
  readonly kind: StudioLightFixtureKind;
  readonly x: number;
  readonly y: number;
  /** 밝기 0~1. */
  readonly dimmer: number;
  readonly warm?: boolean;
  readonly radius?: number;
}

/** 조명 프리셋 정의. */
export interface StudioLightingPreset {
  readonly key: StudioLightingPresetKey;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly fixtures: readonly StudioLightingPresetFixtureSpec[];
}

export const STUDIO_LIGHTING_PRESETS: Readonly<Record<StudioLightingPresetKey, StudioLightingPreset>> = Object.freeze({
  "morning-fresh": {
    key: "morning-fresh",
    labelKo: "아침 햇살",
    labelEn: "Morning Fresh",
    descriptionKo: "천장등을 환하게 켜 밝고 산뜻한 아침 작업실이에요.",
    descriptionEn: "Bright ceiling lights for a crisp morning studio.",
    fixtures: [
      { kind: "ceiling-light", x: 240, y: 80, dimmer: 1, warm: false, radius: 420 },
      { kind: "ceiling-light", x: 720, y: 80, dimmer: 1, warm: false, radius: 420 },
    ],
  },
  "focus-work": {
    key: "focus-work",
    labelKo: "집중 작업",
    labelEn: "Focus Work",
    descriptionKo: "작업 구역만 또렷하게 비추는 집중 조명이에요.",
    descriptionEn: "A focused beam over the work area, dim elsewhere.",
    fixtures: [
      { kind: "ceiling-light", x: 480, y: 80, dimmer: 0.35, warm: false, radius: 300 },
      { kind: "spotlight", x: 480, y: 160, dimmer: 1, warm: false, radius: 220 },
      { kind: "desk-lamp", x: 380, y: 320, dimmer: 0.8, warm: true, radius: 160 },
    ],
  },
  "cozy-evening": {
    key: "cozy-evening",
    labelKo: "포근한 저녁",
    labelEn: "Cozy Evening",
    descriptionKo: "따뜻한 스탠드 불빛으로 아늑한 저녁 분위기를 만들어요.",
    descriptionEn: "Warm lamps for a cozy evening mood.",
    fixtures: [
      { kind: "floor-lamp", x: 200, y: 280, dimmer: 0.9, warm: true, radius: 240 },
      { kind: "floor-lamp", x: 760, y: 280, dimmer: 0.9, warm: true, radius: 240 },
      { kind: "string-lights", x: 480, y: 120, dimmer: 0.6, warm: true, radius: 380 },
    ],
  },
  "event-party": {
    key: "event-party",
    labelKo: "파티 모드",
    labelEn: "Event Party",
    descriptionKo: "네온사인과 스포트라이트로 축제 분위기를 연출해요.",
    descriptionEn: "Neon signs and spotlights for a festive party vibe.",
    fixtures: [
      { kind: "neon-sign", x: 240, y: 140, dimmer: 1, warm: false, radius: 200 },
      { kind: "neon-sign", x: 720, y: 140, dimmer: 1, warm: false, radius: 200 },
      { kind: "spotlight", x: 480, y: 200, dimmer: 0.9, warm: false, radius: 320 },
      { kind: "string-lights", x: 480, y: 100, dimmer: 0.7, warm: true, radius: 420 },
    ],
  },
});

/**
 * 프리셋을 실제 픽스처 배열로 만든다.
 * 조명 모듈의 createStudioLightFixture를 그대로 쓰므로 렌더 파이프라인과 호환된다.
 */
export function createStudioLightFixturesForPreset(
  key: StudioLightingPresetKey,
): StudioLightFixture[] {
  const preset = STUDIO_LIGHTING_PRESETS[key];
  if (!preset) throw new Error(`알 수 없는 조명 프리셋: ${String(key)}`);
  return preset.fixtures.map((spec, index) => createStudioLightFixture({
    id: `preset-${key}-${index}`,
    kind: spec.kind,
    position: { x: spec.x, y: spec.y },
    radius: spec.radius,
    on: true,
    dimmer: spec.dimmer,
    warm: spec.warm,
  }));
}

/** 프리셋에 들어간 조명 종류 목록 (UI 뱃지용). */
export function studioLightingPresetKinds(key: StudioLightingPresetKey): readonly StudioLightFixtureKind[] {
  const preset = STUDIO_LIGHTING_PRESETS[key];
  if (!preset) throw new Error(`알 수 없는 조명 프리셋: ${String(key)}`);
  return Object.freeze(preset.fixtures.map((spec) => spec.kind));
}
