import { describe, expect, it } from "vitest";

import {
  capsuleDistance,
  closestPointOnSegment,
  mat4FromTRS,
  mat4Invert,
  mat4Multiply,
  mat4TransformPoint,
  projectOutOfCapsule,
  qAngle,
  qClampAngle,
  qFromAxisAngle,
  qMultiply,
  qNormalize,
  qRotateVec3,
  qSlerp,
  qToAxisAngle,
  quatFromTo,
  swingTwist,
  v3Cross,
  v3Equals,
  v3Normalize,
  QUAT_IDENTITY,
} from "./math";

describe("shared/math", () => {
  it("normalize는 영벡터·NaN에서 NaN을 내지 않는다", () => {
    expect(v3Normalize([0, 0, 0])).toEqual([0, 0, 0]);
    expect(v3Normalize([Number.NaN, 0, 0])).toEqual([0, 0, 0]);
    expect(v3Equals(v3Normalize([0, 3, 4]), [0, 0.6, 0.8])).toBe(true);
    expect(qNormalize([0, 0, 0, 0])).toEqual(QUAT_IDENTITY);
  });

  it("쿼터니언 회전이 외적 규약(우수계)과 일치한다", () => {
    const q = qFromAxisAngle([0, 0, 1], Math.PI / 2);
    const rotated = qRotateVec3(q, [1, 0, 0]);
    expect(v3Equals(rotated, [0, 1, 0])).toBe(true);
    expect(v3Equals(v3Cross([1, 0, 0], [0, 1, 0]), [0, 0, 1])).toBe(true);
    const back = qToAxisAngle(q);
    expect(back.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(v3Equals(back.axis, [0, 0, 1])).toBe(true);
  });

  it("swing-twist 재합성 오차 ≤ 1e-6", () => {
    const q = qNormalize(qMultiply(qFromAxisAngle([0, 1, 0], 0.7), qFromAxisAngle([1, 0, 0], 1.1)));
    const { swing, twist } = swingTwist(q, [0, 1, 0]);
    const recomposed = qMultiply(swing, twist);
    for (let i = 0; i < 4; i += 1) expect(Math.abs((recomposed[i] ?? 0) - (q[i] ?? 0))).toBeLessThanOrEqual(1e-6);
    // twist는 축 주위 회전만
    const axisAngle = qToAxisAngle(twist);
    expect(Math.abs(Math.abs(axisAngle.axis[1]) - 1)).toBeLessThanOrEqual(1e-6);
  });

  it("quatFromTo는 180° 반대 방향 특이점을 처리한다", () => {
    const q = quatFromTo([1, 0, 0], [-1, 0, 0]);
    expect(v3Equals(qRotateVec3(q, [1, 0, 0]), [-1, 0, 0], 1e-6)).toBe(true);
    expect(quatFromTo([0, 1, 0], [0, 1, 0])).toEqual(QUAT_IDENTITY);
    const q2 = quatFromTo([1, 0, 0], [0, 1, 0]);
    expect(v3Equals(qRotateVec3(q2, [1, 0, 0]), [0, 1, 0], 1e-6)).toBe(true);
  });

  it("slerp 양 끝과 중간, 각도 클램프", () => {
    const a = QUAT_IDENTITY;
    const b = qFromAxisAngle([0, 1, 0], Math.PI / 2);
    expect(qAngle(qSlerp(a, b, 0), a)).toBeCloseTo(0, 6);
    expect(qAngle(qSlerp(a, b, 1), b)).toBeCloseTo(0, 6);
    expect(qAngle(qSlerp(a, b, 0.5), a)).toBeCloseTo(Math.PI / 4, 6);
    expect(qToAxisAngle(qClampAngle(b, 0.3)).angle).toBeCloseTo(0.3, 6);
  });

  it("캡슐 거리와 투영", () => {
    expect(capsuleDistance([0, 2, 0], [0, 0, 0], [0, 1, 0], 0.5)).toBeCloseTo(0.5, 6);
    expect(capsuleDistance([0.2, 0.5, 0], [0, 0, 0], [0, 1, 0], 0.5)).toBeCloseTo(-0.3, 6);
    expect(v3Equals(closestPointOnSegment([5, 0.5, 0], [0, 0, 0], [0, 1, 0]), [0, 0.5, 0])).toBe(true);
    const pushed = projectOutOfCapsule([0.1, 0.5, 0], [0, 0, 0], [0, 1, 0], 0.5);
    expect(pushed.penetration).toBeCloseTo(0.4, 6);
    expect(v3Equals(pushed.point, [0.5, 0.5, 0], 1e-6)).toBe(true);
    expect(projectOutOfCapsule([3, 0, 0], [0, 0, 0], [0, 1, 0], 0.5).penetration).toBe(0);
  });

  it("mat4 TRS·역행렬·점 변환", () => {
    const m = mat4FromTRS([1, 2, 3], qFromAxisAngle([0, 0, 1], Math.PI / 2), [2, 2, 2]);
    const p = mat4TransformPoint(m, [1, 0, 0]);
    expect(v3Equals(p, [1, 4, 3], 1e-5)).toBe(true);
    const inv = mat4Invert(m);
    expect(inv).not.toBeNull();
    if (inv) {
      const identity = mat4Multiply(m, inv);
      for (let i = 0; i < 16; i += 1) expect(Math.abs((identity[i] ?? 0) - (i % 5 === 0 ? 1 : 0))).toBeLessThanOrEqual(1e-5);
    }
    expect(mat4Invert(new Float32Array(16))).toBeNull();
  });
});
