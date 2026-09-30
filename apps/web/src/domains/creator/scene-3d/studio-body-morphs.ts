/**
 * Studio 3D 데생 인형 — Magic Poser 벤치마크: 신체 모프 (MP5).
 *
 * 근육·체지방·슬림 모프(−100~+100)와 두신 프리셋(사실적/6등신/4등신/ SD)를
 * 데생 인형 체형 파라미터(`StudioMannequinBodyParams`)에 매핑합니다.
 * 웹툰 캐릭터 체형 레퍼런스(장신 근육형, SD형 등)를 빠르게 잡는 용도입니다.
 *
 * Three.js 메시 변형을 직접 다루지 않는 순수 데이터+로직 모듈입니다.
 */

import {
  clampStudioMannequinBodyParams,
  type StudioMannequinBodyParams,
} from "./studio-mannequin-model";
import type { ShaperBodySliderValues } from "./studio-shaper-model";

/** 근육/체지방/슬림 모프. 각 −100~+100, 양수일수록 해당 특성이 강해집니다. */
export interface StudioBodyMorph {
  readonly muscle: number;
  readonly bodyFat: number;
  readonly slim: number;
}

export const STUDIO_BODY_MORPH_RANGE = Object.freeze({ min: -100, max: 100 });

/** 모프 값을 −100~+100으로 클램프합니다. 비유한 값은 0으로 처리합니다. */
export function clampStudioBodyMorphValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(STUDIO_BODY_MORPH_RANGE.max, Math.max(STUDIO_BODY_MORPH_RANGE.min, value));
}

export type StudioHeadRatioPresetId = "realistic" | "six" | "four" | "chibi";

export const STUDIO_HEAD_RATIO_PRESETS: readonly {
  readonly id: StudioHeadRatioPresetId;
  readonly label: string;
  /** 두신(머리 개수). */
  readonly headCount: number;
  readonly description: string;
}[] = Object.freeze([
  { id: "realistic", label: "사실적", headCount: 7.5, description: "성인 실사 비율의 웹툰 캐릭터에 사용합니다." },
  { id: "six", label: "6등신", headCount: 6, description: "일반 웹툰 주인공 체형에 사용합니다." },
  { id: "four", label: "4등신", headCount: 4, description: "준 SD 체형에 사용합니다." },
  { id: "chibi", label: "SD", headCount: 3, description: "SD·데포르메 체형에 사용합니다." },
]);

/**
 * 모프를 체형 파라미터에 적용합니다.
 * build(0=마른, 1=표준, 2=근육, 3=통통)를 목표 방향으로 이동시키고,
 * 사지·허리 굵기 배율을 함께 조절한 뒤 기존 클램프 규약으로 정규화합니다.
 */
export function applyStudioBodyMorph(
  params: StudioMannequinBodyParams,
  morph: StudioBodyMorph,
): StudioMannequinBodyParams {
  const muscle = clampStudioBodyMorphValue(morph.muscle) / 100;
  const bodyFat = clampStudioBodyMorphValue(morph.bodyFat) / 100;
  const slim = clampStudioBodyMorphValue(morph.slim) / 100;

  // build 이동: 근육→2, 체지방→3, 슬림→0 방향의 가중 합입니다.
  const buildDelta = muscle * 1.2 + bodyFat * 1.6 - slim * 1.0;
  const limbDelta = muscle * 0.25 - slim * 0.2 + bodyFat * 0.1;
  const waistDelta = bodyFat * 0.25 - slim * 0.1;

  return clampStudioMannequinBodyParams({
    ...params,
    build: params.build + buildDelta,
    limbThickness: (params.limbThickness ?? 1) + limbDelta,
    upperArmThickness: (params.upperArmThickness ?? 1) + muscle * 0.25,
    forearmThickness: (params.forearmThickness ?? 1) + muscle * 0.2,
    thighThickness: (params.thighThickness ?? 1) + muscle * 0.2 + bodyFat * 0.1,
    calfThickness: (params.calfThickness ?? 1) + muscle * 0.15,
    waistWidth: (params.waistWidth ?? 1) + waistDelta,
    pelvisDepth: (params.pelvisDepth ?? 1) + bodyFat * 0.15,
  });
}

/** 두신 프리셋을 적용합니다. headCount만 바꾸고 나머지는 유지합니다. */
export function applyStudioHeadRatioPreset(
  params: StudioMannequinBodyParams,
  presetId: StudioHeadRatioPresetId,
): StudioMannequinBodyParams {
  const preset = STUDIO_HEAD_RATIO_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) {
    throw new Error(`알 수 없는 두신 프리셋입니다: ${String(presetId)}`);
  }
  return clampStudioMannequinBodyParams({ ...params, headCount: preset.headCount });
}

// ── 셰이퍼 체형 슬라이더 정의 ────────────────────────────────────────────────

/** 체형 슬라이더 한 개의 정의(라벨·범위·단위). ShaperBodySliderValues의 키와 1:1 대응합니다. */
export interface StudioBodySliderDef {
  readonly key: keyof ShaperBodySliderValues;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unitKo?: string;
  readonly unitEn?: string;
}

/** 셰이퍼 체형 탭에 노출되는 5개 슬라이더 정의. */
export const STUDIO_BODY_SLIDER_DEFS: readonly StudioBodySliderDef[] = Object.freeze([
  { key: "heightCm", labelKo: "키", labelEn: "Height", min: 120, max: 200, step: 1, unitKo: "cm", unitEn: "cm" },
  { key: "headCount", labelKo: "두신", labelEn: "Head count", min: 3, max: 9, step: 0.5, unitKo: "등신", unitEn: "heads" },
  { key: "build", labelKo: "체격", labelEn: "Build", min: 0, max: 3, step: 0.1 },
  { key: "shoulderWidth", labelKo: "어깨 너비", labelEn: "Shoulder width", min: 0.7, max: 1.3, step: 0.05 },
  { key: "hipWidth", labelKo: "골반 너비", labelEn: "Hip width", min: 0.7, max: 1.3, step: 0.05 },
]);

/**
 * 슬라이더 값을 데생 인형 체형 파라미터(Partial)로 변환합니다.
 * hipWidth는 인형의 pelvisWidth 필드에 매핑됩니다.
 */
export function shaperBodySlidersToMannequinParams(
  values: ShaperBodySliderValues,
): Partial<StudioMannequinBodyParams> {
  return {
    heightCm: values.heightCm,
    headCount: values.headCount,
    build: values.build,
    shoulderWidth: values.shoulderWidth,
    pelvisWidth: values.hipWidth,
  };
}
