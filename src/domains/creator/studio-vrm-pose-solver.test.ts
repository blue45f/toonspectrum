import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  POSE_LM,
  solvePoseToVrmBones,
  type PoseLandmark,
} from "./studio-vrm-pose-solver";

// 33개 랜드마크 배열을 만들고 일부만 지정한다(나머지는 원점, 가시성 1).
function makeLandmarks(set: Record<number, Partial<PoseLandmark>>): PoseLandmark[] {
  const arr: PoseLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 1,
  }));
  for (const [i, v] of Object.entries(set)) {
    arr[Number(i)] = { x: 0, y: 0, z: 0, visibility: 1, ...v };
  }
  return arr;
}

const REST_ARM_LEFT = new THREE.Vector3(1, 0, 0);

function eulerToQuat(e: readonly [number, number, number]): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2], "XYZ"));
}

// 본 Euler 체인으로부터 하완의 월드 방향을 복원한다(부모상대 합성 검증용).
function forearmWorldDir(bones: Record<string, readonly [number, number, number]>): THREE.Vector3 {
  const upper = eulerToQuat(bones.leftUpperArm);
  const lowerLocal = eulerToQuat(bones.leftLowerArm);
  const world = upper.clone().multiply(lowerLocal);
  return REST_ARM_LEFT.clone().applyQuaternion(world).normalize();
}

describe("studio-vrm-pose-solver", () => {
  // MediaPipe: y는 아래가 양수. 미러 비활성으로 좌표를 직관적으로 검증한다.
  const opts = { mirror: false as const, zDamp: 1, minVisibility: 0.5 };

  it("팔을 곧게 폈을 때 하완의 부모상대 회전은 0(굽힘 없음)이다 — 이중회전 버그 수정의 핵심", () => {
    // 어깨 위, 팔꿈치/손목이 일직선으로 아래로.
    const lm = makeLandmarks({
      [POSE_LM.leftShoulder]: { y: -0.5 },
      [POSE_LM.leftElbow]: { y: -0.2 },
      [POSE_LM.leftWrist]: { y: 0.1 },
    });
    const bones = solvePoseToVrmBones(lm, opts);
    expect(bones.leftLowerArm).toBeDefined();
    const [x, y, z] = bones.leftLowerArm;
    expect(Math.abs(x)).toBeLessThan(1e-3);
    expect(Math.abs(y)).toBeLessThan(1e-3);
    expect(Math.abs(z)).toBeLessThan(1e-3);
  });

  it("팔꿈치를 굽히면 부모상대 합성이 실제 하완 방향을 정확히 복원한다", () => {
    // 상완은 아래로, 하완은 카메라 쪽(앞)으로 90° 굽힘.
    const lm = makeLandmarks({
      [POSE_LM.leftShoulder]: { y: -0.5 },
      [POSE_LM.leftElbow]: { y: -0.2 },
      [POSE_LM.leftWrist]: { y: -0.2, z: -0.3 }, // MediaPipe z<0 = 카메라 쪽
    });
    const bones = solvePoseToVrmBones(lm, opts);
    // 굽혔으므로 하완 로컬은 0이 아니다.
    const mag =
      Math.abs(bones.leftLowerArm[0]) +
      Math.abs(bones.leftLowerArm[1]) +
      Math.abs(bones.leftLowerArm[2]);
    expect(mag).toBeGreaterThan(0.5);

    // 복원된 하완 월드 방향 ≈ three 좌표의 (0,0,1) (앞=+Z, z 부호 변환 -(-0.3)).
    const d = forearmWorldDir(bones);
    expect(d.x).toBeCloseTo(0, 2);
    expect(d.y).toBeCloseTo(0, 2);
    expect(d.z).toBeCloseTo(1, 2);
  });

  it("상완 회전은 어깨→팔꿈치 방향을 향한다", () => {
    const lm = makeLandmarks({
      [POSE_LM.leftShoulder]: { y: -0.5 },
      [POSE_LM.leftElbow]: { y: -0.2 },
      [POSE_LM.leftWrist]: { y: 0.1 },
    });
    const bones = solvePoseToVrmBones(lm, opts);
    const upperWorld = REST_ARM_LEFT.clone()
      .applyQuaternion(eulerToQuat(bones.leftUpperArm))
      .normalize();
    // 팔꿈치가 어깨 아래 → three 좌표(y-up)에서 하향(-Y).
    expect(upperWorld.y).toBeLessThan(-0.9);
  });

  it("zDamp 이 작을수록 하완 방향의 깊이(z) 성분이 줄어든다", () => {
    // 하완이 아래(y)+앞(z) 으로 향하도록 — z 를 0으로 감쇠해도 방향이 퇴화하지 않는다.
    const lm = makeLandmarks({
      [POSE_LM.leftShoulder]: { y: -0.5 },
      [POSE_LM.leftElbow]: { y: -0.2 },
      [POSE_LM.leftWrist]: { y: 0.0, z: -0.3 },
    });
    const full = forearmWorldDir(solvePoseToVrmBones(lm, { mirror: false, zDamp: 1, minVisibility: 0.5 }));
    const damped = forearmWorldDir(solvePoseToVrmBones(lm, { mirror: false, zDamp: 0, minVisibility: 0.5 }));
    expect(Math.abs(full.z)).toBeGreaterThan(0.2); // 감쇠 없으면 깊이 성분 존재
    expect(Math.abs(damped.z)).toBeLessThan(1e-2); // 감쇠 0이면 거의 사라짐
  });

  it("가시성이 낮은 관절이 있으면 해당 팔 본을 생략한다", () => {
    const lm = makeLandmarks({
      [POSE_LM.leftShoulder]: { y: -0.5 },
      [POSE_LM.leftElbow]: { y: -0.2 },
      [POSE_LM.leftWrist]: { y: 0.1, visibility: 0.1 },
    });
    const bones = solvePoseToVrmBones(lm, opts);
    expect(bones.leftUpperArm).toBeUndefined();
    expect(bones.leftLowerArm).toBeUndefined();
  });

  it("미러 모드에서 왼쪽 랜드마크를 오른쪽 본으로 매핑한다(거울 따라하기)", () => {
    const lm = makeLandmarks({
      [POSE_LM.leftShoulder]: { y: -0.5 },
      [POSE_LM.leftElbow]: { y: -0.2 },
      [POSE_LM.leftWrist]: { y: 0.1 },
    });
    const bones = solvePoseToVrmBones(lm, { mirror: true });
    expect(bones.rightUpperArm).toBeDefined();
    expect(bones.leftUpperArm).toBeUndefined();
  });

  it("랜드마크가 33개 미만이면 빈 맵을 반환한다", () => {
    expect(solvePoseToVrmBones([], opts)).toEqual({});
    expect(solvePoseToVrmBones(undefined, opts)).toEqual({});
  });
});
