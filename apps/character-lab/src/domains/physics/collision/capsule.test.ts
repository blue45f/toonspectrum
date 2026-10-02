import { describe, expect, it } from "vitest";

import { mulberry32 } from "../../../shared/prng";

import { capsuleSignedDistance, commitCapsuleSet, createCapsuleSet, projectOutOfCapsuleInPlace, projectParticleOutOfCapsules, writeCapsule } from "./capsule";

import type { Vec3 } from "../../../contracts";

describe("physics/collision/capsule", () => {
  it("1,000개 입자를 캡슐 3개 밖으로 투영하면 관통이 없다", () => {
    const set = createCapsuleSet(3);
    const capsules: Array<{ head: Vec3; tail: Vec3; radius: number }> = [
      { head: [0, 1.55, 0], tail: [0, 1.67, 0], radius: 0.1 },
      { head: [0, 1.2, 0], tail: [0, 1.45, 0], radius: 0.12 },
      { head: [-0.1, 0.9, 0.02], tail: [0.1, 0.9, -0.02], radius: 0.13 },
    ];
    capsules.forEach((c, i) => writeCapsule(set, i, c.head, c.tail, c.radius));
    commitCapsuleSet(set);
    const random = mulberry32(42);
    const count = 1000;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      pos[i * 3] = (random() - 0.5) * 0.4;
      pos[i * 3 + 1] = 0.7 + random() * 1.1;
      pos[i * 3 + 2] = (random() - 0.5) * 0.4;
    }
    const margin = 0.02;
    for (let i = 0; i < count; i += 1) projectParticleOutOfCapsules(pos, i, set, 1, margin);
    let worst = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count; i += 1) {
      const p: Vec3 = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      for (const c of capsules) worst = Math.min(worst, capsuleSignedDistance(p, c.head, c.tail, c.radius + margin));
      expect(Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])).toBe(true);
    }
    expect(worst).toBeGreaterThanOrEqual(-1e-6);
  });

  it("이미 밖에 있는 입자는 움직이지 않고 축 위의 점도 결정적으로 밀려난다", () => {
    const pos = new Float32Array([0.5, 1.6, 0, 0, 1.6, 0]);
    const pen = projectOutOfCapsuleInPlace(pos, 0, 0, 1.55, 0, 0, 1.67, 0, 0.1);
    expect(pen).toBe(0);
    expect(Array.from(pos.subarray(0, 3))).toEqual(Array.from(Float32Array.from([0.5, 1.6, 0])));
    const penAxis = projectOutOfCapsuleInPlace(pos, 3, 0, 1.55, 0, 0, 1.67, 0, 0.1);
    expect(penAxis).toBeCloseTo(0.1, 6);
    const d = capsuleSignedDistance([pos[3], pos[4], pos[5]], [0, 1.55, 0], [0, 1.67, 0], 0.1);
    expect(Math.abs(d)).toBeLessThan(1e-6);
    const again = new Float32Array([0, 1.6, 0]);
    projectOutOfCapsuleInPlace(again, 0, 0, 1.55, 0, 0, 1.67, 0, 0.1);
    expect(Array.from(again)).toEqual(Array.from(pos.subarray(3, 6)));
  });

  it("prev→current 보간(t)으로 캡슐 위치를 평가한다", () => {
    const set = createCapsuleSet(1);
    writeCapsule(set, 0, [0, 0, 0], [0, 1, 0], 0.1);
    commitCapsuleSet(set);
    writeCapsule(set, 0, [1, 0, 0], [1, 1, 0], 0.1);
    const pos = new Float32Array([0.5, 0.5, 0]);
    projectParticleOutOfCapsules(pos, 0, set, 0.5, 0);
    // t=0.5 → 캡슐 축 x=0.5, 축 위 점이므로 수직 방향으로 0.1 밀려난다
    expect(Math.abs(Math.hypot(pos[0] - 0.5, pos[2]) - 0.1)).toBeLessThan(1e-6);
  });
});
