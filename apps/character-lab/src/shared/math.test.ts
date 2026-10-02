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

import type { Quat } from "./math";

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

  it("qToAxisAngle은 이중 덮개(q와 -q)를 정규화해 angle을 [0, π]로 돌려준다", () => {
    for (const deg of [10, 90, 130, 150, 179]) {
      for (const sign of [1, -1]) {
        const rad = (sign * deg * Math.PI) / 180;
        const q = qFromAxisAngle([0, 1, 0], rad);
        const flipped: Quat = [-q[0], -q[1], -q[2], -q[3]];
        for (const input of [q, flipped]) {
          const { axis, angle } = qToAxisAngle(input);
          expect(angle).toBeGreaterThanOrEqual(0);
          expect(angle).toBeLessThanOrEqual(Math.PI);
          expect(angle).toBeCloseTo((deg * Math.PI) / 180, 9);
          // 부호 있는 회전은 축 방향으로 표현된다(-130° = 축 -Y, 130°)
          expect(axis[1]).toBeCloseTo(sign, 9);
          // 같은 회전을 되돌려 만들면 입력과 같은 회전(q 또는 -q)이다
          const rebuilt = qFromAxisAngle(axis, angle);
          expect(Math.abs(rebuilt[0] * q[0] + rebuilt[1] * q[1] + rebuilt[2] * q[2] + rebuilt[3] * q[3])).toBeCloseTo(1, 9);
        }
      }
    }
    // w = -1(= 항등의 반대 덮개)은 회전 없음이다
    expect(qToAxisAngle([0, 0, 0, -1]).angle).toBe(0);
  });

  it("qClampAngle은 w<0 입력에서도 같은 방향으로 클램프하고 한계 안 회전은 그대로 둔다", () => {
    const negate = (q: Quat): Quat => [-q[0], -q[1], -q[2], -q[3]];
    // 한계(0.5rad) 안의 작은 회전: -q로 줘도 회전이 변하지 않아야 한다
    const small = qFromAxisAngle([0, 0, 1], 0.2);
    expect(qAngle(qClampAngle(negate(small), 0.5), small)).toBeCloseTo(0, 9);
    // 한계 밖 회전: 같은 방향(+Z)으로 maxRad까지만
    const large = qFromAxisAngle([0, 0, 1], 1.0);
    for (const input of [large, negate(large)]) {
      const clamped = qClampAngle(input, 0.5);
      expect(qAngle(clamped, qFromAxisAngle([0, 0, 1], 0.5))).toBeCloseTo(0, 9);
    }
    // 음의 큰 회전(-150°)도 -Y 방향으로 클램프된다
    const yaw = qFromAxisAngle([0, 1, 0], (-150 * Math.PI) / 180);
    for (const input of [yaw, negate(yaw)]) {
      const clamped = qClampAngle(input, (70 * Math.PI) / 180);
      expect(qAngle(clamped, qFromAxisAngle([0, 1, 0], (-70 * Math.PI) / 180))).toBeCloseTo(0, 9);
    }
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
