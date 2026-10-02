/**
 * 체형 morph 관절 오프셋 소비(humanoid 요청 §4.1) NullEngine 검증. 정점이 morph로 움직인 만큼 본 rest도 움직이고 **역바인드를 morph된 rest에서
 * 다시 만들어야** 팔꿈치 같은 관절이 새 위치를 중심으로 회전한다. 기대값은 해석적이다: p = e' + R(v − e'), e' = 옮겨진 팔꿈치.
 * 스킨은 `testing/cpu-skinning.ts`가 실제 Babylon 장면의 스켈레톤 행렬(절대 포즈 × 역바인드)·morph influence로 CPU 계산한다.
 * GPU 정점 셰이더(본 텍스처·morph 텍스처)는 NullEngine이 실행하지 못한다 → docs/parity/render.md '브라우저 미검증'.
 */
import { afterEach, describe, expect, it } from "vitest";

import { allocatePartIds, validateMeshPartData } from "../contracts";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { skinnedPositions } from "./testing/cpu-skinning";
import { applyRigPlan, bindFixtureRig, createNullEngineHarness, restoreRig, rigBoneSnapshots, snapshotRig } from "./testing/null-engine-harness";
import { boxGeometry } from "./testing/procedural-fixture";

import type { BoneData, HumanoidModelData, MeshPartData, MorphJointOffsets, Quat, Vec3 } from "../contracts";
import type { FixtureRig, NullEngineHarness } from "./testing/null-engine-harness";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";

const ARM_MORPH = "param:armLength:+";
const ARM_OFFSET: Vec3 = [0.05, 0, 0];
/** 모델 공간 팔꿈치 rest 위치: hips(0,1,0) + 어깨(0.2,0.3,0) + 팔꿈치(0.3,0,0) */
const ELBOW_REST: Vec3 = [0.5, 1.3, 0];
const Z_QUARTER_TURN: Quat = [0, 0, Math.SQRT1_2, Math.SQRT1_2];

const BONES: readonly BoneData[] = [
  { name: "hips", parent: null, restTranslation: [0, 1, 0], restRotation: [0, 0, 0, 1] },
  { name: "leftUpperArm", parent: "hips", restTranslation: [0.2, 0.3, 0], restRotation: [0, 0, 0, 1] },
  { name: "leftLowerArm", parent: "leftUpperArm", restTranslation: [0.3, 0, 0], restRotation: [0, 0, 0, 1] },
  { name: "leftHand", parent: "leftLowerArm", restTranslation: [0.25, 0, 0], restRotation: [0, 0, 0, 1] },
];

function armModel(jointOffsets: MorphJointOffsets | undefined): HumanoidModelData {
  const geometry = boxGeometry([0.625, 1.3, 0], [0.25, 0.06, 0.06]);
  const palette = allocatePartIds([{ role: "skin" }]);
  const vertexCount = geometry.positions.length / 3;
  const jointIndices = new Uint16Array(vertexCount * 4);
  const jointWeights = new Float32Array(vertexCount * 4);
  for (let v = 0; v < vertexCount; v += 1) {
    jointIndices[v * 4] = 2; // leftLowerArm
    jointWeights[v * 4] = 1;
  }
  const deltaPositions = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v += 1) deltaPositions.set(ARM_OFFSET, v * 3);
  const forearm: MeshPartData = {
    id: "forearm",
    role: "skin",
    partId: 1,
    materialId: 0,
    materialPreset: "skin-sss",
    colorKey: "skin",
    ...geometry,
    jointIndices,
    jointWeights,
    morphs: [{ name: ARM_MORPH, deltaPositions }],
  };
  const failure = validateMeshPartData(forearm, 0);
  if (failure) throw new Error(`fixture 검증 실패: ${failure.reasonKo}`);
  return {
    parts: [forearm],
    skeleton: { bones: BONES },
    morphNames: [ARM_MORPH],
    chains: [],
    colliders: [],
    partIdPalette: palette,
    ...(jointOffsets ? { jointOffsets } : {}),
  };
}

const ELBOW_OFFSETS: MorphJointOffsets = { [ARM_MORPH]: { leftLowerArm: ARM_OFFSET } };

/** 표준 회전: v를 쿼터니언 q로 돌린다 */
function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** 해석적 기대 위치: 새 팔꿈치 e' 둘레로 morph된 정점을 회전 */
function expectedPositions(rest: Float32Array, weight: number, rotation: Quat): Float32Array {
  const elbow: Vec3 = [ELBOW_REST[0] + weight * ARM_OFFSET[0], ELBOW_REST[1], ELBOW_REST[2]];
  const out = new Float32Array(rest.length);
  for (let v = 0; v < rest.length / 3; v += 1) {
    const morphed: Vec3 = [(rest[v * 3] as number) + weight * ARM_OFFSET[0], rest[v * 3 + 1] as number, rest[v * 3 + 2] as number];
    const turned = rotate(rotation, [morphed[0] - elbow[0], morphed[1] - elbow[1], morphed[2] - elbow[2]]);
    out.set([elbow[0] + turned[0], elbow[1] + turned[1], elbow[2] + turned[2]], v * 3);
  }
  return out;
}

function maxError(actual: Float32Array, expected: Float32Array): number {
  let worst = 0;
  for (let i = 0; i < actual.length; i += 1) worst = Math.max(worst, Math.abs((actual[i] as number) - (expected[i] as number)));
  return worst;
}

/** 정점별 유클리드 거리의 최댓값 */
function maxDistance(actual: Float32Array, expected: Float32Array): number {
  let worst = 0;
  for (let v = 0; v < actual.length / 3; v += 1) {
    worst = Math.max(worst, Math.hypot((actual[v * 3] as number) - (expected[v * 3] as number), (actual[v * 3 + 1] as number) - (expected[v * 3 + 1] as number), (actual[v * 3 + 2] as number) - (expected[v * 3 + 2] as number)));
  }
  return worst;
}

let harness: NullEngineHarness | null = null;
let fixture: FixtureRig | null = null;

afterEach(() => {
  harness?.dispose();
  harness = null;
  fixture?.dispose();
  fixture = null;
});

async function engineWith(model: HumanoidModelData): Promise<{ readonly harness: NullEngineHarness; readonly mesh: Mesh; readonly rest: Float32Array }> {
  harness = await createNullEngineHarness({ now: () => 1_000 });
  await harness.engine.loadSource({ kind: "procedural", model });
  const mesh = harness.nullEngine.scenes[0]?.getMeshByName("forearm");
  if (!mesh) throw new Error("forearm 메시가 없습니다.");
  const rest = new Float32Array(model.parts[0]?.positions ?? []);
  return { harness, mesh: mesh as Mesh, rest };
}

describe("관절 오프셋 소비(NullEngine, 해석적 기대값)", () => {
  it("rest 포즈에서 w=1이어도 morph된 정점이 그대로 나온다(역바인드를 morph된 rest에서 다시 만든 증거 — 안 만들면 이중 이동한다)", async () => {
    const { harness: h, mesh, rest } = await engineWith(armModel(ELBOW_OFFSETS));
    h.engine.applyPlan(applyPlanFixture({ morphWeights: { [ARM_MORPH]: 1 } }));
    expect(maxError(skinnedPositions(mesh).positions, expectedPositions(rest, 1, [0, 0, 0, 1]))).toBeLessThan(1e-5);
  });

  it("팔꿈치를 90° 굽히면 새 팔꿈치 둘레로 회전한다(오차 < 0.01 mm)", async () => {
    for (const weight of [0.25, 0.5, 1]) {
      const { harness: h, mesh, rest } = await engineWith(armModel(ELBOW_OFFSETS));
      h.engine.applyPlan(applyPlanFixture({ morphWeights: { [ARM_MORPH]: weight }, boneRotations: { leftLowerArm: Z_QUARTER_TURN } }));
      expect(maxError(skinnedPositions(mesh).positions, expectedPositions(rest, weight, Z_QUARTER_TURN)), `w=${weight}`).toBeLessThan(1e-5);
      h.dispose();
      harness = null;
    }
  });

  it("대조: jointOffsets가 없는 소스는 옛 팔꿈치 둘레로 돌아 5 mm 넘게 어긋난다(w=1에서 약 70 mm)", async () => {
    const { harness: h, mesh, rest } = await engineWith(armModel(undefined));
    h.engine.applyPlan(applyPlanFixture({ morphWeights: { [ARM_MORPH]: 1 }, boneRotations: { leftLowerArm: Z_QUARTER_TURN } }));
    // (R − I)·d: 90° 회전이라 |d|·√2 = 0.0707 m
    const error = maxDistance(skinnedPositions(mesh).positions, expectedPositions(rest, 1, Z_QUARTER_TURN));
    expect(error).toBeGreaterThan(0.005);
    expect(error).toBeCloseTo(Math.SQRT2 * ARM_OFFSET[0], 4);
  });

  it("가중치를 0으로 되돌리면 본 위치와 스킨이 정확히 rest로 돌아온다", async () => {
    const { harness: h, mesh, rest } = await engineWith(armModel(ELBOW_OFFSETS));
    h.engine.applyPlan(applyPlanFixture({ morphWeights: { [ARM_MORPH]: 1 }, boneRotations: { leftLowerArm: Z_QUARTER_TURN } }));
    h.engine.applyPlan(applyPlanFixture({ morphWeights: {}, boneRotations: { leftLowerArm: Z_QUARTER_TURN } }));
    expect(maxError(skinnedPositions(mesh).positions, expectedPositions(rest, 0, Z_QUARTER_TURN))).toBeLessThan(1e-5);
    h.engine.applyPlan(applyPlanFixture({ morphWeights: {}, boneRotations: {} }));
    expect(maxError(skinnedPositions(mesh).positions, rest)).toBeLessThan(1e-5);
  });

  it("체형 morph가 아닌 가중치(표정 등)는 본을 움직이지 않는다", async () => {
    const { harness: h, mesh, rest } = await engineWith(armModel(ELBOW_OFFSETS));
    h.engine.applyPlan(applyPlanFixture({ morphWeights: { "facs:jawOpen": 1 } }));
    expect(maxError(skinnedPositions(mesh).positions, rest)).toBeLessThan(1e-6);
  });

  it("능력 보고: 오프셋이 있으면 활성(관절·최대 mm·옮겨진 본 수), 없으면 꺼짐과 사유", async () => {
    const { harness: h } = await engineWith(armModel(ELBOW_OFFSETS));
    const idle = h.engine.sceneFeatures().jointOffsets;
    expect(idle.status).toBe("active");
    expect(idle.detail).toContain("morph 1개");
    expect(idle.detail).toContain("관절 1개");
    expect(idle.detail).toContain("최대 50 mm");
    expect(idle.detail).toContain("지금 0개 본이 옮겨짐");
    h.engine.applyPlan(applyPlanFixture({ morphWeights: { [ARM_MORPH]: 1 } }));
    expect(h.engine.sceneFeatures().jointOffsets.detail).toContain("지금 1개 본이 옮겨짐");
    h.dispose();
    harness = null;

    const { harness: bareHarness } = await engineWith(armModel(undefined));
    const none = bareHarness.engine.sceneFeatures().jointOffsets;
    expect(none.status).toBe("off");
    expect(none.reasonKo).toContain("관절 오프셋을 주지 않아");
  });

  it("소스를 올리기 전에는 꺼짐이다", async () => {
    harness = await createNullEngineHarness({ now: () => 1_000 });
    expect(harness.engine.sceneFeatures().jointOffsets).toEqual({ status: "off", reasonKo: "소스가 없습니다." });
  });
});

describe("관절 오프셋 리그 단위(스냅샷·복원·보고)", () => {
  it("본 스냅샷의 rest 평행이동이 morph 오프셋을 반영한다(PoseSkeleton·검사용)", () => {
    fixture = bindFixtureRig(armModel(ELBOW_OFFSETS));
    const { rig } = fixture;
    const elbow = (): Vec3 | undefined => rigBoneSnapshots(rig).find((bone) => bone.name === "leftLowerArm")?.restTranslation;
    expect(elbow()).toEqual([0.3, 0, 0]);
    applyRigPlan(rig, applyPlanFixture({ morphWeights: { [ARM_MORPH]: 0.5 } }), { outlinesVisible: false });
    expect(elbow()?.[0]).toBeCloseTo(0.325, 6);
  });

  it("스냅샷 복원: 일시 적용(썸네일) 뒤 옮겨진 본과 역바인드가 원래 상태로 돌아온다", () => {
    fixture = bindFixtureRig(armModel(ELBOW_OFFSETS));
    const { rig } = fixture;
    const mesh = fixture.scene.getMeshByName("forearm") as Mesh;
    const rest = new Float32Array(armModel(undefined).parts[0]?.positions ?? []);
    const options = { outlinesVisible: false };
    applyRigPlan(rig, applyPlanFixture({ morphWeights: { [ARM_MORPH]: 1 }, boneRotations: { leftLowerArm: Z_QUARTER_TURN } }), options);
    const posedSnapshot = snapshotRig(rig);
    // 썸네일이 다른 플랜을 일시 적용한다
    applyRigPlan(rig, applyPlanFixture({ morphWeights: { [ARM_MORPH]: 0.25 } }), options);
    restoreRig(rig, posedSnapshot, options);
    expect(maxError(skinnedPositions(mesh).positions, expectedPositions(rest, 1, Z_QUARTER_TURN))).toBeLessThan(1e-5);
    // rest(오프셋 없음) 스냅샷으로 복원하면 본이 원위치
    applyRigPlan(rig, applyPlanFixture({}), options);
    const restSnapshot = snapshotRig(rig);
    applyRigPlan(rig, applyPlanFixture({ morphWeights: { [ARM_MORPH]: 1 } }), options);
    restoreRig(rig, restSnapshot, options);
    expect(maxError(skinnedPositions(mesh).positions, rest)).toBeLessThan(1e-5);
    expect(rig.jointOffsets?.snapshot().size).toBe(0);
  });

  it("바뀐 본이 없으면 apply는 0을 돌려준다(슬라이더 드래그 비용 최소화)", () => {
    fixture = bindFixtureRig(armModel(ELBOW_OFFSETS));
    const binding = fixture.rig.jointOffsets;
    expect(binding).toBeTruthy();
    expect(binding?.apply({ [ARM_MORPH]: 0.5 })).toBe(1);
    expect(binding?.apply({ [ARM_MORPH]: 0.5 })).toBe(0);
    expect(binding?.apply({})).toBe(1);
    expect(binding?.apply({})).toBe(0);
  });

  it("리그에 없는 morph 이름의 오프셋은 무시한다(정점이 안 움직이는데 본만 움직이면 찢어진다)", () => {
    fixture = bindFixtureRig(armModel({ "param:ghost:+": { leftLowerArm: [0.1, 0, 0] } }));
    const binding = fixture.rig.jointOffsets;
    expect(binding?.apply({ "param:ghost:+": 1 })).toBe(0);
    expect(binding?.effectiveRestTranslation("leftLowerArm")).toEqual([0.3, 0, 0]);
  });

  it("오프셋 표가 비어 있으면 바인딩을 만들지 않는다", () => {
    fixture = bindFixtureRig(armModel({ "param:waist:+": {} }));
    expect(fixture.rig.jointOffsets).toBeNull();
  });

  it("부모·자식 본이 같이 옮겨지면 부모 먼저 처리해 절대 위치가 누적된다", () => {
    fixture = bindFixtureRig(armModel({ [ARM_MORPH]: { leftUpperArm: [0, 0.02, 0], leftLowerArm: [0.05, 0, 0] } }));
    const { rig } = fixture;
    applyRigPlan(rig, applyPlanFixture({ morphWeights: { [ARM_MORPH]: 1 } }), { outlinesVisible: false });
    const lower = rig.bones.get("leftLowerArm");
    if (!lower) throw new Error("본이 없습니다.");
    // 노드 위치(로컬)는 rest + 오프셋, 월드는 부모 체인 누적
    lower.node.computeWorldMatrix(true);
    const world = lower.node.getAbsolutePosition();
    expect(world.x).toBeCloseTo(0.2 + 0.3 + 0.05, 6);
    expect(world.y).toBeCloseTo(1 + 0.3 + 0.02, 6);
  });
});
