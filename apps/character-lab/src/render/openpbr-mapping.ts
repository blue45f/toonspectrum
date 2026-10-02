/**
 * PBR 프리셋 → OpenPBR 파라미터 매핑(순수). 기존 PBR 경로의 파라미터 규약은 `material-presets.ts`의 `MaterialPresetParams`
 * (금속·거칠기·시인·클리어코트·이방성·SSS 확산 프로파일·emissive·unlit)이고, OpenPBRMaterial(Babylon 9.19, 베타)은 같은 값을
 * OpenPBR 1.0 파라미터 이름으로 받는다. 여기서는 수치 변환만 하고 Babylon 바인딩은 `babylon/materials/openpbr-material.ts`가 한다.
 *
 * 대응
 * - metallic → baseMetalness, roughness → specularRoughness (OpenPBR도 같은 GGX 거칠기 규약)
 * - clearCoat {intensity, roughness} → coatWeight, coatRoughness (coatIor는 PBR 클리어코트 기본 굴절률 1.5로 고정)
 * - sheen {intensity, roughness, color} → fuzzWeight, fuzzRoughness, fuzzColor (OpenPBR fuzz = 천의 솜털 시인)
 * - anisotropy {intensity, direction} → specularRoughnessAnisotropy, geometryTangent
 * - subsurface.diffusionProfile → subsurfaceWeight 1 + subsurfaceColor(알베도) + subsurfaceRadius·subsurfaceRadiusScale
 *   (PBR의 확산 프로파일 색은 상대 확산 길이이므로 최대 채널을 1로 정규화한 채널 배율 × 대표 평균 자유 경로로 근사한다 — 단위가 달라 근사)
 * - emissiveScale → emissionColor(알베도) × emissionLuminance(= 배율). PBR 경로의 emissive = 알베도 × 배율과 같다.
 * - unlit, backFaceCulling/twoSidedLighting은 그대로
 *
 * OpenPBR에 대응이 없는 것: 페인트 데칼(Babylon 9.19 OpenPBRMaterial에는 decalMap 플러그인이 없다 — 오버레이를 그리지 못한다).
 */
import { sheenColor } from "./material-presets";

import type { MaterialPresetParams } from "./material-presets";

/** 피부 SSS 대표 평균 자유 경로(m): 가장 멀리 퍼지는 채널(적색) 기준 약 4 mm. 확산 프로파일 상대 길이의 절대 스케일 근사. */
export const OPENPBR_SKIN_SSS_RADIUS_M = 0.004;
/** 클리어코트 굴절률(PBR `clearCoat.indexOfRefraction` 기본값과 같다) */
export const OPENPBR_COAT_IOR = 1.5;

export interface OpenPbrParams {
  /** 선형 RGB */
  readonly baseColor: readonly [number, number, number];
  readonly baseMetalness: number;
  readonly specularRoughness: number;
  readonly coatWeight: number;
  readonly coatRoughness: number;
  readonly coatIor: number;
  readonly fuzzWeight: number;
  readonly fuzzRoughness: number;
  readonly fuzzColor: readonly [number, number, number];
  readonly specularRoughnessAnisotropy: number;
  readonly geometryTangent: readonly [number, number];
  readonly subsurfaceWeight: number;
  readonly subsurfaceColor: readonly [number, number, number];
  readonly subsurfaceRadius: number;
  readonly subsurfaceRadiusScale: readonly [number, number, number];
  readonly emissionColor: readonly [number, number, number];
  readonly emissionLuminance: number;
  readonly unlit: boolean;
  readonly backFaceCulling: boolean;
  readonly twoSidedLighting: boolean;
}

export interface OpenPbrMappingOptions {
  /** PrePass SubSurface가 가능한 엔진인지(PBR 경로와 같은 게이트). 아니면 SSS 가중치를 0으로 둔다. */
  readonly sssAvailable: boolean;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * 프리셋과 알베도(선형 RGB, 레시피 색)에서 OpenPBR 파라미터를 만든다. 프리셋에 없는 기능은 가중치 0(꺼짐)이다.
 */
export function mapPresetToOpenPbr(preset: MaterialPresetParams, albedoLinear: readonly [number, number, number], options: OpenPbrMappingOptions): OpenPbrParams {
  const sheen = preset.sheen;
  const fuzzColor = sheen ? sheenColor(albedoLinear, sheen) : ([1, 1, 1] as const);
  const profile = preset.subsurface?.diffusionProfile;
  const maxChannel = profile ? Math.max(profile[0], profile[1], profile[2], 1e-6) : 1;
  const sss = profile !== undefined && options.sssAvailable;
  const emissive = preset.emissiveScale ?? 0;
  return {
    baseColor: albedoLinear,
    baseMetalness: clamp01(preset.metallic),
    specularRoughness: clamp01(preset.roughness),
    coatWeight: preset.clearCoat ? clamp01(preset.clearCoat.intensity) : 0,
    coatRoughness: preset.clearCoat ? clamp01(preset.clearCoat.roughness) : 0,
    coatIor: OPENPBR_COAT_IOR,
    fuzzWeight: sheen ? clamp01(sheen.intensity) : 0,
    fuzzRoughness: sheen ? clamp01(sheen.roughness) : 0.5,
    fuzzColor,
    specularRoughnessAnisotropy: preset.anisotropy ? clamp01(preset.anisotropy.intensity) : 0,
    geometryTangent: preset.anisotropy ? [preset.anisotropy.direction[0], preset.anisotropy.direction[1]] : [1, 0],
    subsurfaceWeight: sss ? 1 : 0,
    subsurfaceColor: albedoLinear,
    subsurfaceRadius: sss ? OPENPBR_SKIN_SSS_RADIUS_M : 0,
    subsurfaceRadiusScale: profile ? [profile[0] / maxChannel, profile[1] / maxChannel, profile[2] / maxChannel] : [1, 1, 1],
    emissionColor: albedoLinear,
    emissionLuminance: emissive,
    unlit: preset.unlit === true,
    backFaceCulling: preset.backFaceCulling,
    twoSidedLighting: !preset.backFaceCulling,
  };
}

/** 매핑이 PBR 경로와 달라지는 점(능력 보고 사유용, 한글) */
export const OPENPBR_DIFFERENCES_KO: readonly string[] = [
  "페인트 데칼(드로잉 레이어)은 OpenPBRMaterial에 decalMap 플러그인이 없어 보이지 않습니다.",
  "피부 SSS는 확산 프로파일 색 대신 평균 자유 경로(약 4 mm)·채널 배율로 근사합니다.",
  "시인(sheen)은 OpenPBR fuzz로, 클리어코트는 coat(굴절률 1.5)로 옮깁니다.",
  "Babylon이 청색 노이즈 텍스처 1장을 assets.babylonjs.com에서 받습니다(외부 요청).",
];
