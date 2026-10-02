/**
 * morph 타깃 저장 방식과 한계(순수). Babylon `MorphTargetManager`는 두 가지로 타깃을 저장한다.
 *
 * - **텍스처 모드**(`useTextureToStoreTargets`, 기본): 타깃을 `RawTexture2DArray`(RGBA32F, 층 = 타깃)에 담는다. 가로 = 정점 수 × 스트라이드
 *   (위치 1 + 법선 1 …, 최대 `maxTextureSize`, 넘으면 행 추가), 층 수 = 타깃 수이며 층 한계는 엔진의 `texture2DArrayMaxLayerCount`
 *   (WebGL2 MAX_ARRAY_TEXTURE_LAYERS 최소 256, WebGPU maxTextureArrayLayers 기본 256, NullEngine 128)다. 동시에 활성인 타깃 수에는 제한이 없다.
 * - **attribute 모드**: 활성 타깃(influence > 0)을 정점 attribute로 보내며 동시에 **8개**(`MaxActiveMorphTargetsInVertexAttributeMode`)까지만
 *   쓴다. 초과분은 조용히 무시된다.
 *
 * 타깃 수가 층 한계를 넘으면 Babylon이 **무음으로 attribute 모드로 내려가므로**(synchronize) 그 사실을 사유와 함께 보고해야 한다.
 * 머리 파츠는 morph 54개(안구계 14·눈썹 41·치아 43 …)라 텍스처 모드가 필수다(humanoid 요청 §4.2).
 */
import { featureActive, featureOff, featureUnavailable } from "./scene-features";

import type { SceneFeatureState } from "./scene-features";

/** attribute 모드의 동시 활성 타깃 한계(Babylon `MorphTargetManager.MaxActiveMorphTargetsInVertexAttributeMode`) */
export const ATTRIBUTE_MODE_MAX_ACTIVE_TARGETS = 8;

export interface MorphManagerFacts {
  /** 보고용 이름(메시 이름) */
  readonly name: string;
  readonly targetCount: number;
  readonly vertexCount: number;
  /** 법선 델타를 타깃이 지원하는지(스트라이드 +1) */
  readonly supportsNormals: boolean;
  /** 매니저가 지금 텍스처로 저장하는지 */
  readonly usingTexture: boolean;
  /** 지금 influence > 0인 타깃 수 */
  readonly activeTargets: number;
}

export interface MorphTextureRequirement {
  readonly name: string;
  readonly layers: number;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly fitsLayers: boolean;
}

export interface MorphLimits {
  readonly maxTextureSize: number;
  /** 텍스처 배열 최대 층 수(`caps.texture2DArrayMaxLayerCount`) */
  readonly maxArrayLayers: number;
}

/** 한 매니저가 텍스처 모드에서 요구하는 텍스처 크기와 층 한계 충족 여부 */
export function morphTextureRequirement(manager: Pick<MorphManagerFacts, "name" | "targetCount" | "vertexCount" | "supportsNormals">, limits: MorphLimits): MorphTextureRequirement {
  const stride = 1 + (manager.supportsNormals ? 1 : 0);
  const texels = Math.max(1, manager.vertexCount * stride);
  const maxSize = Math.max(1, limits.maxTextureSize);
  const width = Math.min(texels, maxSize);
  const height = Math.ceil(texels / maxSize);
  return {
    name: manager.name,
    layers: manager.targetCount,
    width,
    height,
    bytes: width * height * manager.targetCount * 16,
    fitsLayers: manager.targetCount <= limits.maxArrayLayers,
  };
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 능력 보고 항목 `morphTextureMode`. 매니저가 없으면 off, 전부 텍스처 모드면 active(규모 수치 포함),
 * 하나라도 attribute 모드면 unavailable(원인: 층 한계 초과 또는 엔진 미지원)과 8개 제한을 한글로 알린다.
 */
export function describeMorphTextureMode(managers: readonly MorphManagerFacts[], limits: MorphLimits, emptyReasonKo: string): SceneFeatureState {
  if (managers.length === 0) return featureOff(emptyReasonKo);
  const requirements = managers.map((manager) => morphTextureRequirement(manager, limits));
  const attribute = managers.filter((manager) => !manager.usingTexture);
  if (attribute.length > 0) {
    const overLayers = requirements.filter((requirement, index) => !requirement.fitsLayers && !managers[index]?.usingTexture);
    const names = attribute.slice(0, 3).map((manager) => `${manager.name}(${manager.targetCount}개)`).join(", ");
    const more = attribute.length > 3 ? ` 외 ${attribute.length - 3}개` : "";
    const cause =
      overLayers.length > 0
        ? `타깃 수가 텍스처 배열 층 한계(${limits.maxArrayLayers}층)를 넘어 Babylon이 attribute 모드로 내려갔습니다`
        : "엔진이 morph 텍스처 저장을 지원하지 않습니다";
    const worstActive = attribute.reduce((max, manager) => Math.max(max, manager.activeTargets), 0);
    const clipped = worstActive > ATTRIBUTE_MODE_MAX_ACTIVE_TARGETS ? ` 현재 활성 타깃 ${worstActive}개 중 ${worstActive - ATTRIBUTE_MODE_MAX_ACTIVE_TARGETS}개는 무시됩니다.` : "";
    return featureUnavailable(`${names}${more}: ${cause}. attribute 모드는 동시 활성 타깃을 ${ATTRIBUTE_MODE_MAX_ACTIVE_TARGETS}개까지만 반영합니다.${clipped}`);
  }
  const largest = requirements.reduce((best, requirement) => (requirement.bytes > best.bytes ? requirement : best), requirements[0] as MorphTextureRequirement);
  const maxTargets = Math.max(...requirements.map((requirement) => requirement.layers));
  const totalBytes = requirements.reduce((sum, requirement) => sum + requirement.bytes, 0);
  return featureActive(
    `텍스처 모드 · 매니저 ${managers.length}개 · 최대 타깃 ${maxTargets}개(한계 ${limits.maxArrayLayers}층) · 최대 텍스처 ${largest.width}×${largest.height}×${largest.layers}층 · 합계 약 ${megabytes(totalBytes)}`,
  );
}
