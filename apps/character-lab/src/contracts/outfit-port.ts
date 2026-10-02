/**
 * humanoid(W2) ↔ outfit(W3) 경계 포트. humanoid-model이 DI로 받아 헤어·의상 파츠를 조립한다.
 *
 * 규약:
 * - outfit builder는 `partId: 0`, `materialId: 0`으로 파츠를 돌려주고, humanoid-model 조립기가
 *   최종 순서로 `allocatePartIds`를 적용해 partId·materialId를 재배정한다(바이트 결정성).
 * - 보조 본 이름은 `hair_<style>_<i>_<j>`, `skirt_<i>_<j>`, `ribbon_<i>_<j>` 형식이며 `auxiliary: true`.
 * - 의상 정점의 스킨 웨이트는 가장 가까운 몸 정점에서 상속하고, 체형 morph 델타는 같은 매핑으로 전파한다.
 */
import type { BoneData, ChainAnchor, MeshPartData, MorphDelta } from "./mesh-data";
import type { Vec2, Vec3 } from "./pose";
import type { AccessoryStyleId, BottomStyleId, HairStyleId, ShoesStyleId, TopStyleId } from "./preset-vocabulary";
import type { RecipeColors } from "./recipe";

export const BODY_REGIONS = [
  "head",
  "neck",
  "torso",
  "hips",
  "leftArm",
  "rightArm",
  "leftHand",
  "rightHand",
  "leftLeg",
  "rightLeg",
  "leftFoot",
  "rightFoot",
] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

export interface SurfaceSample {
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly uv: Vec2;
}

/** 두피 표면: 헤어 앵커 곡선과 카드 배치의 기준 */
export interface ScalpSurface {
  /** 머리 중심(모델 공간) */
  readonly center: Vec3;
  /** 머리 반경(m) */
  readonly radius: number;
  readonly up: Vec3;
  readonly forward: Vec3;
  /** 두피 표면 샘플(결정적 순서) */
  readonly samples: readonly SurfaceSample[];
}

/** 몸 표면: 의상 오프셋 표면의 기준. 정점 배열은 피부 파츠와 같은 순서다. */
export interface BodySurface {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly jointIndices: Uint16Array;
  readonly jointWeights: Float32Array;
  /** 정점 인덱스 → 영역 */
  readonly regionOfVertex: Uint8Array;
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
}

export function bodyRegionIndex(region: BodyRegion): number {
  return BODY_REGIONS.indexOf(region);
}

export interface GarmentSelection {
  readonly top: TopStyleId | null;
  readonly bottom: BottomStyleId | null;
  readonly shoes: ShoesStyleId | null;
  readonly accessory: AccessoryStyleId | null;
}

export interface OutfitBuildContext {
  /** 결정적 시드(humanoid-model options.seed에서 파생) */
  readonly seed: number;
  readonly colors: RecipeColors;
  /** 머리 크기 배율(headSize 파라미터 반영, 1 = 기본) */
  readonly headSize: number;
}

export interface OutfitBuildResult {
  readonly parts: readonly MeshPartData[];
  /** 보조 본(auxiliary: true) */
  readonly bones: readonly BoneData[];
  readonly chains: readonly ChainAnchor[];
}

export interface OutfitBuilderPort {
  buildHair(style: HairStyleId, scalp: ScalpSurface, context: OutfitBuildContext): OutfitBuildResult;
  buildGarments(
    selection: GarmentSelection,
    body: BodySurface,
    bodyMorphs: readonly MorphDelta[],
    context: OutfitBuildContext,
  ): OutfitBuildResult;
}

export const EMPTY_OUTFIT_RESULT: OutfitBuildResult = Object.freeze({ parts: [], bones: [], chains: [] });
