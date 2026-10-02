/**
 * 절차 소스 조립기(core). humanoid 영역의 `buildHumanoidModel`과 outfit 영역의 `createOutfitBuilder()`를 DI로 받아
 * 레시피 → `HumanoidModelData`를 만든다. humanoid 빌더가 주입되지 않으면(`null`: 테스트·부분 조립) fail-visible 실패를 던져
 * 적용 루프가 명확한 코드·한글 사유로 배너에 노출하게 한다(무음 대체·fixture 대체 금지, ADR-0018).
 *
 * humanoid `buildHumanoidModel(recipe, options)`가 지켜야 할 조립 규약(outfit-physics 메모, docs/parity/outfit.md §1):
 *  1. `outfit.buildHair`·`outfit.buildGarments` 결과는 `combineOutfitResults([hair, garments])`(domains/outfit)로 합친다.
 *     outfit 파츠의 jointIndices ≥ 55(HUMANOID_BONE_NAMES.length)는 그 결과의 `bones[index - 55]`를 가리키며,
 *     기본 스켈레톤이 55본이 아니면 `remapAuxiliaryJointIndices`로 옮긴다.
 *  2. 보조 루트 본(parent head/hips/chest)의 restTranslation은 추정 피벗 기준이므로
 *     `rebaseAuxiliaryRoots(bones, 실제 rest 위치, 추정값)`로 보정한다.
 *  3. 헤어 파츠는 `param:headSize:±` morph를 가지며 의상 파츠는 전달받은 bodyMorphs 전부를 같은 이름으로 전파한다 —
 *     이 이름들을 `HumanoidModelData.morphNames`에 그대로 포함한다.
 */
import { failVisible, validateMeshPartData } from "../../contracts";

import type { CharacterRecipe, HumanoidModelData, OutfitBuilderPort } from "../../contracts";

/** Catmull-Clark 세분 단계. 1 = 미리보기 예산(≤140k tris) 안. */
export type SubdivisionLevels = 0 | 1 | 2;

export interface HumanoidBuildOptions {
  readonly subdivisionLevels: SubdivisionLevels;
  /** 결정성 시드(같은 레시피 → 같은 바이트) */
  readonly seed: number;
  readonly outfit: OutfitBuilderPort;
}

/** humanoid 영역이 제공해야 하는 빌더 시그니처(`domains/humanoid/humanoid-model.ts` `buildHumanoidModel`). */
export type HumanoidModelBuilder = (recipe: CharacterRecipe, options: HumanoidBuildOptions) => HumanoidModelData | Promise<HumanoidModelData>;

export interface ProceduralSourceDeps {
  /** 주입되지 않았으면 null — 빌드 요청마다 `procedural-builder-missing`으로 실패한다(app/composition.ts는 항상 buildHumanoidModel을 준다). */
  readonly humanoid: HumanoidModelBuilder | null;
  readonly outfit: OutfitBuilderPort;
  readonly subdivisionLevels: SubdivisionLevels;
  readonly seed: number;
  readonly now?: () => number;
}

export const PROCEDURAL_BUILDER_MISSING = "procedural-builder-missing";
export const PROCEDURAL_SOURCE_INVALID = "procedural-source-invalid";

export type ProceduralSourceBuilder = (recipe: CharacterRecipe) => HumanoidModelData | Promise<HumanoidModelData>;

/** 빌더 결과의 모든 파츠를 `validateMeshPartData`로 검사한다. 첫 위반을 LabFailure로 던진다. */
export function assertHumanoidModel(model: HumanoidModelData, now?: number): HumanoidModelData {
  for (const part of model.parts) {
    const failure = validateMeshPartData(part, now);
    if (failure) {
      throw failVisible(PROCEDURAL_SOURCE_INVALID, `절차 휴머노이드 메시가 정합성 검사를 통과하지 못했습니다: ${failure.reasonKo}`, failure.detail, now);
    }
  }
  if (model.parts.length === 0) {
    throw failVisible(PROCEDURAL_SOURCE_INVALID, "절차 휴머노이드가 파츠를 하나도 만들지 않았습니다.", undefined, now);
  }
  return model;
}

export function createProceduralSourceBuilder(deps: ProceduralSourceDeps): ProceduralSourceBuilder {
  const now = deps.now ?? (() => Date.now());
  return async (recipe) => {
    const humanoid = deps.humanoid;
    if (!humanoid) {
      throw failVisible(
        PROCEDURAL_BUILDER_MISSING,
        "절차 휴머노이드 빌더(src/domains/humanoid/humanoid-model.ts의 buildHumanoidModel)가 주입되지 않았습니다. app/composition.ts의 조립을 확인하세요.",
        undefined,
        now(),
      );
    }
    const model = await humanoid(recipe, { subdivisionLevels: deps.subdivisionLevels, seed: deps.seed, outfit: deps.outfit });
    return assertHumanoidModel(model, now());
  };
}
