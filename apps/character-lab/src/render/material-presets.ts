/**
 * 재질 프리셋 표(순수). MaterialPresetId → PBR 파라미터(금속·거칠기·시인·클리어코트·이방성·SSS 확산 프로파일·unlit).
 * Babylon 바인딩은 render/babylon/materials/material-factory.ts가 하고, 여기서는 수치와 색 해석만 둔다.
 * 수치 근거: Filament PBR 문서(의상 sheen·clearcoat 범위), Jimenez 피부 확산 프로파일(붉은 계열), 헤어 Kajiya-Kay 이방성 개념.
 */
import { hexToLinearRgb, normalizeHex } from "../shared/color";

import type { MaterialPresetId, PartRole, RecipeColorKey, RecipeColors } from "../contracts";

export interface SheenParams {
  readonly intensity: number;
  readonly roughness: number;
  /** true면 시인 색을 알베도에서 밝게 파생, false면 흰색 */
  readonly tintFromAlbedo: boolean;
}

export interface ClearCoatParams {
  readonly intensity: number;
  readonly roughness: number;
}

export interface AnisotropyParams {
  readonly intensity: number;
  /** 탄젠트 공간 방향(UV 기준) */
  readonly direction: readonly [number, number];
}

export interface SubsurfaceParams {
  /** 확산 프로파일 색(선형, Babylon scatteringDiffusionProfile) */
  readonly diffusionProfile: readonly [number, number, number];
}

export interface MaterialPresetParams {
  readonly metallic: number;
  readonly roughness: number;
  /** colorKey가 없을 때 쓰는 기본 색(소문자 #rrggbb) */
  readonly defaultColor: string;
  readonly backFaceCulling: boolean;
  readonly sheen?: SheenParams;
  readonly clearCoat?: ClearCoatParams;
  readonly anisotropy?: AnisotropyParams;
  readonly subsurface?: SubsurfaceParams;
  /** 알베도 대비 emissive 배율(0 = 없음) */
  readonly emissiveScale?: number;
  readonly unlit?: boolean;
}

export const MATERIAL_PRESETS: Readonly<Record<MaterialPresetId, MaterialPresetParams>> = Object.freeze({
  "skin-sss": { metallic: 0, roughness: 0.55, defaultColor: "#f3d3bd", backFaceCulling: true, subsurface: { diffusionProfile: [0.75, 0.25, 0.2] } },
  "eye-wet": { metallic: 0, roughness: 0.12, defaultColor: "#f8f8fa", backFaceCulling: true, clearCoat: { intensity: 1, roughness: 0.04 } },
  iris: { metallic: 0, roughness: 0.35, defaultColor: "#5a3a2a", backFaceCulling: true, emissiveScale: 0.08, clearCoat: { intensity: 0.6, roughness: 0.08 } },
  "hair-aniso": { metallic: 0, roughness: 0.45, defaultColor: "#2b1d16", backFaceCulling: false, anisotropy: { intensity: 0.6, direction: [0, 1] } },
  "cloth-cotton": { metallic: 0, roughness: 0.85, defaultColor: "#e8e8ee", backFaceCulling: false, sheen: { intensity: 0.3, roughness: 0.6, tintFromAlbedo: false } },
  "cloth-denim": { metallic: 0, roughness: 0.9, defaultColor: "#3b4a6b", backFaceCulling: false, sheen: { intensity: 0.15, roughness: 0.8, tintFromAlbedo: true } },
  "cloth-silk": { metallic: 0, roughness: 0.3, defaultColor: "#e6d4e8", backFaceCulling: false, sheen: { intensity: 0.8, roughness: 0.25, tintFromAlbedo: true }, clearCoat: { intensity: 0.1, roughness: 0.3 } },
  leather: { metallic: 0, roughness: 0.5, defaultColor: "#4a2e1e", backFaceCulling: true, clearCoat: { intensity: 0.4, roughness: 0.3 } },
  metal: { metallic: 1, roughness: 0.3, defaultColor: "#c8c8cc", backFaceCulling: true },
  plastic: { metallic: 0, roughness: 0.35, defaultColor: "#c94f6b", backFaceCulling: true, clearCoat: { intensity: 0.6, roughness: 0.1 } },
  "unlit-highlight": { metallic: 0, roughness: 1, defaultColor: "#ffffff", backFaceCulling: true, unlit: true, emissiveScale: 1 },
});

/** 역할별 기본 프리셋(제작 패키지에서 역할만 알 때) */
export const ROLE_DEFAULT_PRESET: Readonly<Record<PartRole, MaterialPresetId>> = Object.freeze({
  skin: "skin-sss",
  head: "skin-sss",
  eyeball: "eye-wet",
  iris: "iris",
  pupil: "iris",
  "eye-highlight": "unlit-highlight",
  brow: "hair-aniso",
  lash: "hair-aniso",
  teeth: "plastic",
  tongue: "skin-sss",
  hair: "hair-aniso",
  top: "cloth-cotton",
  bottom: "cloth-denim",
  shoes: "leather",
  accessory: "plastic",
});

/** 역할별 레시피 색 키(없으면 undefined = 프리셋 기본색) */
export const ROLE_COLOR_KEY: Readonly<Partial<Record<PartRole, RecipeColorKey>>> = Object.freeze({
  skin: "skin",
  head: "skin",
  iris: "iris",
  pupil: "iris",
  brow: "brow",
  lash: "brow",
  hair: "hair",
  top: "top",
  bottom: "bottom",
  shoes: "shoes",
  accessory: "accessory",
});

export interface PartColorInput {
  readonly materialPreset: MaterialPresetId;
  readonly colorKey?: RecipeColorKey;
}

/**
 * 파츠의 표시 색(소문자 hex). 우선순위: 플랜 색(override) > 레시피 색(colorKey) > 프리셋 기본색.
 * 형식이 틀린 값은 건너뛴다(무음으로 검은색을 쓰지 않는다).
 */
export function resolvePartColorHex(part: PartColorInput, colors: Readonly<Partial<RecipeColors>> | null, override?: string): string {
  const candidates: Array<string | undefined> = [override, part.colorKey && colors ? colors[part.colorKey] : undefined, MATERIAL_PRESETS[part.materialPreset].defaultColor];
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const normalized = normalizeHex(candidate);
    if (normalized) return normalized;
  }
  return "#808080";
}

/** hex → 선형 RGB(0..1). 형식이 틀리면 중간 회색. */
export function hexToLinear(hex: string): readonly [number, number, number] {
  return hexToLinearRgb(hex) ?? [0.2, 0.2, 0.2];
}

/** 툰 음영 틴트(알베도에 곱함): 피부는 붉은 계열, 그 외는 푸른 계열(MToon shadeColor 관례) */
export function toonShadeTint(role: PartRole): readonly [number, number, number] {
  switch (role) {
    case "skin":
    case "head":
    case "tongue":
      return [0.86, 0.6, 0.58];
    case "hair":
    case "brow":
    case "lash":
      return [0.62, 0.58, 0.72];
    default:
      return [0.68, 0.68, 0.78];
  }
}

/** 시인 색: 알베도를 밝게(0.6 섞음) 또는 흰색 */
export function sheenColor(albedoLinear: readonly [number, number, number], sheen: SheenParams): readonly [number, number, number] {
  if (!sheen.tintFromAlbedo) return [1, 1, 1];
  return [albedoLinear[0] + (1 - albedoLinear[0]) * 0.6, albedoLinear[1] + (1 - albedoLinear[1]) * 0.6, albedoLinear[2] + (1 - albedoLinear[2]) * 0.6];
}
