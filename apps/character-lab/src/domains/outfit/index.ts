/**
 * outfit 도메인 공개 진입점(outfit-physics 작업자 소유): createOutfitBuilder(): OutfitBuilderPort.
 *
 * humanoid 조립기(humanoid-model)가 알아야 할 규약:
 * 1. 모든 파츠는 partId 0·materialId 0으로 돌려주며 조립기가 `allocatePartIds`로 재배정한다.
 * 2. 파츠 jointIndices 중 `OUTFIT_AUX_BONE_INDEX_BASE`(=55, VRM 본 수) 이상은 **그 결과(OutfitBuildResult)의
 *    `bones[index - 55]`** 를 가리킨다. buildHair와 buildGarments 결과를 합칠 때는 `combineOutfitResults`를 써서
 *    두 번째 결과의 보조 본 인덱스를 밀어야 하고, 기본 스켈레톤이 55본이 아니면 `remapAuxiliaryJointIndices`로 기준을 바꾼다.
 * 3. 보조 루트 본(parent "head"/"hips"/"chest")의 restTranslation은 추정 피벗(`assumedHeadPivot`·`assumedBodyPivots`)
 *    기준이다. 실제 rest 본 위치를 아는 조립기는 `rebaseAuxiliaryRoots`로 보정한다(체인 restPoints는 모델 공간이라 영향 없음).
 * 4. 체인 수·입자 수는 PHYSICS_BUDGET(64체인·1,024입자) 안이며 `outfitChainBudget`으로 확인한다.
 */
import { HUMANOID_BONE_NAMES } from "../../contracts";

import { buildGarments } from "./garments";
import { OUTFIT_AUX_BONE_INDEX_BASE, buildHair } from "./hair-builder";

import type { BoneData, MeshPartData, OutfitBuildResult, OutfitBuilderPort, Vec3 } from "../../contracts";

export * from "./follow-body";
export * from "./garments";
export * from "./geometry";
export * from "./hair-builder";
export * from "./hair-styles";

export function createOutfitBuilder(): OutfitBuilderPort {
  return {
    buildHair: (style, scalp, context) => buildHair(style, scalp, context),
    buildGarments: (selection, body, bodyMorphs, context) => buildGarments(selection, body, bodyMorphs, context),
  };
}

/** 파츠의 보조 본 인덱스(≥ fromBase)를 toBase + offset 기준으로 옮긴 사본 */
export function remapAuxiliaryJointIndices(part: MeshPartData, fromBase: number, toBase: number, offset = 0): MeshPartData {
  if (!part.jointIndices) return part;
  const jointIndices = new Uint16Array(part.jointIndices);
  for (let i = 0; i < jointIndices.length; i += 1) {
    if (jointIndices[i] >= fromBase) jointIndices[i] = jointIndices[i] - fromBase + toBase + offset;
  }
  return { ...part, jointIndices };
}

/** 여러 outfit 결과를 하나로 합친다(뒤 결과의 보조 본 인덱스를 앞 결과의 본 수만큼 민다). */
export function combineOutfitResults(results: readonly OutfitBuildResult[], base = OUTFIT_AUX_BONE_INDEX_BASE): OutfitBuildResult {
  const parts: MeshPartData[] = [];
  const bones: BoneData[] = [];
  const chains: OutfitBuildResult["chains"][number][] = [];
  for (const result of results) {
    const offset = bones.length;
    for (const part of result.parts) parts.push(offset === 0 && base === OUTFIT_AUX_BONE_INDEX_BASE ? part : remapAuxiliaryJointIndices(part, OUTFIT_AUX_BONE_INDEX_BASE, base, offset));
    bones.push(...result.bones);
    chains.push(...result.chains);
  }
  return { parts, bones, chains };
}

/** 보조 루트 본의 restTranslation을 (추정 피벗 → 실제 부모 rest 위치) 차이만큼 보정한다. */
export function rebaseAuxiliaryRoots(bones: readonly BoneData[], actualParentRest: Readonly<Partial<Record<string, Vec3>>>, assumedParentRest: Readonly<Partial<Record<string, Vec3>>>): BoneData[] {
  return bones.map((bone) => {
    if (!bone.auxiliary || bone.parent === null) return bone;
    const actual = actualParentRest[bone.parent];
    const assumed = assumedParentRest[bone.parent];
    if (!actual || !assumed) return bone;
    return {
      ...bone,
      restTranslation: [bone.restTranslation[0] + assumed[0] - actual[0], bone.restTranslation[1] + assumed[1] - actual[1], bone.restTranslation[2] + assumed[2] - actual[2]],
    };
  });
}

/** 체인 수·입자 수 합계 */
export function outfitChainBudget(result: OutfitBuildResult): { chains: number; particles: number } {
  let particles = 0;
  for (const chain of result.chains) particles += chain.boneNames.length;
  return { chains: result.chains.length, particles };
}

/** 기본 스켈레톤 본 이름(55) 뒤에 outfit 보조 본을 이은 전체 본 이름 목록 */
export function outfitBoneNames(result: OutfitBuildResult): string[] {
  return [...HUMANOID_BONE_NAMES, ...result.bones.map((bone) => bone.name)];
}
