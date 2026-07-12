import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { applyVrmTwoBoneGrip, solveTwoBoneTarget } from "./studio-vrm-prop-ik";

import type { VRM } from "@pixiv/three-vrm";

function expectVectorClose(actual: THREE.Vector3, expected: THREE.Vector3, precision = 5) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
}

function expectFiniteQuaternion(quaternion: THREE.Quaternion) {
  expect([quaternion.x, quaternion.y, quaternion.z, quaternion.w].every(Number.isFinite)).toBe(true);
  expect(quaternion.length()).toBeCloseTo(1, 5);
}

describe("solveTwoBoneTarget", () => {
  it("도달 가능한 목표를 정확히 풀고 입력 Vector3를 변경하지 않는다", () => {
    const start = new THREE.Vector3(0, 0, 0);
    const elbow = new THREE.Vector3(1, 0, 0);
    const end = new THREE.Vector3(1, 1, 0);
    const target = new THREE.Vector3(1, 1, 0);
    const snapshots = [start, elbow, end, target].map((value) => value.clone());

    const result = solveTwoBoneTarget(start, elbow, end, target)!;

    expect(result.reachable).toBe(true);
    expect(result.clamped).toBe(false);
    expectVectorClose(result.end, target);
    expect(result.start.distanceTo(result.elbow)).toBeCloseTo(1, 6);
    expect(result.elbow.distanceTo(result.end)).toBeCloseTo(1, 6);
    [start, elbow, end, target].forEach((value, index) => expectVectorClose(value, snapshots[index]));
  });

  it("너무 먼 목표를 최대 도달 거리로 clamp하고 관절 길이를 보존한다", () => {
    const result = solveTwoBoneTarget(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(10, 0, 0)
    )!;

    expect(result.reachable).toBe(false);
    expect(result.clamped).toBe(true);
    expect(result.solvedDistance).toBeLessThan(2);
    expect(result.solvedDistance).toBeGreaterThan(1.99);
    expect(result.start.distanceTo(result.elbow)).toBeCloseTo(1, 6);
    expect(result.elbow.distanceTo(result.end)).toBeCloseTo(1, 6);
    expect(result.end.x).toBeCloseTo(result.solvedDistance, 6);
  });

  it("길이가 다른 팔의 너무 가까운 목표를 최소 도달 거리로 clamp한다", () => {
    const result = solveTwoBoneTarget(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(0, 0, 0),
      undefined,
      [2, 1]
    )!;

    expect(result.reachable).toBe(false);
    expect(result.clamped).toBe(true);
    expect(result.solvedDistance).toBeGreaterThan(1);
    expect(result.start.distanceTo(result.elbow)).toBeCloseTo(2, 6);
    expect(result.elbow.distanceTo(result.end)).toBeCloseTo(1, 6);
  });

  it("pole point가 지정한 쪽으로 팔꿈치를 안정적으로 굽힌다", () => {
    const result = solveTwoBoneTarget(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1)
    )!;

    expect(result.elbow.z).toBeGreaterThan(0);
    expect(result.poleDirection.z).toBeCloseTo(1, 6);
  });

  it("pole과 현재 팔이 목표축에 겹쳐도 결정적인 fallback을 반복 반환한다", () => {
    const args = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(1.2, 0, 0),
      new THREE.Vector3(5, 0, 0),
    ] as const;
    const first = solveTwoBoneTarget(...args)!;
    const second = solveTwoBoneTarget(...args)!;

    expectVectorClose(first.elbow, second.elbow, 8);
    expect(first.poleDirection.length()).toBeCloseTo(1, 8);
    expect(Math.abs(first.poleDirection.dot(new THREE.Vector3(1, 0, 0)))).toBeCloseTo(0, 8);
  });

  it("명시한 관절 길이를 사용한다", () => {
    const result = solveTwoBoneTarget(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(2, 1, 0),
      new THREE.Vector3(0, 0, 1),
      [2, 1]
    )!;

    expect(result.lengths).toEqual([2, 1]);
    expect(result.start.distanceTo(result.elbow)).toBeCloseTo(2, 6);
    expect(result.elbow.distanceTo(result.end)).toBeCloseTo(1, 6);
  });

  it("NaN, zero-length, 손상된 명시 길이는 null로 안전하게 거부한다", () => {
    const zero = new THREE.Vector3(0, 0, 0);
    expect(solveTwoBoneTarget(zero, zero, zero, new THREE.Vector3(1, 0, 0))).toBeNull();
    expect(solveTwoBoneTarget(
      zero,
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(Number.NaN, 0, 0)
    )).toBeNull();
    expect(solveTwoBoneTarget(
      zero,
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(1, 1, 0),
      undefined,
      [0, 1]
    )).toBeNull();
  });
});

type ArmFixture = {
  vrm: VRM;
  scene: THREE.Group;
  upperArm: THREE.Bone;
  lowerArm: THREE.Bone;
  hand: THREE.Bone;
  nodes: Map<string, THREE.Object3D>;
};

function createArmFixture(side: "left" | "right" = "left", lowerOffset = 1, handOffset = 1): ArmFixture {
  const scene = new THREE.Group();
  const upperArm = new THREE.Bone();
  const lowerArm = new THREE.Bone();
  const hand = new THREE.Bone();
  lowerArm.position.set(lowerOffset, 0, 0);
  hand.position.set(handOffset, 0, 0);
  upperArm.add(lowerArm);
  lowerArm.add(hand);
  scene.add(upperArm);
  scene.updateMatrixWorld(true);

  const nodes = new Map<string, THREE.Object3D>([
    [`${side}UpperArm`, upperArm],
    [`${side}LowerArm`, lowerArm],
    [`${side}Hand`, hand],
  ]);
  const vrm = {
    scene,
    humanoid: {
      getNormalizedBoneNode(name: string) {
        return nodes.get(name) ?? null;
      },
    },
  } as unknown as VRM;
  return { vrm, scene, upperArm, lowerArm, hand, nodes };
}

describe("applyVrmTwoBoneGrip", () => {
  it("normalized upper/lower arm을 회전해 손을 world 목표에 맞춘다", () => {
    const fixture = createArmFixture();
    const target = new THREE.Vector3(1, 1, 0);

    expect(applyVrmTwoBoneGrip(fixture.vrm, "left", target, 1)).toBe(true);
    fixture.scene.updateMatrixWorld(true);
    expectVectorClose(fixture.hand.getWorldPosition(new THREE.Vector3()), target, 5);
    expectFiniteQuaternion(fixture.upperArm.quaternion);
    expectFiniteQuaternion(fixture.lowerArm.quaternion);
  });

  it("targetQuaternion 옵션으로 손의 world 방향까지 정렬한다", () => {
    const fixture = createArmFixture();
    const targetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, -0.4, 0.7));

    expect(applyVrmTwoBoneGrip(
      fixture.vrm,
      "left",
      new THREE.Vector3(1, 1, 0),
      1,
      undefined,
      { targetQuaternion }
    )).toBe(true);
    fixture.scene.updateMatrixWorld(true);
    const actualWorld = fixture.hand.getWorldQuaternion(new THREE.Quaternion());
    expect(Math.abs(actualWorld.dot(targetQuaternion))).toBeCloseTo(1, 5);
  });

  it("부분 influence 반복 호출이 폭주하지 않고 목표로 수렴한다", () => {
    const fixture = createArmFixture();
    const target = new THREE.Vector3(0.8, 1.25, 0.2);

    for (let index = 0; index < 40; index += 1) {
      expect(applyVrmTwoBoneGrip(fixture.vrm, "left", target, 0.25, [0, 0, 1])).toBe(true);
      expectFiniteQuaternion(fixture.upperArm.quaternion);
      expectFiniteQuaternion(fixture.lowerArm.quaternion);
    }

    fixture.scene.updateMatrixWorld(true);
    const handWorld = fixture.hand.getWorldPosition(new THREE.Vector3());
    expect(handWorld.distanceTo(target)).toBeLessThan(0.003);
  });

  it("influence 0은 quaternion과 matrix를 변경하지 않는다", () => {
    const fixture = createArmFixture();
    fixture.upperArm.rotation.set(0.1, 0.2, 0.3);
    fixture.lowerArm.rotation.set(-0.2, 0.1, 0.15);
    fixture.scene.updateMatrixWorld(true);
    const before = [fixture.upperArm.quaternion.clone(), fixture.lowerArm.quaternion.clone(), fixture.hand.quaternion.clone()];

    expect(applyVrmTwoBoneGrip(fixture.vrm, "left", new THREE.Vector3(1, 1, 0), 0)).toBe(false);
    expect(fixture.upperArm.quaternion.equals(before[0])).toBe(true);
    expect(fixture.lowerArm.quaternion.equals(before[1])).toBe(true);
    expect(fixture.hand.quaternion.equals(before[2])).toBe(true);
  });

  it("missing bone, zero-length hierarchy, NaN target을 안전하게 거부한다", () => {
    const missing = createArmFixture();
    missing.nodes.delete("leftLowerArm");
    expect(applyVrmTwoBoneGrip(missing.vrm, "left", new THREE.Vector3(1, 1, 0), 1)).toBe(false);

    const zeroLength = createArmFixture("left", 0, 0);
    expect(applyVrmTwoBoneGrip(zeroLength.vrm, "left", new THREE.Vector3(1, 1, 0), 1)).toBe(false);

    const invalid = createArmFixture();
    const before = invalid.upperArm.quaternion.clone();
    expect(applyVrmTwoBoneGrip(
      invalid.vrm,
      "left",
      new THREE.Vector3(Number.NaN, 0, 0),
      1
    )).toBe(false);
    expect(invalid.upperArm.quaternion.equals(before)).toBe(true);
  });
});
