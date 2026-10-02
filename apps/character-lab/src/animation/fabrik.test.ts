import { describe, expect, it } from "vitest";

import { JOINT_LIMITS_DEG } from "../contracts/bones";
import { isUnitQuat } from "../contracts/pose";
import { degToRad, qFromAxisAngle, qRotateVec3, radToDeg, v3Add, v3Distance, v3Dot, v3Normalize, v3Sub } from "../shared/math";

import { FABRIK_DEFAULT_ITERATIONS, SPINE_IK_CHAIN, applyChainIk, constrainDirection, fingerIkChain, fingerTipLocal, solveChainIk, solveFabrik } from "./fabrik";
import { poseLimitViolations } from "./joint-limits";
import { createReferenceSkeleton } from "./reference-skeleton";
import { computeWorldTransforms } from "./skeleton-fk";

import type { Pose, Vec3 } from "../contracts/pose";

/** 수직 체인 5점(세그먼트 0.1·0.1·0.1·0.08 = 0.38 m) */
const CHAIN: readonly Vec3[] = [
  [0, 1.0, 0],
  [0, 1.1, 0],
  [0, 1.2, 0],
  [0, 1.3, 0],
  [0, 1.38, 0],
];
const TOTAL = 0.38;

function segmentLengths(points: readonly Vec3[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) out.push(v3Distance(points[i + 1] ?? [0, 0, 0], points[i] ?? [0, 0, 0]));
  return out;
}

function bendAnglesDeg(points: readonly Vec3[]): number[] {
  const out: number[] = [];
  for (let i = 1; i + 1 < points.length; i += 1) {
    const a = v3Normalize(v3Sub(points[i] ?? [0, 0, 0], points[i - 1] ?? [0, 0, 0]));
    const b = v3Normalize(v3Sub(points[i + 1] ?? [0, 0, 0], points[i] ?? [0, 0, 0]));
    out.push(radToDeg(Math.acos(Math.max(-1, Math.min(1, v3Dot(a, b))))));
  }
  return out;
}

describe("solveFabrik", () => {
  it("도달 가능한 목표는 ≤10회 반복으로 오차 ≤1 mm에 도달하고 길이·루트를 보존한다", () => {
    const target: Vec3 = [0.15, 1.25, 0.1];
    const result = solveFabrik({ points: CHAIN, target });
    expect(result.reached).toBe(true);
    expect(result.status).toBe("reached");
    expect(result.error).toBeLessThanOrEqual(1e-3);
    expect(result.iterations).toBeLessThanOrEqual(FABRIK_DEFAULT_ITERATIONS);
    expect(result.points[0]).toEqual(CHAIN[0]);
    const lengths = segmentLengths(result.points);
    expect(lengths.map((l) => Number(l.toFixed(9)))).toEqual(segmentLengths(CHAIN).map((l) => Number(l.toFixed(9))));
    expect(v3Distance(result.points[4] ?? [0, 0, 0], target)).toBeLessThanOrEqual(1e-3);
    // 입력 배열은 바꾸지 않는다
    expect(CHAIN[4]).toEqual([0, 1.38, 0]);
  });

  it("도달 불가 목표는 목표 방향으로 곧게 편 체인과 사유를 돌려준다", () => {
    const target: Vec3 = [1, 2, 0];
    const result = solveFabrik({ points: CHAIN, target });
    expect(result.reached).toBe(false);
    expect(result.status).toBe("max-reach");
    expect(result.reasonKo).toMatch(/총 길이/u);
    const dir = v3Normalize(v3Sub(target, CHAIN[0] ?? [0, 0, 0]));
    for (const angle of bendAnglesDeg(result.points)) expect(angle).toBeLessThanOrEqual(1e-4);
    expect(v3Dot(v3Normalize(v3Sub(result.points[4] ?? [0, 0, 0], CHAIN[0] ?? [0, 0, 0])), dir)).toBeCloseTo(1, 9);
    expect(result.error).toBeCloseTo(v3Distance(target, CHAIN[0] ?? [0, 0, 0]) - TOTAL, 9);
  });

  it("원뿔 제약은 관절 꺾임각을 한계 안으로 유지하고, 못 미치면 사유를 남긴다", () => {
    const target: Vec3 = [0.3, 1.0, 0];
    const cone = 20;
    const constraints = [undefined, { coneDeg: cone }, { coneDeg: cone }, { coneDeg: cone }];
    const result = solveFabrik({ points: CHAIN, target, constraints, rootDirection: [0, 1, 0] });
    for (const angle of bendAnglesDeg(result.points)) expect(angle).toBeLessThanOrEqual(cone + 1e-6);
    expect(segmentLengths(result.points).map((l) => Number(l.toFixed(9)))).toEqual(segmentLengths(CHAIN).map((l) => Number(l.toFixed(9))));
    if (!result.reached) {
      expect(result.status).toBe("unconverged");
      expect(result.reasonKo).toMatch(/관절 제약/u);
    }
    // 루트 세그먼트에도 원뿔을 주면 rootDirection 기준으로 제한된다
    const rooted = solveFabrik({ points: CHAIN, target, constraints: [{ coneDeg: 10 }], rootDirection: [0, 1, 0] });
    const firstDir = v3Normalize(v3Sub(rooted.points[1] ?? [0, 0, 0], rooted.points[0] ?? [0, 0, 0]));
    expect(radToDeg(Math.acos(v3Dot(firstDir, [0, 1, 0])))).toBeLessThanOrEqual(10 + 1e-6);
  });

  it("힌지 제약은 세그먼트 방향에서 축 성분을 제거한다", () => {
    const target: Vec3 = [0.12, 1.3, 0.08];
    const hinge = { hingeAxis: [0, 0, 1] as const };
    const result = solveFabrik({ points: CHAIN, target, constraints: [hinge, hinge, hinge, hinge] });
    for (let i = 0; i + 1 < result.points.length; i += 1) {
      const dir = v3Normalize(v3Sub(result.points[i + 1] ?? [0, 0, 0], result.points[i] ?? [0, 0, 0]));
      expect(Math.abs(dir[2])).toBeLessThanOrEqual(1e-9);
    }
    expect(constrainDirection([1, 0, 1], null, hinge)).toEqual([1, 0, 0]);
    expect(constrainDirection([0, 1, 0], [0, 1, 0], { coneDeg: 5 })).toEqual([0, 1, 0]);
    const limited = constrainDirection([1, 0, 0], [0, 1, 0], { coneDeg: 30 });
    expect(radToDeg(Math.acos(v3Dot(limited, [0, 1, 0])))).toBeCloseTo(30, 9);
  });

  it("무작위 도달 가능 목표 100개를 ≤10회 반복으로 전부 1 mm 안에 수렴한다(연구 수치 목표)", () => {
    let seed = 11;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const root = CHAIN[0] ?? [0, 0, 0];
    let maxIterations = 0;
    for (let i = 0; i < 100; i += 1) {
      const r = TOTAL * (0.3 + 0.6 * rand());
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const target: Vec3 = [root[0] + r * Math.sin(phi) * Math.cos(theta), root[1] + r * Math.sin(phi) * Math.sin(theta), root[2] + r * Math.cos(phi)];
      const result = solveFabrik({ points: CHAIN, target });
      expect(result.reached, `target ${target.join(",")}`).toBe(true);
      expect(result.iterations).toBeLessThanOrEqual(10);
      maxIterations = Math.max(maxIterations, result.iterations);
    }
    expect(maxIterations).toBeGreaterThan(0);
  });

  it("퇴화 입력(점 1개·길이 0·비유한)은 degenerate 사유를 돌려준다", () => {
    expect(solveFabrik({ points: [[0, 0, 0]], target: [1, 0, 0] }).status).toBe("degenerate");
    const zero = solveFabrik({ points: [[0, 0, 0], [0, 0, 0], [0, 1, 0]], target: [1, 0, 0] });
    expect(zero.status).toBe("degenerate");
    expect(zero.reasonKo).toMatch(/길이가 0/u);
    expect(solveFabrik({ points: CHAIN, target: [Number.NaN, 0, 0] }).reasonKo).toMatch(/유한/u);
  });

  it("같은 입력은 같은 결과(결정성)이며 이미 도달한 목표는 반복 0회", () => {
    const target: Vec3 = [0.1, 1.3, -0.05];
    expect(solveFabrik({ points: CHAIN, target })).toEqual(solveFabrik({ points: CHAIN, target }));
    const already = solveFabrik({ points: CHAIN, target: CHAIN[4] ?? [0, 0, 0] });
    expect(already.iterations).toBe(0);
    expect(already.reached).toBe(true);
  });
});

describe("solveChainIk / applyChainIk", () => {
  const skeleton = createReferenceSkeleton();

  function headPosition(pose: Pose): Vec3 {
    return computeWorldTransforms(skeleton, pose).get("head")?.position ?? [0, 0, 0];
  }

  it("척추 체인으로 머리를 앞·아래 목표에 보내고(오차 ≤1 mm) 관절 제한 안·다른 본 보존", () => {
    const base: Pose = { leftUpperArm: qFromAxisAngle([0, 0, 1], degToRad(-60)) };
    const rest = headPosition(base);
    const target: Vec3 = [rest[0] + 0.02, rest[1] - 0.04, rest[2] + 0.14];
    const result = solveChainIk(base, skeleton, SPINE_IK_CHAIN, target);
    expect(result.reached, result.reasonKo).toBe(true);
    expect(result.error).toBeLessThanOrEqual(1e-3);
    expect(result.chain).toEqual(SPINE_IK_CHAIN);
    expect(v3Distance(headPosition(result.pose), target)).toBeLessThanOrEqual(1e-3);
    expect(poseLimitViolations(result.pose, skeleton)).toEqual([]);
    expect(result.pose.leftUpperArm).toEqual(base.leftUpperArm);
    expect(result.pose.hips).toBeUndefined();
    expect(result.pose.head).toBeUndefined();
    for (const bone of ["spine", "chest", "upperChest", "neck"] as const) expect(isUnitQuat(result.pose[bone] ?? [0, 0, 0, 0])).toBe(true);
    expect(applyChainIk(base, skeleton, SPINE_IK_CHAIN, target)).toEqual(result.pose);
    expect(applyChainIk(base, skeleton, SPINE_IK_CHAIN, target)).toEqual(applyChainIk(base, skeleton, SPINE_IK_CHAIN, target));
  });

  it("손가락 체인(말단 오프셋)으로 손끝을 손바닥 쪽 목표에 보낸다", () => {
    const chain = fingerIkChain("left", "Index");
    const tipLocal = fingerTipLocal(skeleton, "leftIndexDistal");
    expect(tipLocal[0]).toBeGreaterThan(0.01);
    const rest = computeWorldTransforms(skeleton, {});
    const proximal = rest.get("leftIndexProximal")?.position ?? [0, 0, 0];
    const distal = rest.get("leftIndexDistal");
    const tipRest = distal ? v3Add(distal.position, qRotateVec3(distal.rotation, tipLocal)) : proximal;
    const target: Vec3 = [proximal[0] + 0.045, proximal[1] - 0.045, proximal[2]];
    const result = solveChainIk({}, skeleton, chain, target, { tipLocal });
    expect(result.reached, result.reasonKo).toBe(true);
    const after = computeWorldTransforms(skeleton, result.pose);
    const distalAfter = after.get("leftIndexDistal");
    const tipAfter = distalAfter ? v3Add(distalAfter.position, qRotateVec3(distalAfter.rotation, tipLocal)) : proximal;
    expect(v3Distance(tipAfter, target)).toBeLessThanOrEqual(1e-3);
    expect(tipAfter[1]).toBeLessThan(tipRest[1]);
    expect(Object.keys(result.pose).sort()).toEqual([...chain].sort());
    expect(poseLimitViolations(result.pose, skeleton)).toEqual([]);
    expect(fingerIkChain("right", "Thumb")).toEqual(["rightThumbMetacarpal", "rightThumbProximal", "rightThumbDistal"]);
  });

  it("도달 불가·제한 초과 목표는 사유와 실제 오차를 보고하고 제한 안의 포즈를 돌려준다", () => {
    const far = solveChainIk({}, skeleton, SPINE_IK_CHAIN, [0, 3, 0]);
    expect(far.reached).toBe(false);
    expect(far.status).toBe("max-reach");
    expect(far.reasonKo).toMatch(/총 길이/u);
    expect(poseLimitViolations(far.pose, skeleton)).toEqual([]);
    // 머리를 엉덩이 높이까지 앞으로: 척추 제한(35/25/20/40°)에 걸려 클램프된다
    const bend = solveChainIk({}, skeleton, SPINE_IK_CHAIN, [0, 1.0, 0.4]);
    expect(poseLimitViolations(bend.pose, skeleton)).toEqual([]);
    expect(bend.reached).toBe(false);
    expect(["clamped", "unconverged", "max-reach"]).toContain(bend.status);
    expect(bend.reasonKo).toBeTruthy();
    expect(bend.error).toBeCloseTo(v3Distance(headPosition(bend.pose), [0, 1.0, 0.4]), 9);
    expect(JOINT_LIMITS_DEG.spine.swing).toBe(35);
  });

  it("연속되지 않은 체인·없는 본·너무 짧은 체인은 throw한다(계약 위반)", () => {
    expect(() => applyChainIk({}, skeleton, ["spine", "neck"], [0, 1.5, 0])).toThrow(/연속/u);
    const partial = { bones: skeleton.bones.filter((b) => b.name !== "chest") };
    expect(() => applyChainIk({}, partial, SPINE_IK_CHAIN, [0, 1.5, 0])).toThrow(/chest/u);
    expect(() => applyChainIk({}, skeleton, ["head"], [0, 1.5, 0])).toThrow(/2개 이상/u);
  });
});
