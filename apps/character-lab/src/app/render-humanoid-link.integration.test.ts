/**
 * render × humanoid 결합 검증(영역 교차 import는 도메인 안에서 금지라 app에서만 가능). GPU 없이 Node에서 돌며 실제 휴머노이드 모델
 * (`buildHumanoidModel`)을 NullEngine 하네스에 올려 다음을 확인한다.
 *
 * 1. §4.1 관절 오프셋 소비: 체형 morph 가중치 + 포즈를 플랜으로 적용했을 때 엔진 장면의 스킨된 정점이 humanoid 기준 구현
 *    (`skeletonWithJointOffsets` + `boneWorldMatrices` + `skinPositionsCpu`)과 같다. 오프셋을 반영하지 않으면(`jointOffsets` 제거) 5 mm 넘게 어긋난다.
 * 2. §4.3 입 안 UV 섬: render의 `mouth-shade.ts` 상수가 humanoid `uv-layout.ts`의 `MOUTH_TUBE_RECT`·`MOUTH_CAP_RECT`와 같다(값 복제의 일치 확인).
 *
 * GPU 정점 셰이더(본 텍스처·morph 텍스처)는 NullEngine이 실행하지 못하므로 같은 식의 CPU 스키닝(`render/testing/cpu-skinning.ts`)으로 비교한다.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createDefaultRecipe, paramMorphName } from "../contracts";
import { MOUTH_CAP_RECT, MOUTH_TUBE_RECT } from "../domains/humanoid/geometry/uv-layout";
import { buildHumanoidModel } from "../domains/humanoid/humanoid-model";
import { boneWorldMatrices, skeletonWithJointOffsets, skinPositionsCpu } from "../domains/humanoid/skeleton/pose-math";
import { createOutfitBuilder } from "../domains/outfit";
import { MOUTH_CAP_UV, MOUTH_TUBE_UV, generateMouthMask, isMouthInteriorUv } from "../render/mouth-shade";
import { skinnedPositionsByName } from "../render/testing/cpu-skinning";
import { createNullEngineHarness } from "../render/testing/null-engine-harness";
import { mulberry32 } from "../shared/prng";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { PROCEDURAL_SEED } from "./composition";

import type { CharacterRecipe, HumanoidBoneName, MeshPartData, Pose, Quat } from "../contracts";
import type { ProceduralHumanoidModel } from "../domains/humanoid/humanoid-model";
import type { NullEngineHarness } from "../render/testing/null-engine-harness";

const outfit = createOutfitBuilder();

function bareRecipe(): CharacterRecipe {
  const base = createDefaultRecipe();
  return { ...base, slots: { ...base.slots, hair: null, top: null, bottom: null, shoes: null, accessory: null } };
}

function build(): ProceduralHumanoidModel {
  return buildHumanoidModel(bareRecipe(), { subdivisionLevels: 0, seed: PROCEDURAL_SEED, outfit });
}

let harness: NullEngineHarness | null = null;
afterEach(() => {
  harness?.dispose();
  harness = null;
});

function quatAxisAngle(axis: "x" | "y" | "z", degrees: number): Quat {
  const half = (degrees * Math.PI) / 360;
  const s = Math.sin(half);
  return [axis === "x" ? s : 0, axis === "y" ? s : 0, axis === "z" ? s : 0, Math.cos(half)];
}

function maxDistance(a: Float32Array, b: Float32Array): number {
  expect(a.length).toBe(b.length);
  let worst = 0;
  for (let v = 0; v < a.length / 3; v += 1) worst = Math.max(worst, Math.hypot((a[v * 3] as number) - (b[v * 3] as number), (a[v * 3 + 1] as number) - (b[v * 3 + 1] as number), (a[v * 3 + 2] as number) - (b[v * 3 + 2] as number)));
  return worst;
}

/** 휴머노이드 기준: morph된 정점을 morph된 rest 본·역바인드로 스킨한다 */
function reference(model: ProceduralHumanoidModel, part: MeshPartData, weights: Readonly<Record<string, number>>, pose: Pose): Float32Array {
  const morphed = new Float32Array(part.positions);
  for (const morph of part.morphs) {
    const weight = weights[morph.name];
    if (weight) for (let i = 0; i < morphed.length; i += 1) morphed[i] = (morphed[i] as number) + (morph.deltaPositions[i] as number) * weight;
  }
  const skeleton = skeletonWithJointOffsets(model.skeleton, model.jointOffsets, weights);
  return skinPositionsCpu({ positions: morphed, jointIndices: part.jointIndices, jointWeights: part.jointWeights }, boneWorldMatrices(skeleton, pose));
}

async function loadReal(model: ProceduralHumanoidModel): Promise<{ readonly h: NullEngineHarness; readonly positions: (partId: string) => Float32Array }> {
  harness = await createNullEngineHarness({ now: () => 1_000 });
  await harness.engine.loadSource({ kind: "procedural", model });
  const { nullEngine } = harness;
  return { h: harness, positions: (partId) => skinnedPositionsByName(nullEngine.scenes[0], partId) };
}

describe("입 안 UV 섬(§4.3): render 상수와 humanoid UV 레이아웃의 일치", () => {
  it("관·캡 사각형이 humanoid `MOUTH_TUBE_RECT`·`MOUTH_CAP_RECT`와 같다", () => {
    expect(MOUTH_TUBE_UV).toEqual({ u0: MOUTH_TUBE_RECT.u0, v0: MOUTH_TUBE_RECT.v0, u1: MOUTH_TUBE_RECT.u1, v1: MOUTH_TUBE_RECT.v1 });
    expect(MOUTH_CAP_UV).toEqual({ u0: MOUTH_CAP_RECT.u0, v0: MOUTH_CAP_RECT.v0, u1: MOUTH_CAP_RECT.u1, v1: MOUTH_CAP_RECT.v1 });
  });

  it("실제 head 파츠에서 입 안 섬 정점의 UV는 모두 마스크 영역 안이고, 섬 밖 정점은 하나도 어둡게 칠해지지 않는다", () => {
    const model = build();
    const head = model.parts.find((part) => part.role === "head");
    if (!head) throw new Error("head 파츠가 없습니다.");
    const mask = generateMouthMask(512);
    let inside = 0;
    let darkOutside = 0;
    for (let v = 0; v < head.uvs.length / 2; v += 1) {
      const u = head.uvs[v * 2] as number;
      const w = head.uvs[v * 2 + 1] as number;
      const x = Math.min(511, Math.floor(u * 512));
      const y = Math.min(511, Math.floor(w * 512));
      const dark = (mask[(y * 512 + x) * 4] as number) < 250;
      if (isMouthInteriorUv(u, w)) {
        inside += 1;
        expect(dark).toBe(true);
      } else if (dark) {
        darkOutside += 1;
      }
    }
    // 입 안 섬은 비어 있지 않고(관 + 캡 정점), 가장자리 번짐(1.5텍셀)을 빼면 섬 밖 정점이 어두워지지 않는다.
    expect(inside).toBeGreaterThan(20);
    expect(darkOutside).toBeLessThanOrEqual(Math.ceil(inside * 0.1));
  });
});

describe("관절 오프셋 소비(§4.1): 실제 휴머노이드 모델 × 엔진 장면", () => {
  it("표의 모든 체형 morph 이름이 리그에 있어 소비된다(버려지는 오프셋 없음)", async () => {
    const model = build();
    const { h } = await loadReal(model);
    const rig = h.engine.inspectRig();
    const available = new Set(rig?.morphNames ?? []);
    const names = Object.keys(model.jointOffsets);
    expect(names.length).toBe(18);
    for (const name of names) expect(available.has(name), name).toBe(true);
    // 보고의 morph 수는 오프셋이 하나라도 있는 항목만 센다(허리 등 관절 이동이 없는 체형 morph는 빈 항목).
    const withOffsets = Object.values(model.jointOffsets).filter((perBone) => perBone !== undefined && Object.keys(perBone).length > 0).length;
    expect(withOffsets).toBeGreaterThan(0);
    expect(withOffsets).toBeLessThan(names.length);
    expect(h.engine.sceneFeatures().jointOffsets.detail).toContain(`morph ${withOffsets}개`);
  });

  it("팔 길이 morph + 팔꿈치 굽힘: 스킨된 정점이 humanoid 기준 구현과 1e-4 m 안에서 같다", async () => {
    const model = build();
    const skin = model.parts.find((part) => part.role === "skin");
    if (!skin) throw new Error("skin 파츠가 없습니다.");
    const { h, positions } = await loadReal(model);
    const weights = { [paramMorphName("armLength", "+")]: 1 };
    const pose: Pose = { leftLowerArm: quatAxisAngle("z", -90) as Quat };
    h.engine.applyPlan(applyPlanFixture({ morphWeights: weights, boneRotations: pose }));
    const actual = positions(skin.id);
    expect(maxDistance(actual, reference(model, skin, weights, pose))).toBeLessThan(1e-4);
  });

  it("대조: jointOffsets를 뺀 모델은 같은 입력에서 5 mm 넘게 어긋난다(옛 팔꿈치 둘레 회전)", async () => {
    const model = build();
    const skin = model.parts.find((part) => part.role === "skin");
    if (!skin) throw new Error("skin 파츠가 없습니다.");
    const stripped: ProceduralHumanoidModel = { ...model, jointOffsets: {} };
    const { h, positions } = await loadReal(stripped);
    const weights = { [paramMorphName("armLength", "+")]: 1 };
    const pose: Pose = { leftLowerArm: quatAxisAngle("z", -90) as Quat };
    h.engine.applyPlan(applyPlanFixture({ morphWeights: weights, boneRotations: pose }));
    const actual = positions(skin.id);
    expect(maxDistance(actual, reference(model, skin, weights, pose))).toBeGreaterThan(0.005);
  });

  it("체형 morph 18종 전체 + 무작위 포즈(시드 고정) 5세트에서도 기준 구현과 같다", async () => {
    const model = build();
    const skin = model.parts.find((part) => part.role === "skin");
    if (!skin) throw new Error("skin 파츠가 없습니다.");
    const { h, positions } = await loadReal(model);
    const rand = mulberry32(20261001);
    const posedBones: readonly HumanoidBoneName[] = ["leftUpperArm", "leftLowerArm", "rightUpperArm", "rightLowerArm", "leftUpperLeg", "leftLowerLeg", "rightUpperLeg", "rightLowerLeg", "spine", "chest", "neck"];
    let worst = 0;
    for (let round = 0; round < 5; round += 1) {
      const weights: Record<string, number> = {};
      for (const name of Object.keys(model.jointOffsets)) weights[name] = rand() > 0.4 ? Math.round(rand() * 100) / 100 : 0;
      const pose: Record<string, Quat> = {};
      for (const bone of posedBones) if (rand() > 0.3) pose[bone] = quatAxisAngle((["x", "y", "z"] as const)[Math.floor(rand() * 3)] ?? "x", (rand() - 0.5) * 120);
      h.engine.applyPlan(applyPlanFixture({ morphWeights: weights, boneRotations: pose }));
      worst = Math.max(worst, maxDistance(positions(skin.id), reference(model, skin, weights, pose)));
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it("체형 morph를 0으로 되돌리면 rest 정점으로 정확히 돌아온다", async () => {
    const model = build();
    const skin = model.parts.find((part) => part.role === "skin");
    if (!skin) throw new Error("skin 파츠가 없습니다.");
    const { h, positions } = await loadReal(model);
    h.engine.applyPlan(applyPlanFixture({ morphWeights: { [paramMorphName("armLength", "+")]: 1, [paramMorphName("height", "+")]: 0.7 } }));
    h.engine.applyPlan(applyPlanFixture({ morphWeights: {} }));
    expect(maxDistance(positions(skin.id), new Float32Array(skin.positions))).toBeLessThan(1e-4);
  });
});
