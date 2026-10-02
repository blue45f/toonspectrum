import { describe, expect, it } from "vitest";

import { HUMANOID_BONE_NAMES } from "../../../contracts";
import { buildHeadCage } from "../geometry/head-cage";
import { catmullClark } from "../geometry/subdivision";
import { jawMaskLocal } from "../morph/face-fields";
import { HEAD_LANDMARKS, resolveProportions, worldToHeadLocal } from "../proportions";

import { blendJawWeights } from "./jaw-weights";
import { boneWorldMatrices, skinPositionsCpu } from "./pose-math";
import { boneCapsules, buildHumanoidSkeleton } from "./skeleton-builder";
import { buildAdjacency, computeSkinWeights, type SkinWeights } from "./skin-weights";

import type { Vec3 } from "../../../shared/math";

const HEAD = HUMANOID_BONE_NAMES.indexOf("head");
const JAW = HUMANOID_BONE_NAMES.indexOf("jaw");
const proportions = resolveProportions({});
const skeleton = buildHumanoidSkeleton(proportions);
const cage = buildHeadCage({});
const sub = catmullClark(cage.mesh, 1);
const base: SkinWeights = computeSkinWeights(sub.positions, skeleton, boneCapsules(proportions), {
  regions: sub.regions,
  adjacency: buildAdjacency(sub.positions.length / 3, sub.faces),
  smoothingIterations: 2,
});
const blended = blendJawWeights(sub.positions, base, cage.frame, HEAD, JAW);

function weightOf(weights: SkinWeights, vertex: number, joint: number): number {
  let sum = 0;
  for (let i = 0; i < 4; i += 1) if (weights.jointIndices[vertex * 4 + i] === joint && weights.jointWeights[vertex * 4 + i] > 0) sum += weights.jointWeights[vertex * 4 + i];
  return sum;
}

function localOf(vertex: number): Vec3 {
  return worldToHeadLocal(cage.frame, [sub.positions[vertex * 3], sub.positions[vertex * 3 + 1], sub.positions[vertex * 3 + 2]]);
}

describe("jawMaskLocal", () => {
  it("입선 위는 0, 아래는 1, 뒤통수·귀 쪽은 0이고 좌우 대칭이다", () => {
    const line = HEAD_LANDMARKS.mouth[1];
    expect(jawMaskLocal([0, 0.4, 0.8])).toBe(0);
    expect(jawMaskLocal([0, line + 0.03, 0.8])).toBe(0);
    expect(jawMaskLocal([0, line - 0.03, 0.8])).toBe(1);
    expect(jawMaskLocal([0, -0.9, 0.4])).toBe(1);
    expect(jawMaskLocal([0, -0.9, -0.6])).toBe(0);
    expect(jawMaskLocal([0.9, line - 0.1, -0.6])).toBe(0);
    expect(jawMaskLocal([0.3, line - 0.1, 0.5])).toBeCloseTo(jawMaskLocal([-0.3, line - 0.1, 0.5]), 12);
    // 볼 쪽은 완만하게 전환(입 구멍 안쪽보다 완만)
    const centerStep = jawMaskLocal([0, line - 0.02, 0.5]) - jawMaskLocal([0, line + 0.02, 0.5]);
    const cheekStep = jawMaskLocal([0.7, line - 0.02, 0.5]) - jawMaskLocal([0.7, line + 0.02, 0.5]);
    expect(centerStep).toBeGreaterThan(cheekStep);
  });
});

describe("blendJawWeights", () => {
  it("가중치 합 1·영향 ≤ 4·범위 안 인덱스이고 결정적이다", () => {
    let worst = 0;
    let maxInfluences = 0;
    for (let v = 0; v < sub.positions.length / 3; v += 1) {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < 4; i += 1) {
        const weight = blended.jointWeights[v * 4 + i];
        sum += weight;
        if (weight > 0) count += 1;
        expect(blended.jointIndices[v * 4 + i]).toBeLessThan(55);
      }
      worst = Math.max(worst, Math.abs(sum - 1));
      maxInfluences = Math.max(maxInfluences, count);
    }
    expect(worst).toBeLessThan(1e-5);
    expect(maxInfluences).toBeLessThanOrEqual(4);
    const again = blendJawWeights(sub.positions, base, cage.frame, HEAD, JAW);
    expect(Buffer.from(again.jointWeights.buffer).equals(Buffer.from(blended.jointWeights.buffer))).toBe(true);
    expect(Buffer.from(again.jointIndices.buffer).equals(Buffer.from(blended.jointIndices.buffer))).toBe(true);
  });

  it("jaw 가중치는 턱 마스크와 같다: 이마·정수리는 0(원래 웨이트 그대로), 아래 입술·턱 끝은 head 몫 전부", () => {
    let forehead = 0;
    let chin = 0;
    for (let v = 0; v < sub.positions.length / 3; v += 1) {
      const [x, y, z] = localOf(v);
      const mask = jawMaskLocal([x, y, z]);
      const headNeck = weightOf(base, v, HEAD) + weightOf(base, v, JAW);
      if (headNeck <= 0) continue;
      expect(weightOf(blended, v, JAW)).toBeCloseTo(mask * headNeck, 5);
      if (mask === 0) {
        forehead += 1;
        expect(weightOf(blended, v, HEAD)).toBeCloseTo(weightOf(base, v, HEAD), 5);
        expect(weightOf(blended, v, JAW)).toBe(0);
      }
      if (mask === 1 && z > 0.3) {
        chin += 1;
        expect(weightOf(blended, v, HEAD)).toBeCloseTo(0, 5);
      }
    }
    expect(forehead).toBeGreaterThan(100);
    expect(chin).toBeGreaterThan(20);
  });

  it("목 아래처럼 head 계열 가중치가 없는 정점은 건드리지 않는다", () => {
    const untouched = blendJawWeights(new Float32Array([0, 0.5, 0.2]), { jointIndices: new Uint16Array([20, 0, 0, 0]), jointWeights: new Float32Array([1, 0, 0, 0]) }, cage.frame, HEAD, JAW);
    expect(Array.from(untouched.jointWeights)).toEqual([1, 0, 0, 0]);
    expect(Array.from(untouched.jointIndices)).toEqual([20, 0, 0, 0]);
  });

  it("영향 슬롯이 가득 찬 정점도 head/jaw 몫을 나눠 4개 안에서 합 1을 지킨다", () => {
    const full: SkinWeights = { jointIndices: new Uint16Array([HEAD, 20, 21, 22]), jointWeights: new Float32Array([0.4, 0.3, 0.2, 0.1]) };
    // 턱 마스크가 1인 점(입선 아래 앞)
    const point = cage.frame.center.map((c, i) => c + [0, -0.9, 0.4][i] * cage.frame.scale);
    const out = blendJawWeights(new Float32Array(point), full, cage.frame, HEAD, JAW);
    const sum = Array.from(out.jointWeights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(out.jointWeights.filter((w) => w > 0).length).toBeLessThanOrEqual(4);
    expect(weightOf(out, 0, JAW)).toBeCloseTo(0.4, 6);
  });

  it("jaw 본을 돌리면 아래 입술은 내려가고 위 입술·이마는 움직이지 않는다(CPU 스키닝)", () => {
    const theta = 0.35;
    const matrices = boneWorldMatrices(skeleton, { jaw: [Math.sin(theta / 2), 0, 0, Math.cos(theta / 2)] });
    const moved = skinPositionsCpu({ positions: sub.positions, jointIndices: blended.jointIndices, jointWeights: blended.jointWeights }, matrices);
    const before = skinPositionsCpu({ positions: sub.positions, jointIndices: base.jointIndices, jointWeights: base.jointWeights }, matrices);
    let lowerDrop = 0;
    let upperShift = 0;
    let foreheadShift = 0;
    let beforeJaw = 0;
    const line = HEAD_LANDMARKS.mouth[1];
    for (let v = 0; v < sub.positions.length / 3; v += 1) {
      const [x, y, z] = localOf(v);
      const dy = moved[v * 3 + 1] - sub.positions[v * 3 + 1];
      if (Math.abs(x) < 0.05 && z > 0.7 && y < line - 0.03) lowerDrop = Math.min(lowerDrop, dy);
      if (Math.abs(x) < 0.05 && z > 0.7 && y > line + 0.03) upperShift = Math.max(upperShift, Math.abs(dy));
      if (y > 0.3) foreheadShift = Math.max(foreheadShift, Math.abs(dy));
      beforeJaw = Math.max(beforeJaw, Math.abs(before[v * 3 + 1] - sub.positions[v * 3 + 1]));
    }
    expect(beforeJaw).toBeLessThan(1e-6); // 블렌드 전에는 jaw를 돌려도 머리 메시가 안 움직인다(수정 전 상태)
    expect(lowerDrop).toBeLessThan(-0.015);
    expect(upperShift).toBeLessThan(1e-3);
    expect(foreheadShift).toBeLessThan(1e-6);
  });
});
