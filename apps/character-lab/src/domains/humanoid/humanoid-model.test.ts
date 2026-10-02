import { beforeAll, describe, expect, it } from "vitest";

import {
  ALL_FACS_MORPH_NAMES,
  BODY_PARAM_KEYS,
  FACE_PARAM_KEYS,
  HUMANOID_BONE_NAMES,
  HUMANOID_BONE_PARENTS,
  PART_ROLES,
  allParamMorphNames,
  allocatePartIds,
  isHumanoidBoneName,
  isLabFailure,
  validateMeshPartData,
} from "../../contracts";
import { recipeWithSlots } from "../../testing/recipe-fixtures";

import { STUB_AUX_BASE, countRayCrossings, createStubOutfitBuilder, type StubOutfitCalls, type StubOutfitOptions } from "./fixtures";
import { UPPER_TEETH_Y, LOWER_TEETH_Y } from "./geometry/mouth-builder";
import { mirrorMapX } from "./geometry/quad-mesh";
import { triMeshBounds, triMeshIsWatertight } from "./geometry/tri-mesh";
import {
  GEOMETRY_SLOT_KINDS,
  TRIANGLE_BUDGET,
  assumedHeadPivot,
  buildHumanoidModel,
  clearHumanoidBaseCache,
  collectMorphNames,
  combineOutfitResults,
  fitScalpSphere,
  geometryKeyOf,
  humanoidModelDigest,
  offsetAuxiliaryJointIndices,
  partIdOfRole,
  rebaseAuxiliaryRoots,
  resolveStyles,
  type HumanoidBuildOptions,
  type ProceduralHumanoidModel,
} from "./humanoid-model";
import { headAttachedBodyDelta } from "./morph/body-morphs";
import { isNegligibleDelta, isOppositeDelta, maxAbs, mirrorSymmetryError } from "./morph/morph-utils";
import { HEAD_LANDMARKS, resolveProportions } from "./proportions";
import { boneWorldMatrices, boneWorldPosition, skeletonWithJointOffsets, skinPositionsCpu } from "./skeleton/pose-math";

import type { BoneData, CharacterRecipe, MeshPartData, OutfitBuildResult, SlotKind, Vec3 } from "../../contracts";

const SEED = 20261001;

function build(recipe: CharacterRecipe, levels: HumanoidBuildOptions["subdivisionLevels"] = 1, stub: StubOutfitOptions = {}): { model: ProceduralHumanoidModel; calls: StubOutfitCalls } {
  const { builder, calls } = createStubOutfitBuilder(stub);
  return { model: buildHumanoidModel(recipe, { subdivisionLevels: levels, seed: SEED, outfit: builder }), calls };
}

function partOf(model: ProceduralHumanoidModel, role: (typeof PART_ROLES)[number]): MeshPartData {
  const part = model.parts.find((candidate) => candidate.role === role);
  if (!part) throw new Error(`역할 ${role} 파츠가 없습니다.`);
  return part;
}

function morphOf(part: MeshPartData, name: string): Float32Array {
  const morph = part.morphs.find((candidate) => candidate.name === name);
  if (!morph) throw new Error(`파츠 ${part.id}에 morph ${name}이 없습니다.`);
  return morph.deltaPositions;
}

const FULL_SLOTS: Partial<Record<SlotKind, `${SlotKind}/${string}`>> = { hair: "hair/soft-bob", top: "top/tee", bottom: "bottom/pleated-skirt", shoes: "shoes/sneakers", accessory: "accessory/ribbon" };
const BARE_SLOTS: Partial<Record<SlotKind, null>> = { hair: null, top: null, bottom: null, shoes: null, accessory: null };

describe("buildHumanoidModel — 기본 레시피(세분 1, 기본 레시피는 액세서리 없음)", () => {
  let model: ProceduralHumanoidModel;
  beforeAll(() => {
    model = build(recipeWithSlots({ bottom: "bottom/pleated-skirt" })).model;
  });

  it("역할 순서로 파츠 14개를 내고 모든 파츠가 validateMeshPartData를 통과한다", () => {
    expect(model.parts.map((part) => part.role)).toEqual(PART_ROLES.filter((role) => role !== "accessory"));
    expect(model.parts.every((part) => validateMeshPartData(part) === null)).toBe(true);
    expect(model.stats.partCount).toBe(14);
  });

  it("partId는 PART_ROLES 인덱스 + 1(planApply 기본 레이아웃과 동일)이고 materialId는 인덱스다", () => {
    for (const part of model.parts) {
      expect(part.partId).toBe(PART_ROLES.indexOf(part.role) + 1);
      expect(part.materialId).toBe(PART_ROLES.indexOf(part.role));
      expect(partIdOfRole(part.role)).toBe(part.partId);
    }
    expect(Object.keys(model.partIdPalette).map(Number)).toEqual(model.parts.map((part) => part.partId));
    expect(model.partIdPalette[partOf(model, "hair").partId]?.role).toBe("hair");
    expect(model.partIdPalette[partOf(model, "skin").partId]?.labelKo).toBe("피부");
  });

  it("정점·삼각형 수가 스펙 상한 안이고 통계가 파츠 합과 같다", () => {
    let vertices = 0;
    let triangles = 0;
    let morphs = 0;
    for (const part of model.parts) {
      vertices += part.positions.length / 3;
      triangles += part.indices.length / 3;
      morphs += part.morphs.length;
    }
    expect(triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET);
    expect(triangles).toBeGreaterThan(10_000);
    expect(model.stats).toMatchObject({ vertexCount: vertices, triangleCount: triangles, morphCount: morphs, subdivisionLevels: 1 });
    expect(model.stats.boneCount).toBe(model.skeleton.bones.length);
  });

  it("법선이 단위 길이이고 UV가 [0,1] 안이다(모든 파츠)", () => {
    let worstNormal = 0;
    let worstUv = 0;
    for (const part of model.parts) {
      for (let i = 0; i < part.normals.length; i += 3) worstNormal = Math.max(worstNormal, Math.abs(Math.hypot(part.normals[i], part.normals[i + 1], part.normals[i + 2]) - 1));
      for (let i = 0; i < part.uvs.length; i += 1) worstUv = Math.max(worstUv, -part.uvs[i], part.uvs[i] - 1);
    }
    expect(worstNormal).toBeLessThan(1e-3);
    expect(worstUv).toBeLessThan(1e-6);
  });

  it("스켈레톤 앞 55본이 HUMANOID_BONE_NAMES 순서·HUMANOID_BONE_PARENTS 계층이고 보조 본은 그 뒤 auxiliary다", () => {
    const bones = model.skeleton.bones;
    expect(bones.slice(0, 55).map((bone) => bone.name)).toEqual([...HUMANOID_BONE_NAMES]);
    for (const bone of bones.slice(0, 55)) {
      expect(isHumanoidBoneName(bone.name)).toBe(true);
      if (isHumanoidBoneName(bone.name)) expect(bone.parent).toBe(HUMANOID_BONE_PARENTS[bone.name]);
      expect(bone.auxiliary).toBeUndefined();
    }
    for (const bone of bones.slice(55)) expect(bone.auxiliary).toBe(true);
    expect(new Set(bones.map((bone) => bone.name)).size).toBe(bones.length);
    expect(bones.length).toBe(55 + model.stats.auxiliaryBoneCount);
  });

  it("스킨 웨이트 합이 1이고 영향 수가 4 이하이며 본 인덱스가 범위 안이다", () => {
    let worstSum = 0;
    let minWeight = 1;
    let maxIndex = 0;
    let maxInfluences = 0;
    for (const part of model.parts) {
      const { jointIndices, jointWeights } = part;
      expect(jointIndices && jointWeights).toBeTruthy();
      if (!jointIndices || !jointWeights) continue;
      expect(jointIndices).toHaveLength((part.positions.length / 3) * 4);
      for (let v = 0; v < part.positions.length / 3; v += 1) {
        let sum = 0;
        let influences = 0;
        for (let i = 0; i < 4; i += 1) {
          const weight = jointWeights[v * 4 + i];
          if (weight > 0) influences += 1;
          minWeight = Math.min(minWeight, weight);
          maxIndex = Math.max(maxIndex, jointIndices[v * 4 + i]);
          sum += weight;
        }
        maxInfluences = Math.max(maxInfluences, influences);
        worstSum = Math.max(worstSum, Math.abs(sum - 1));
      }
    }
    expect(minWeight).toBeGreaterThanOrEqual(0);
    expect(maxIndex).toBeLessThan(model.skeleton.bones.length);
    expect(maxInfluences).toBeLessThanOrEqual(4);
    expect(worstSum).toBeLessThan(1e-4);
  });

  it("morphNames가 체형 18 + 얼굴 30 + FACS 16 = 64개이고 파츠 morph 이름은 모두 그 안에 있다", () => {
    expect(model.morphNames).toEqual([...allParamMorphNames(BODY_PARAM_KEYS), ...allParamMorphNames(FACE_PARAM_KEYS), ...ALL_FACS_MORPH_NAMES]);
    expect(model.morphNames).toHaveLength(64);
    const known = new Set(model.morphNames);
    for (const part of model.parts) for (const morph of part.morphs) expect(known.has(morph.name)).toBe(true);
  });

  it("머리 파츠는 얼굴 30·FACS 16 morph를 모두 비영으로 갖고, 피부는 체형 morph를 갖는다", () => {
    const head = partOf(model, "head");
    for (const name of [...allParamMorphNames(FACE_PARAM_KEYS), ...ALL_FACS_MORPH_NAMES]) {
      expect(isNegligibleDelta(morphOf(head, name))).toBe(false);
    }
    const skin = partOf(model, "skin");
    for (const key of BODY_PARAM_KEYS) {
      if (key === "headSize") continue; // 머리 크기는 머리 케이지만 움직인다
      expect(isNegligibleDelta(morphOf(skin, `param:${key}:+`))).toBe(false);
      expect(isNegligibleDelta(morphOf(skin, `param:${key}:-`))).toBe(false);
    }
    expect(isNegligibleDelta(morphOf(head, "param:headSize:+"))).toBe(false);
    for (const part of model.parts) {
      for (const morph of part.morphs) expect(isNegligibleDelta(morph.deltaPositions)).toBe(false);
    }
  });

  it("모든 파라미터 morph의 +/− 델타가 반대 방향이고 얼굴 델타는 좌우 대칭이다", () => {
    const head = partOf(model, "head");
    const skin = partOf(model, "skin");
    const headMirror = mirrorMapX(head.positions, 1e-5);
    const skinMirror = mirrorMapX(skin.positions, 1e-5);
    for (const key of FACE_PARAM_KEYS) {
      const plus = morphOf(head, `param:${key}:+`);
      expect(isOppositeDelta(plus, morphOf(head, `param:${key}:-`))).toBe(true);
      expect(mirrorSymmetryError(plus, headMirror)).toBeLessThan(1e-4);
    }
    for (const key of BODY_PARAM_KEYS) {
      for (const part of [skin, head]) {
        const plusMorph = part.morphs.find((morph) => morph.name === `param:${key}:+`);
        const minusMorph = part.morphs.find((morph) => morph.name === `param:${key}:-`);
        expect(Boolean(plusMorph)).toBe(Boolean(minusMorph));
        if (!plusMorph || !minusMorph) continue;
        expect(isOppositeDelta(plusMorph.deltaPositions, minusMorph.deltaPositions, 1e-5)).toBe(true);
        expect(mirrorSymmetryError(plusMorph.deltaPositions, part === skin ? skinMirror : headMirror)).toBeLessThan(1e-4);
      }
    }
  });

  it("FACS 델타는 눈 감기를 뺀 모든 유닛이 좌우 대칭이다", () => {
    const head = partOf(model, "head");
    const mirror = mirrorMapX(head.positions, 1e-5);
    for (const name of ALL_FACS_MORPH_NAMES) {
      if (name === "facs:eyeBlinkLeft" || name === "facs:eyeBlinkRight") continue;
      expect(mirrorSymmetryError(morphOf(head, name), mirror)).toBeLessThan(1e-4);
    }
  });

  it("세분 후 피부·머리·안구 메시가 수밀이다", () => {
    for (const role of ["skin", "head", "eyeball"] as const) {
      const part = partOf(model, role);
      expect(triMeshIsWatertight(part.positions, part.indices)).toBe(true);
    }
  });

  it("CPU 스키닝: identity 포즈에서 모든 파츠(보조 본 포함)가 원형으로 복원된다", () => {
    const matrices = boneWorldMatrices(model.skeleton, {});
    let worst = 0;
    for (const part of model.parts) {
      const skinned = skinPositionsCpu(part, matrices);
      for (let i = 0; i < skinned.length; i += 1) worst = Math.max(worst, Math.abs(skinned[i] - part.positions[i]));
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it("머리 본 회전은 머리·눈을 움직이고 발·피부 하체는 그대로 둔다", () => {
    const half = Math.SQRT1_2;
    const matrices = boneWorldMatrices(model.skeleton, { head: [0, half, 0, half] });
    const head = partOf(model, "head");
    const skin = partOf(model, "skin");
    const movedHead = skinPositionsCpu(head, matrices);
    const movedSkin = skinPositionsCpu(skin, matrices);
    let headDelta = 0;
    for (let i = 0; i < movedHead.length; i += 1) headDelta = Math.max(headDelta, Math.abs(movedHead[i] - head.positions[i]));
    expect(headDelta).toBeGreaterThan(0.05);
    let lowerDelta = 0;
    for (let v = 0; v < skin.positions.length / 3; v += 1) {
      if (skin.positions[v * 3 + 1] > 0.5) continue;
      for (let k = 0; k < 3; k += 1) lowerDelta = Math.max(lowerDelta, Math.abs(movedSkin[v * 3 + k] - skin.positions[v * 3 + k]));
    }
    expect(lowerDelta).toBeLessThan(1e-5);
    const eyeball = partOf(model, "eyeball");
    const movedEye = skinPositionsCpu(eyeball, boneWorldMatrices(model.skeleton, { leftEye: [0, half, 0, half] }));
    let eyeDelta = 0;
    for (let i = 0; i < movedEye.length; i += 1) eyeDelta = Math.max(eyeDelta, Math.abs(movedEye[i] - eyeball.positions[i]));
    expect(eyeDelta).toBeGreaterThan(0.005);
  });

  it("입: jawOpen morph와 jaw 본 회전이 같이 아래 입술·아랫니·혀를 내리고 위 입술·윗니·이마는 그대로 둔다(둘이 근사 일치)", () => {
    const head = partOf(model, "head");
    const frame = resolveProportions({}).head;
    const line = HEAD_LANDMARKS.mouth[1];
    const localY = (positions: Float32Array, v: number): number => (positions[v * 3 + 1] - frame.center[1]) / frame.scale;
    const lipVertices = (upper: boolean): number[] => {
      const out: number[] = [];
      for (let v = 0; v < head.positions.length / 3; v += 1) {
        const x = (head.positions[v * 3] - frame.center[0]) / frame.scale;
        const z = (head.positions[v * 3 + 2] - frame.center[2]) / frame.scale;
        const y = localY(head.positions, v);
        if (Math.abs(x) < 0.05 && z > 0.7 && (upper ? y > line + 0.03 && y < line + 0.15 : y < line - 0.03 && y > line - 0.15)) out.push(v);
      }
      return out;
    };
    const upper = lipVertices(true);
    const lower = lipVertices(false);
    expect(upper.length).toBeGreaterThan(3);
    expect(lower.length).toBeGreaterThan(3);
    const theta = 0.35;
    const matrices = boneWorldMatrices(model.skeleton, { jaw: [Math.sin(theta / 2), 0, 0, Math.cos(theta / 2)] });
    const byBone = skinPositionsCpu(head, matrices);
    const jawOpen = morphOf(head, "facs:jawOpen");
    for (const v of upper) {
      expect(Math.abs(byBone[v * 3 + 1] - head.positions[v * 3 + 1])).toBeLessThan(1e-3);
      expect(Math.abs(jawOpen[v * 3 + 1])).toBeLessThan(1e-3);
    }
    for (const v of lower) {
      const boneDrop = head.positions[v * 3 + 1] - byBone[v * 3 + 1];
      const morphDrop = -jawOpen[v * 3 + 1];
      expect(boneDrop).toBeGreaterThan(0.012);
      expect(morphDrop).toBeGreaterThan(0.012);
      // 선형 블렌드 스키닝과 각도 비례 morph는 소각에서 근사 일치(4 mm 이내)
      expect(Math.abs(boneDrop - morphDrop)).toBeLessThan(0.004);
    }
    // 아랫니·혀는 jaw 본에 강체로 붙어 같이 내려가고 윗니는 head를 따른다
    const teeth = partOf(model, "teeth");
    const movedTeeth = skinPositionsCpu(teeth, matrices);
    const midY = frame.center[1] + ((UPPER_TEETH_Y + LOWER_TEETH_Y) / 2) * frame.scale;
    let lowerTeethDrop = Infinity;
    let upperTeethShift = 0;
    for (let v = 0; v < teeth.positions.length / 3; v += 1) {
      const dy = teeth.positions[v * 3 + 1] - movedTeeth[v * 3 + 1];
      if (teeth.positions[v * 3 + 1] < midY) lowerTeethDrop = Math.min(lowerTeethDrop, dy);
      else upperTeethShift = Math.max(upperTeethShift, Math.abs(dy));
    }
    expect(lowerTeethDrop).toBeGreaterThan(0.005);
    expect(upperTeethShift).toBeLessThan(1e-6);
  });

  it("체형 morph가 실제 형상을 바꾼다: 키 ±는 머리 높이를, 팔 길이 +는 손끝 x 범위를 바꾼다", () => {
    const skin = partOf(model, "skin");
    const head = partOf(model, "head");
    const apply = (part: MeshPartData, name: string, weight: number): Float32Array => {
      const out = new Float32Array(part.positions);
      const delta = morphOf(part, name);
      for (let i = 0; i < out.length; i += 1) out[i] += delta[i] * weight;
      return out;
    };
    const topY = (positions: Float32Array): number => triMeshBounds(positions).max[1];
    const base = topY(head.positions);
    expect(topY(apply(head, "param:height:+", 1))).toBeGreaterThan(base + 0.08);
    expect(topY(apply(head, "param:height:-", 1))).toBeLessThan(base - 0.08);
    const baseSpan = triMeshBounds(skin.positions).max[0];
    expect(triMeshBounds(apply(skin, "param:armLength:+", 1)).max[0]).toBeGreaterThan(baseSpan + 0.04);
    expect(triMeshBounds(apply(skin, "param:armLength:-", 1)).max[0]).toBeLessThan(baseSpan - 0.04);
    // 발바닥은 전신 배율(원점 기준)에도 지면(1 cm 이내)에 남는다
    expect(triMeshBounds(apply(skin, "param:height:+", 1)).min[1]).toBeLessThan(0.01);
    expect(triMeshBounds(apply(skin, "param:height:+", 1)).min[1]).toBeGreaterThan(-0.01);
  });

  it("관절 오프셋: 체형 morph ±와 같은 이름으로 팔 길이 + 시 손목이 바깥으로 움직인다", () => {
    expect(Object.keys(model.jointOffsets)).toHaveLength(18);
    expect(model.jointOffsets["param:armLength:+"]?.leftHand?.[0]).toBeGreaterThan(0.01);
    expect(model.jointOffsets["param:armLength:+"]?.rightHand?.[0]).toBeLessThan(-0.01);
    expect(model.jointOffsets["param:armLength:-"]?.leftHand?.[0]).toBeLessThan(-0.01);
    expect(model.jointOffsets["param:waist:+"]).toEqual({});
  });

  it("관절 오프셋을 rest 본에 반영하면 morph된 팔이 새 팔꿈치를 중심으로 회전한다(반영하지 않으면 옛 팔꿈치 기준이라 거리가 어긋난다)", () => {
    const skin = partOf(model, "skin");
    const morphed = new Float32Array(skin.positions);
    const armDelta = morphOf(skin, "param:armLength:+");
    for (let i = 0; i < morphed.length; i += 1) morphed[i] += armDelta[i];
    const weights = { "param:armLength:+": 1 };
    const adjusted = skeletonWithJointOffsets(model.skeleton, model.jointOffsets, weights);
    expect(adjusted.bones).toHaveLength(model.skeleton.bones.length);
    expect(skeletonWithJointOffsets(model.skeleton, model.jointOffsets, {}).bones).toEqual(model.skeleton.bones);
    // 왼손 끝 정점(가장 바깥 x)
    let tip = 0;
    for (let v = 1; v < morphed.length / 3; v += 1) if (morphed[v * 3] > morphed[tip * 3]) tip = v;
    const part = { positions: morphed, jointIndices: skin.jointIndices, jointWeights: skin.jointWeights };
    const rotation = { leftLowerArm: [0, 0, -Math.SQRT1_2, Math.SQRT1_2] as const };
    const distanceToElbow = (skeleton: typeof model.skeleton, elbowSkeleton: typeof model.skeleton): { before: number; after: number } => {
      const restElbow = boneWorldPosition(boneWorldMatrices(elbowSkeleton, {}), "leftLowerArm");
      const posed = skinPositionsCpu(part, boneWorldMatrices(skeleton, rotation));
      const rest = skinPositionsCpu(part, boneWorldMatrices(skeleton, {}));
      if (!restElbow) throw new Error("팔꿈치 본이 없습니다.");
      const dist = (positions: Float32Array): number => Math.hypot(positions[tip * 3] - restElbow[0], positions[tip * 3 + 1] - restElbow[1], positions[tip * 3 + 2] - restElbow[2]);
      return { before: dist(rest), after: dist(posed) };
    };
    const withOffsets = distanceToElbow(adjusted, adjusted);
    expect(withOffsets.before).toBeGreaterThan(0.3);
    expect(Math.abs(withOffsets.after - withOffsets.before)).toBeLessThan(1e-3);
    // 대조: 본을 옮기지 않으면 morph된 손끝이 옛 팔꿈치 둘레로 돌아 새 팔꿈치 기준 거리가 크게 변한다
    const without = distanceToElbow(model.skeleton, adjusted);
    expect(Math.abs(without.after - without.before)).toBeGreaterThan(0.005);
  });

  it("충돌 캡슐 14개가 휴머노이드 본에 걸려 있다", () => {
    expect(model.colliders).toHaveLength(14);
    for (const collider of model.colliders) {
      expect(isHumanoidBoneName(collider.bone)).toBe(true);
      expect(collider.radius).toBeGreaterThan(0);
    }
  });

  it("스펙 정점·삼각형 수치를 출력한다(세분 0/1/2) — 모두 예산 안", () => {
    const counts = ([0, 1, 2] as const).map((levels) => build(recipeWithSlots({ ...FULL_SLOTS }), levels).model.stats);
    expect(counts.map((stats) => stats.subdivisionLevels)).toEqual([0, 1, 2]);
    expect(counts[0].triangleCount).toBeLessThan(counts[1].triangleCount);
    expect(counts[1].triangleCount).toBeLessThan(counts[2].triangleCount);
    for (const stats of counts) {
      expect(stats.triangleCount).toBeLessThanOrEqual(TRIANGLE_BUDGET);
      expect(stats.morphCount).toBeGreaterThan(200);
    }
  }, 60000);
});

describe("buildHumanoidModel — 입 안 공동과 morph 극값", () => {
  it("모든 morph(체형·얼굴 ±1, FACS 1)와 대표 표정 조합에서 치아·혀가 피부 고체에 파묻히지 않는다(혀 내밀기 제외)", () => {
    const model = build(recipeWithSlots({ ...BARE_SLOTS }), 0).model;
    const head = partOf(model, "head");
    const teeth = partOf(model, "teeth");
    const tongue = partOf(model, "tongue");
    const applied = (part: MeshPartData, weights: Record<string, number>): Float32Array => {
      const out = new Float32Array(part.positions);
      for (const morph of part.morphs) {
        const weight = weights[morph.name];
        if (weight) for (let i = 0; i < out.length; i += 1) out[i] += morph.deltaPositions[i] * weight;
      }
      return out;
    };
    const cases: Array<[string, Record<string, number>]> = model.morphNames.filter((name) => name !== "facs:tongueOut").map((name) => [name, { [name]: 1 }]);
    cases.push(["웃음", { "facs:mouthSmile": 1, "facs:jawOpen": 0.3, "facs:cheekPuff": 0.5, "facs:eyeSquint": 1 }]);
    cases.push(["공포", { "facs:jawOpen": 0.8, "facs:mouthFrown": 1, "facs:browInnerUp": 1 }]);
    cases.push(["삐죽", { "facs:mouthPucker": 1, "facs:mouthFunnel": 0.6, "facs:cheekPuff": 1 }]);
    const failures: string[] = [];
    for (const [label, weights] of cases) {
      const headPositions = applied(head, weights);
      for (const part of [teeth, tongue]) {
        const moved = applied(part, weights);
        let inside = 0;
        for (let v = 0; v < moved.length / 3; v += 1) {
          if (countRayCrossings([moved[v * 3], moved[v * 3 + 1], moved[v * 3 + 2]], headPositions, head.indices) % 2 === 1) inside += 1;
        }
        if (inside > 0) failures.push(`${label}/${part.role}: ${inside}`);
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);
});

describe("buildHumanoidModel — 결정성·캐시", () => {
  it("같은 입력이면 digest가 같고, 기준 캐시를 비워도 바이트가 같다", () => {
    const recipe = recipeWithSlots({ ...FULL_SLOTS });
    clearHumanoidBaseCache();
    const cold = humanoidModelDigest(build(recipe).model);
    const warm = humanoidModelDigest(build(recipe).model);
    clearHumanoidBaseCache();
    const again = humanoidModelDigest(build(recipe).model);
    expect(warm).toBe(cold);
    expect(again).toBe(cold);
    expect(cold).toMatch(/^[0-9a-f]{16}$/u);
  }, 60000);

  it("반환 모델의 버퍼를 바꿔도 다음 빌드(캐시)가 오염되지 않는다", () => {
    const recipe = recipeWithSlots({ ...FULL_SLOTS });
    const first = build(recipe).model;
    const digest = humanoidModelDigest(first);
    for (const part of first.parts) {
      part.positions.fill(7);
      part.jointWeights?.fill(0);
      for (const morph of part.morphs) morph.deltaPositions.fill(3);
    }
    for (const bone of first.skeleton.bones) (bone.restTranslation as Vec3 & number[]).fill(5);
    first.colliders.forEach((collider) => (collider.a as Vec3 & number[]).fill(5));
    expect(humanoidModelDigest(build(recipe).model)).toBe(digest);
  }, 60000);

  it("슬롯이 다르면 digest가 다르다(헤어 스타일·눈 스타일)", () => {
    const digestOf = (slots: Partial<Record<SlotKind, `${SlotKind}/${string}`>>): string => humanoidModelDigest(build(recipeWithSlots(slots)).model);
    const bob = digestOf({ hair: "hair/soft-bob", eyes: "eyes/almond" });
    const pony = digestOf({ hair: "hair/action-pony", eyes: "eyes/almond" });
    const round = digestOf({ hair: "hair/soft-bob", eyes: "eyes/round" });
    const cat = digestOf({ hair: "hair/soft-bob", eyes: "eyes/almond", irises: "irises/cat" });
    expect(new Set([bob, pony, round, cat]).size).toBe(4);
  }, 60000);

  it("체형·얼굴 파라미터·색은 지오메트리에 영향이 없다(플랜의 morph 가중치로만 적용)", () => {
    const base = recipeWithSlots({ ...FULL_SLOTS });
    const shaped: CharacterRecipe = { ...base, body: { height: 0.7, armLength: -0.4 }, face: { eyeSize: 1, noseDepth: -1 }, colors: { ...base.colors, skin: "#4a2c1b" } };
    expect(humanoidModelDigest(build(shaped).model)).toBe(humanoidModelDigest(build(base).model));
    expect(geometryKeyOf(shaped)).toBe(geometryKeyOf(base));
  }, 60000);
});

describe("buildHumanoidModel — 역할·partId 정렬", () => {
  it("모든 슬롯을 채우면 15파츠이고 partIdPalette가 allocatePartIds와 같다", () => {
    const { model } = build(recipeWithSlots({ ...FULL_SLOTS }));
    expect(model.parts).toHaveLength(15);
    expect(model.partIdPalette).toEqual(allocatePartIds(model.parts));
    expect(model.parts.map((part) => part.partId)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it("의상·헤어 슬롯이 비면 파츠 10개(피부·머리·눈·눈썹·속눈썹·치아·혀)이고 보조 본·체인이 없다", () => {
    const { model, calls } = build(recipeWithSlots({ ...BARE_SLOTS }));
    expect(model.parts.map((part) => part.role)).toEqual(["skin", "head", "eyeball", "iris", "pupil", "eye-highlight", "brow", "lash", "teeth", "tongue"]);
    expect(model.skeleton.bones).toHaveLength(55);
    expect(model.chains).toEqual([]);
    expect(calls.hair).toHaveLength(0);
    expect(calls.garments).toHaveLength(0);
  });

  it("결손 역할이 있어도 나머지 partId가 밀리지 않는다(헤어 없음 → 상의 partId 12, 11은 비어 있다)", () => {
    const { model } = build(recipeWithSlots({ hair: null, top: "top/tee", bottom: null, shoes: "shoes/loafers", accessory: null }));
    expect(partOf(model, "top").partId).toBe(12);
    expect(partOf(model, "shoes").partId).toBe(14);
    expect(model.partIdPalette[11]).toBeUndefined();
    expect(model.partIdPalette[12]?.role).toBe("top");
    expect(model.parts.every((part) => validateMeshPartData(part) === null)).toBe(true);
  });

  it("눈·홍채 스타일은 눈 파츠만 바꾸고 피부·머리 바이트는 같다", () => {
    const almond = build(recipeWithSlots({ eyes: "eyes/almond", irises: "irises/round-large" })).model;
    const wide = build(recipeWithSlots({ eyes: "eyes/wide", irises: "irises/cat" })).model;
    for (const role of ["skin", "head", "teeth", "tongue", "brow"] as const) {
      expect(Buffer.from(partOf(almond, role).positions.buffer).equals(Buffer.from(partOf(wide, role).positions.buffer))).toBe(true);
    }
    for (const role of ["eyeball", "iris", "lash"] as const) {
      expect(Buffer.from(partOf(almond, role).positions.buffer).equals(Buffer.from(partOf(wide, role).positions.buffer))).toBe(false);
    }
  });

  it("눈·홍채 슬롯이 비면 기본 스타일로 파츠를 만든다(가시성은 플랜이 숨긴다)", () => {
    const styles = resolveStyles(recipeWithSlots({ eyes: null, irises: null }));
    expect(styles.eyes).toBe("almond");
    expect(styles.irises).toBe("round-large");
    const { model } = build(recipeWithSlots({ eyes: null, irises: null }));
    expect(partOf(model, "eyeball").positions.length).toBeGreaterThan(0);
  });

  it("절차 어휘 밖 프리셋은 fail-visible로 거부한다(무음 대체 없음)", () => {
    const recipe = recipeWithSlots({ hair: "hair/not-a-style" });
    let thrown: unknown = null;
    try {
      build(recipe);
    } catch (error) {
      thrown = error;
    }
    expect(isLabFailure(thrown)).toBe(true);
    if (isLabFailure(thrown)) {
      expect(thrown.code).toBe("humanoid-unknown-style");
      expect(thrown.reasonKo).toContain("헤어");
    }
  });

  it("geometryKeyOf는 지오메트리 슬롯만 반영한다", () => {
    expect(GEOMETRY_SLOT_KINDS).toEqual(["eyes", "irises", "hair", "top", "bottom", "shoes", "accessory"]);
    const a = geometryKeyOf(recipeWithSlots({ hair: "hair/soft-bob", expression: "expression/joy" }));
    const b = geometryKeyOf(recipeWithSlots({ hair: "hair/soft-bob", expression: "expression/sad", pose: "pose/idle" }));
    const c = geometryKeyOf(recipeWithSlots({ hair: "hair/twin-tail" }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(geometryKeyOf(recipeWithSlots({ accessory: null }))).toContain("accessory=-");
  });
});

describe("buildHumanoidModel — outfit 포트 규약(스텁)", () => {
  it("DI 포트가 두피·몸 표면·체형 morph·시드·색을 받는다", () => {
    const recipe = recipeWithSlots({ ...FULL_SLOTS });
    const { model, calls } = build(recipe);
    expect(calls.hair).toHaveLength(1);
    expect(calls.hair[0].style).toBe("soft-bob");
    expect(calls.hair[0].context.seed).toBe(SEED);
    expect(calls.hair[0].context.colors).toEqual(recipe.colors);
    const scalp = calls.hair[0].scalp;
    expect(scalp.samples.length).toBeGreaterThan(50);
    expect(scalp.radius).toBeGreaterThan(0.08);
    expect(scalp.radius).toBeLessThan(0.2);
    expect(scalp.center[1]).toBeGreaterThan(1.4);
    expect(Math.abs(scalp.center[0])).toBeLessThan(1e-6);
    expect(calls.garments).toHaveLength(1);
    expect(calls.garments[0].selection).toEqual({ top: "tee", bottom: "pleated-skirt", shoes: "sneakers", accessory: "ribbon" });
    const body = calls.garments[0].body;
    const vertexCount = body.positions.length / 3;
    expect(vertexCount).toBe(partOf(model, "skin").positions.length / 3 + partOf(model, "head").positions.length / 3);
    expect(body.regionOfVertex).toHaveLength(vertexCount);
    expect(body.jointWeights).toHaveLength(vertexCount * 4);
    expect(body.bounds.max[1]).toBeGreaterThan(1.6);
    const morphNames = calls.garments[0].bodyMorphs.map((morph) => morph.name);
    expect(morphNames).toEqual([...allParamMorphNames(BODY_PARAM_KEYS)]);
    for (const morph of calls.garments[0].bodyMorphs) expect(morph.deltaPositions).toHaveLength(vertexCount * 3);
  });

  it("보조 본 인덱스가 55 기준으로 합쳐져 각 파츠가 자기 본을 가리킨다(두 번째 결과는 첫 결과의 본 수만큼 이동)", () => {
    const { model } = build(recipeWithSlots({ ...FULL_SLOTS }));
    const names = model.skeleton.bones.map((bone) => bone.name);
    expect(names.slice(55)).toEqual(["hair_soft-bob_0_0", "hair_soft-bob_0_1", "skirt_0_0", "skirt_0_1", "ribbon_0_0"]);
    // 영향 가중치 0인 슬롯(0번 본으로 채워짐)은 제외하고 실제로 영향을 주는 본 이름만 모은다
    const boneNamesOf = (part: MeshPartData): Set<string> => {
      const used = new Set<string>();
      part.jointIndices?.forEach((index, i) => {
        if ((part.jointWeights?.[i] ?? 0) > 0) used.add(names[index]);
      });
      return used;
    };
    expect(boneNamesOf(partOf(model, "hair"))).toEqual(new Set(["hair_soft-bob_0_0", "hair_soft-bob_0_1"]));
    expect(boneNamesOf(partOf(model, "bottom"))).toEqual(new Set(["skirt_0_0", "skirt_0_1"]));
    expect(boneNamesOf(partOf(model, "accessory"))).toEqual(new Set(["ribbon_0_0"]));
    expect(boneNamesOf(partOf(model, "top"))).toEqual(new Set(["chest"]));
    expect(model.chains.map((chain) => chain.id)).toEqual(["hair-soft-bob-0", "skirt-0", "ribbon-0"]);
    expect(model.stats.chainCount).toBe(3);
    expect(model.stats.auxiliaryBoneCount).toBe(5);
  });

  it("보조 루트 본은 (추정 피벗 − 실제 rest 위치)로 보정된다", () => {
    const { model, calls } = build(recipeWithSlots({ ...FULL_SLOTS }));
    const matrices = boneWorldMatrices(model.skeleton, {});
    const worldOf = (name: string): Vec3 => {
      const m = matrices.world[matrices.order.indexOf(name)];
      return [m[12], m[13], m[14]];
    };
    const assumed = assumedHeadPivot(calls.hair[0].scalp);
    const head = worldOf("head");
    const hairRoot = model.skeleton.bones.find((bone) => bone.name === "hair_soft-bob_0_0");
    expect(hairRoot?.restTranslation[0]).toBeCloseTo(assumed[0] - head[0], 5);
    expect(hairRoot?.restTranslation[1]).toBeCloseTo(assumed[1] - head[1], 5);
    expect(hairRoot?.restTranslation[2]).toBeCloseTo(assumed[2] - head[2], 5);
    // 보정된 보조 루트의 월드 위치 = 추정 피벗(체인 restPoints는 모델 공간이라 보정과 무관)
    const world = worldOf("hair_soft-bob_0_0");
    expect(world[1]).toBeCloseTo(assumed[1], 4);
    // 자식 본(비루트)은 보정하지 않는다
    expect(model.skeleton.bones.find((bone) => bone.name === "hair_soft-bob_0_1")?.restTranslation).toEqual([0, -0.05, 0]);
  });

  it("헤어의 param:headSize:± morph는 outfit 값이 아니라 머리 프레임 델타로 대체된다", () => {
    const { model, calls } = build(recipeWithSlots({ hair: "hair/soft-bob", top: null, bottom: null, shoes: null }));
    const hair = partOf(model, "hair");
    const headSize = morphOf(hair, "param:headSize:+");
    expect(Array.from(headSize).every((value) => value === 9)).toBe(false);
    const expected = headAttachedBodyDelta(hair.positions, resolveProportions({}).head, resolveProportions({ headSize: 1 }).head);
    for (let i = 0; i < expected.length; i += 1) expect(Math.abs(headSize[i] - expected[i])).toBeLessThan(1e-6);
    expect(maxAbs(morphOf(hair, "param:headSize:-"))).toBeGreaterThan(0);
    expect(calls.garments).toHaveLength(0);
    // 키·다리·목 길이도 머리를 따라 움직이는 체형 morph를 갖는다(머리 프레임이 변하는 파라미터만)
    expect(hair.morphs.map((morph) => morph.name).sort()).toEqual(
      ["height", "legLength", "headSize", "neckLength"].flatMap((key) => [`param:${key}:+`, `param:${key}:-`]).sort(),
    );
  });

  it("의상 파츠의 체형 morph 이름이 morphNames에 포함된다", () => {
    const { model } = build(recipeWithSlots({ ...FULL_SLOTS }));
    expect(partOf(model, "top").morphs.map((morph) => morph.name)).toEqual(["param:height:+"]);
    expect(model.morphNames).toContain("param:height:+");
    expect(partOf(model, "top").morphs[0].deltaNormals).toHaveLength(12);
  });

  it("같은 역할의 outfit 파츠는 한 파츠로 병합되고 인덱스·스킨이 유효하다", () => {
    const { model } = build(recipeWithSlots({ hair: "hair/soft-bob", top: null, bottom: null, shoes: null }), 1, { splitHair: true });
    const hair = partOf(model, "hair");
    expect(model.parts.filter((part) => part.role === "hair")).toHaveLength(1);
    expect(hair.positions.length / 3).toBe(8);
    expect(Array.from(hair.indices)).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    expect(validateMeshPartData(hair)).toBeNull();
    // 첫 조각만 가진 morph는 둘째 조각에서 0으로 채워진다
    expect(morphOf(hair, "param:height:+")).toHaveLength(24);
  });

  it("체인이 없는 본을 가리키면 fail-visible로 실패한다", () => {
    expect(() => build(recipeWithSlots({ hair: "hair/soft-bob" }), 1, { brokenChain: true })).toThrowError(expect.objectContaining({ code: "humanoid-chain-bone-missing" }));
  });

  it("스켈레톤 범위를 벗어난 본 인덱스는 fail-visible로 실패한다", () => {
    expect(() => build(recipeWithSlots({ hair: "hair/soft-bob" }), 1, { outOfRangeJoint: true })).toThrowError(expect.objectContaining({ code: "humanoid-joint-index-range" }));
  });
});

describe("조립 보조 함수", () => {
  it("fitScalpSphere는 구 위 점에서 중심 y·z와 반경을 복원하고 x는 0으로 고정한다", () => {
    const points: Vec3[] = [];
    for (let i = 0; i < 40; i += 1) {
      const theta = (i / 40) * Math.PI * 2;
      const phi = (i % 7) / 7;
      points.push([0.1 * Math.sin(phi) * Math.cos(theta), 1.5 + 0.1 * Math.cos(phi) * 0.9 + 0.01 * Math.sin(theta), 0.02 + 0.1 * Math.sin(phi) * Math.sin(theta)]);
    }
    const fit = fitScalpSphere(points, [0, 1.5, 0]);
    expect(fit.center[0]).toBe(0);
    expect(fit.center[1]).toBeGreaterThan(1.4);
    expect(fit.center[1]).toBeLessThan(1.6);
    expect(fit.radius).toBeGreaterThan(0.08);
    for (const p of points) expect(Math.hypot(p[0] - fit.center[0], p[1] - fit.center[1], p[2] - fit.center[2])).toBeLessThanOrEqual(fit.radius + 1e-9);
  });

  it("fitScalpSphere는 점이 4개 미만이면 대체 중심을 쓴다", () => {
    const fit = fitScalpSphere([[0, 1, 0.1]], [0, 1, 0]);
    expect(fit.center).toEqual([0, 1, 0]);
    expect(fit.radius).toBeCloseTo(0.1, 9);
  });

  it("offsetAuxiliaryJointIndices는 55 이상만 민다", () => {
    const part: MeshPartData = {
      id: "p",
      role: "hair",
      partId: 0,
      materialId: 0,
      materialPreset: "hair-aniso",
      positions: new Float32Array(3),
      normals: new Float32Array(3),
      uvs: new Float32Array(2),
      indices: new Uint32Array(0),
      jointIndices: new Uint16Array([3, STUB_AUX_BASE, STUB_AUX_BASE + 2, 54]),
      jointWeights: new Float32Array([0.25, 0.25, 0.25, 0.25]),
      morphs: [],
    };
    const moved = offsetAuxiliaryJointIndices(part, 4);
    expect(Array.from(moved.jointIndices ?? [])).toEqual([3, STUB_AUX_BASE + 4, STUB_AUX_BASE + 6, 54]);
    expect(Array.from(part.jointIndices ?? [])).toEqual([3, STUB_AUX_BASE, STUB_AUX_BASE + 2, 54]);
    expect(offsetAuxiliaryJointIndices(part, 0)).toBe(part);
  });

  it("combineOutfitResults는 뒤 결과의 보조 본 인덱스만 앞 결과 본 수만큼 민다", () => {
    const bone = (name: string): BoneData => ({ name, parent: "head", restTranslation: [0, 0, 0], restRotation: [0, 0, 0, 1], auxiliary: true });
    const { builder } = createStubOutfitBuilder();
    const scalp = { center: [0, 1.5, 0] as Vec3, radius: 0.1, up: [0, 1, 0] as Vec3, forward: [0, 0, 1] as Vec3, samples: [] };
    const hair = builder.buildHair("soft-bob", scalp, { seed: 1, colors: recipeWithSlots({}).colors, headSize: 1 });
    const combined: OutfitBuildResult = combineOutfitResults([hair, { parts: hair.parts, bones: [bone("x")], chains: [] }]);
    expect(combined.bones).toHaveLength(3);
    expect(Array.from(combined.parts[1].jointIndices ?? []).filter((index) => index >= STUB_AUX_BASE)).toEqual([STUB_AUX_BASE + 2, STUB_AUX_BASE + 2, STUB_AUX_BASE + 3, STUB_AUX_BASE + 3]);
  });

  it("rebaseAuxiliaryRoots는 auxiliary 루트(부모가 휴머노이드)만 보정하고 위치를 모르는 부모는 그대로 둔다", () => {
    const bones: BoneData[] = [
      { name: "a", parent: "head", restTranslation: [0, 0, 0], restRotation: [0, 0, 0, 1], auxiliary: true },
      { name: "b", parent: "a", restTranslation: [0, -1, 0], restRotation: [0, 0, 0, 1], auxiliary: true },
      { name: "c", parent: "hips", restTranslation: [1, 1, 1], restRotation: [0, 0, 0, 1], auxiliary: true },
      { name: "d", parent: "spine", restTranslation: [1, 1, 1], restRotation: [0, 0, 0, 1] },
    ];
    const out = rebaseAuxiliaryRoots(bones, { head: [0, 1.5, 0], hips: [0, 0.9, 0] }, { head: [0, 1.4, 0.01] });
    expect(out[0].restTranslation).toEqual([0, 1.4 - 1.5, 0.01]);
    expect(out[1].restTranslation).toEqual([0, -1, 0]);
    expect(out[2].restTranslation).toEqual([1, 1, 1]);
    expect(out[3]).toBe(bones[3]);
  });

  it("collectMorphNames는 규약 순서로 정렬하고 규약 밖 이름은 등장 순으로 뒤에 둔다", () => {
    const make = (names: string[]): MeshPartData => ({
      id: "p",
      role: "skin",
      partId: 1,
      materialId: 0,
      materialPreset: "skin-sss",
      positions: new Float32Array(3),
      normals: new Float32Array(3),
      uvs: new Float32Array(2),
      indices: new Uint32Array(0),
      morphs: names.map((name) => ({ name, deltaPositions: new Float32Array(3) })),
    });
    const names = collectMorphNames([make(["facs:jawOpen", "custom:b", "param:height:-"]), make(["param:height:+", "custom:a"])]);
    expect(names).toEqual(["param:height:+", "param:height:-", "facs:jawOpen", "custom:b", "custom:a"]);
  });
});
