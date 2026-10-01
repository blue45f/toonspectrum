import { describe, expect, it } from "vitest";

import { FINGER_BONE_NAMES, HUMANOID_BONE_NAMES, HUMANOID_BONE_PARENTS, bodyRegionIndex, isHumanoidBoneName } from "../../../contracts";
import { v3Distance } from "../../../shared/math";
import { buildBodyCage } from "../geometry/cage";
import { catmullClark } from "../geometry/subdivision";
import { resolveProportions } from "../proportions";

import { boneWorldMatrices, boneWorldPosition, collidersFromSkeleton, skinPositionsCpu } from "./pose-math";
import { boneCapsuleRadii, boneCapsules, boneWorldPositions, buildHumanoidSkeleton } from "./skeleton-builder";
import { buildAdjacency, computeSkinWeights, expandSkinWeights, weightRoughness } from "./skin-weights";

const proportions = resolveProportions({});
const skeleton = buildHumanoidSkeleton(proportions);

describe("buildHumanoidSkeleton", () => {
  it("55본을 HUMANOID_BONE_NAMES 순서로 만들고 부모가 HUMANOID_BONE_PARENTS와 같다", () => {
    expect(skeleton.bones.map((b) => b.name)).toEqual([...HUMANOID_BONE_NAMES]);
    for (const bone of skeleton.bones) {
      expect(isHumanoidBoneName(bone.name)).toBe(true);
      if (isHumanoidBoneName(bone.name)) expect(bone.parent).toBe(HUMANOID_BONE_PARENTS[bone.name]);
      expect(bone.restRotation).toEqual([0, 0, 0, 1]);
      expect(bone.auxiliary).toBeUndefined();
    }
  });

  it("hips 위에 spine이 있고 손가락은 근위→중간→원위 순서로 멀어진다", () => {
    const world = boneWorldPositions(proportions);
    expect(world.spine[1]).toBeGreaterThan(world.hips[1]);
    expect(world.head[1]).toBeGreaterThan(world.neck[1]);
    for (const finger of ["Index", "Middle", "Ring", "Little"]) {
      const names = FINGER_BONE_NAMES.filter((n) => n.startsWith("left") && n.includes(finger));
      expect(names).toHaveLength(3);
      const xs = names.map((n) => world[n][0]);
      expect(xs[1]).toBeGreaterThan(xs[0]);
      expect(xs[2]).toBeGreaterThan(xs[1]);
      expect(world[names[0]][0]).toBeGreaterThan(world.leftHand[0]);
    }
    expect(world.leftThumbDistal[2]).toBeGreaterThan(world.leftThumbMetacarpal[2]);
  });

  it("좌우 본 위치가 x 거울이다", () => {
    const world = boneWorldPositions(proportions);
    for (const name of HUMANOID_BONE_NAMES) {
      if (!name.startsWith("left")) continue;
      const right = world[`right${name.slice(4)}` as keyof typeof world];
      expect(right[0]).toBeCloseTo(-world[name][0], 9);
      expect(right[1]).toBeCloseTo(world[name][1], 9);
      expect(right[2]).toBeCloseTo(world[name][2], 9);
    }
  });

  it("rest 월드 행렬의 평행이동이 월드 위치와 같고 체형 파라미터가 관절을 옮긴다", () => {
    const matrices = boneWorldMatrices(skeleton, {});
    const world = boneWorldPositions(proportions);
    for (const name of HUMANOID_BONE_NAMES) {
      const p = boneWorldPosition(matrices, name);
      expect(p).not.toBeNull();
      if (p) expect(v3Distance(p, world[name])).toBeLessThan(1e-5);
    }
    const longArm = boneWorldPositions(resolveProportions({ armLength: 1 }));
    expect(longArm.leftHand[0]).toBeGreaterThan(world.leftHand[0]);
    const tall = boneWorldPositions(resolveProportions({ height: 1 }));
    expect(tall.head[1]).toBeGreaterThan(world.head[1]);
  });
});

describe("computeSkinWeights", () => {
  const cage = buildBodyCage({});
  const sub = catmullClark(cage.mesh, 1);
  const capsules = boneCapsules(proportions);
  const adjacency = buildAdjacency(sub.positions.length / 3, sub.faces);
  const weights = computeSkinWeights(sub.positions, skeleton, capsules, { regions: sub.regions, adjacency, smoothingIterations: 2 });

  it("가중치 합이 1이고 영향 수가 4 이하이며 본 인덱스가 범위 안이다", () => {
    const vertexCount = sub.positions.length / 3;
    expect(weights.jointIndices.length).toBe(vertexCount * 4);
    for (let v = 0; v < vertexCount; v += 1) {
      let sum = 0;
      for (let i = 0; i < 4; i += 1) {
        const w = weights.jointWeights[v * 4 + i];
        expect(w).toBeGreaterThanOrEqual(0);
        expect(weights.jointIndices[v * 4 + i]).toBeLessThan(skeleton.bones.length);
        sum += w;
      }
      expect(Math.abs(sum - 1)).toBeLessThan(1e-5);
    }
  });

  it("상완 중간 정점의 최대 가중 본은 leftUpperArm, 허벅지 중간은 leftUpperLeg다", () => {
    const upperArm = skeleton.bones.findIndex((b) => b.name === "leftUpperArm");
    const upperLeg = skeleton.bones.findIndex((b) => b.name === "leftUpperLeg");
    const dominant = (v: number): number => {
      let best = 0;
      for (let i = 1; i < 4; i += 1) if (weights.jointWeights[v * 4 + i] > weights.jointWeights[v * 4 + best]) best = i;
      return weights.jointIndices[v * 4 + best];
    };
    for (const v of cage.landmarks.leftUpperArmRing) expect(dominant(v)).toBe(upperArm);
    for (const v of cage.landmarks.leftThighRing) expect(dominant(v)).toBe(upperLeg);
  });

  it("스무딩 후 인접 가중치 차가 줄고 결과는 결정적이다", () => {
    const raw = computeSkinWeights(sub.positions, skeleton, capsules, { regions: sub.regions, adjacency, smoothingIterations: 0 });
    expect(weightRoughness(weights, adjacency)).toBeLessThan(weightRoughness(raw, adjacency));
    const again = computeSkinWeights(sub.positions, skeleton, capsules, { regions: sub.regions, adjacency, smoothingIterations: 2 });
    expect(Buffer.from(again.jointWeights.buffer).equals(Buffer.from(weights.jointWeights.buffer))).toBe(true);
    expect(Buffer.from(again.jointIndices.buffer).equals(Buffer.from(weights.jointIndices.buffer))).toBe(true);
  });

  it("왼팔 영역 정점은 오른팔 본의 영향을 받지 않는다", () => {
    const leftArm = bodyRegionIndex("leftArm");
    const rightBones = new Set(skeleton.bones.map((b, i) => (b.name.startsWith("right") ? i : -1)).filter((i) => i >= 0));
    for (let v = 0; v < sub.regions.length; v += 1) {
      if (sub.regions[v] !== leftArm) continue;
      for (let i = 0; i < 4; i += 1) {
        if (weights.jointWeights[v * 4 + i] > 0) expect(rightBones.has(weights.jointIndices[v * 4 + i])).toBe(false);
      }
    }
  });

  it("CPU 스키닝: identity 포즈는 원형 복원, 왼 상완 90° 회전은 손목을 아래로 보낸다", () => {
    const part = { positions: sub.positions, jointIndices: weights.jointIndices, jointWeights: weights.jointWeights };
    const identity = skinPositionsCpu(part, boneWorldMatrices(skeleton, {}));
    for (let i = 0; i < identity.length; i += 1) expect(Math.abs(identity[i] - sub.positions[i])).toBeLessThan(1e-5);
    const half = Math.SQRT1_2;
    const posed = boneWorldMatrices(skeleton, { leftUpperArm: [0, 0, -half, half] });
    const hand = boneWorldPosition(posed, "leftHand");
    const shoulder = boneWorldPosition(posed, "leftUpperArm");
    expect(hand).not.toBeNull();
    expect(shoulder).not.toBeNull();
    if (hand && shoulder) {
      // −z축 90°: +x 방향 팔이 −y로 내려간다
      expect(hand[1]).toBeLessThan(shoulder[1] - 0.3);
      expect(Math.abs(hand[0] - shoulder[0])).toBeLessThan(0.02);
    }
    const skinned = skinPositionsCpu(part, posed);
    const tip = cage.landmarks.leftMiddleFingerTip;
    expect(skinned[tip * 3 + 1]).toBeLessThan(sub.positions[tip * 3 + 1] - 0.5);
    // 오른손은 움직이지 않는다
    const rightTip = cage.landmarks.rightMiddleFingerTip;
    expect(Math.abs(skinned[rightTip * 3 + 1] - sub.positions[rightTip * 3 + 1])).toBeLessThan(1e-5);
  });

  it("분할 정점 확장과 충돌 캡슐 생성", () => {
    const expanded = expandSkinWeights(weights, new Uint32Array([0, 0, 5]));
    expect(expanded.jointIndices.length).toBe(12);
    expect(expanded.jointWeights[0]).toBe(weights.jointWeights[0]);
    const colliders = collidersFromSkeleton(skeleton, boneCapsuleRadii(proportions));
    expect(colliders.length).toBe(14);
    for (const c of colliders) {
      expect(c.a).toEqual([0, 0, 0]);
      expect(c.radius).toBeGreaterThan(0);
    }
  });
});
