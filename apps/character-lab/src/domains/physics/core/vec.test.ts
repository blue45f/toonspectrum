import { describe, expect, it } from "vitest";

import { qRotateVec3 } from "../../../shared/math";

import { f32Length3, normalizeVec3, quatFromUnitVectors, rotateVec3, rotateVec3ByQuat } from "./vec";

import type { Vec3 } from "../../../contracts";

function unit(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

describe("physics/core/vec", () => {
  it("quatFromUnitVectors는 from을 to로 돌린다(일반·동일·180° 특이점)", () => {
    const cases: Array<[Vec3, Vec3]> = [
      [unit([0, -1, 0]), unit([1, -1, 0])],
      [unit([0, 0, 1]), unit([0, 0, 1])],
      [unit([0, 1, 0]), unit([0, -1, 0])],
      [unit([1, 0, 0]), unit([-1, 0, 0])],
      [unit([0.3, -0.9, 0.2]), unit([-0.5, -0.1, 0.8])],
    ];
    for (const [from, to] of cases) {
      const q = quatFromUnitVectors(from, to);
      const rotated = rotateVec3(q, from);
      expect(Math.hypot(rotated[0] - to[0], rotated[1] - to[1], rotated[2] - to[2])).toBeLessThan(1e-6);
      expect(Math.abs(Math.hypot(q[0], q[1], q[2], q[3]) - 1)).toBeLessThan(1e-6);
    }
  });

  it("normalizeVec3·quatFromUnitVectors는 0 벡터에서 NaN을 내지 않는다", () => {
    expect(normalizeVec3([0, 0, 0])).toEqual([0, 0, 0]);
    expect(quatFromUnitVectors([0, 0, 0], [0, 1, 0])).toEqual([0, 0, 0, 1]);
    expect(f32Length3(0, 0, 0)).toBe(0);
  });

  it("rotateVec3ByQuat는 shared/math qRotateVec3와 1e-6 안에서 일치한다", () => {
    const q = quatFromUnitVectors(unit([1, 0, 0]), unit([0, 1, 1]));
    const v: Vec3 = [0.2, -0.7, 0.4];
    const expected = qRotateVec3(q, v);
    const out = new Float32Array(3);
    rotateVec3ByQuat(q[0], q[1], q[2], q[3], v[0], v[1], v[2], out, 0);
    expect(Math.abs(out[0] - expected[0])).toBeLessThan(1e-6);
    expect(Math.abs(out[1] - expected[1])).toBeLessThan(1e-6);
    expect(Math.abs(out[2] - expected[2])).toBeLessThan(1e-6);
  });
});
