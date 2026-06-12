import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

import { applyPoseToVrm, POSE_PRESETS } from "./StudioVrmPoser";
import { NATURAL_IDLE_POSES, pickNaturalIdlePose } from "./studio-pose-presets";

const MAX_Y_OFFSET = 0.20;
const MAX_HEAD_AXIS_DEGREES = 12;
const MAX_TORSO_AXIS_DEGREES = 45;
const HEAD_BONES = new Set(["neck", "head"]);
const TORSO_BONES = new Set(["hips", "spine", "chest"]);

type BoneNodes = Partial<Record<VRMHumanBoneName, THREE.Object3D>>;

function toDegrees(radians: number) {
  return Math.round((radians * 180) / Math.PI);
}

function findPose(id: string) {
  const pose = POSE_PRESETS.find((preset) => preset.id === id);
  if (!pose) {
    throw new Error(`Missing pose preset: ${id}`);
  }
  return pose;
}

function addBone(bones: BoneNodes, name: VRMHumanBoneName, parent: THREE.Object3D, position: THREE.Vector3Tuple) {
  const bone = new THREE.Object3D();
  bone.name = name;
  bone.position.set(position[0], position[1], position[2]);
  parent.add(bone);
  bones[name] = bone;
  return bone;
}

function createTestVrm() {
  const scene = new THREE.Group();
  const bones: BoneNodes = {};

  const hips = addBone(bones, "hips", scene, [0, 1.02, 0]);
  const spine = addBone(bones, "spine", hips, [0, 0.22, 0]);
  const chest = addBone(bones, "chest", spine, [0, 0.26, 0]);
  const neck = addBone(bones, "neck", chest, [0, 0.28, 0]);
  addBone(bones, "head", neck, [0, 0.18, 0]);

  const leftShoulder = addBone(bones, "leftShoulder", chest, [0.06, 0.13, 0]);
  const leftUpperArm = addBone(bones, "leftUpperArm", leftShoulder, [0.12, 0, 0]);
  const leftLowerArm = addBone(bones, "leftLowerArm", leftUpperArm, [0.34, -0.62, 0]);
  const leftHand = addBone(bones, "leftHand", leftLowerArm, [0.14, -0.58, 0]);
  addBone(bones, "leftIndexProximal", leftHand, [0.06, -0.07, 0]);

  const rightShoulder = addBone(bones, "rightShoulder", chest, [-0.06, 0.13, 0]);
  const rightUpperArm = addBone(bones, "rightUpperArm", rightShoulder, [-0.12, 0, 0]);
  const rightLowerArm = addBone(bones, "rightLowerArm", rightUpperArm, [-0.34, -0.62, 0]);
  const rightHand = addBone(bones, "rightHand", rightLowerArm, [-0.14, -0.58, 0]);
  addBone(bones, "rightIndexProximal", rightHand, [-0.06, -0.07, 0]);

  const leftUpperLeg = addBone(bones, "leftUpperLeg", hips, [0.12, -0.08, 0]);
  const leftLowerLeg = addBone(bones, "leftLowerLeg", leftUpperLeg, [0.05, -0.76, 0]);
  addBone(bones, "leftFoot", leftLowerLeg, [0.02, -0.72, 0.12]);

  const rightUpperLeg = addBone(bones, "rightUpperLeg", hips, [-0.12, -0.08, 0]);
  const rightLowerLeg = addBone(bones, "rightLowerLeg", rightUpperLeg, [-0.05, -0.76, 0]);
  addBone(bones, "rightFoot", rightLowerLeg, [-0.02, -0.72, 0.12]);

  const resetNormalizedPose = () => {
    Object.values(bones).forEach((bone) => {
      bone.rotation.set(0, 0, 0);
      bone.quaternion.identity();
    });
    scene.position.set(0, 0, 0);
    scene.updateMatrixWorld(true);
  };

  const humanoid = {
    resetNormalizedPose,
    getNormalizedBoneNode: (name: VRMHumanBoneName) => bones[name] ?? null,
    update: () => scene.updateMatrixWorld(true),
  };

  const vrm = {
    scene,
    humanoid,
    update: () => scene.updateMatrixWorld(true),
  } as unknown as VRM;

  resetNormalizedPose();
  return { bones, vrm };
}

function getBoneDirection(bones: BoneNodes, boneName: VRMHumanBoneName, childName: VRMHumanBoneName) {
  const bone = bones[boneName];
  const child = bones[childName];
  if (!bone || !child) {
    throw new Error(`Missing test bone chain: ${boneName} -> ${childName}`);
  }

  const bonePosition = new THREE.Vector3();
  const childPosition = new THREE.Vector3();
  bone.getWorldPosition(bonePosition);
  child.getWorldPosition(childPosition);
  return childPosition.sub(bonePosition).normalize();
}

describe("StudioVrmPoser pose presets", () => {
  it("aims default arms down and cheer arms above the shoulders", () => {
    const defaultPose = findPose("default");
    const cheerPose = findPose("cheer");
    const { bones, vrm } = createTestVrm();

    applyPoseToVrm(vrm, defaultPose.bones, defaultPose.yOffset ?? 0);
    const defaultLeftUpperArm = getBoneDirection(bones, "leftUpperArm", "leftLowerArm");
    const defaultRightUpperArm = getBoneDirection(bones, "rightUpperArm", "rightLowerArm");

    expect(defaultLeftUpperArm.y).toBeLessThan(-0.86);
    expect(defaultRightUpperArm.y).toBeLessThan(-0.86);
    expect(defaultLeftUpperArm.x).toBeGreaterThan(0.2);
    expect(defaultRightUpperArm.x).toBeLessThan(-0.2);

    applyPoseToVrm(vrm, cheerPose.bones, cheerPose.yOffset ?? 0);
    const cheerLeftUpperArm = getBoneDirection(bones, "leftUpperArm", "leftLowerArm");
    const cheerRightUpperArm = getBoneDirection(bones, "rightUpperArm", "rightLowerArm");
    const cheerLeftLowerArm = getBoneDirection(bones, "leftLowerArm", "leftHand");
    const cheerRightLowerArm = getBoneDirection(bones, "rightLowerArm", "rightHand");

    expect(cheerLeftUpperArm.y).toBeGreaterThan(0.75);
    expect(cheerRightUpperArm.y).toBeGreaterThan(0.75);
    expect(cheerLeftLowerArm.y).toBeGreaterThan(0.82);
    expect(cheerRightLowerArm.y).toBeGreaterThan(0.82);
    expect(cheerLeftUpperArm.x).toBeGreaterThan(0.25);
    expect(cheerRightUpperArm.x).toBeLessThan(-0.25);
  });

  it("keeps core Euler tweaks restrained while limb targets can use full directional poses", () => {
    const awkwardCoreRotations = POSE_PRESETS.flatMap((pose) =>
      Object.entries(pose.bones).flatMap(([boneName, poseBone]) => {
        const limit = HEAD_BONES.has(boneName) ? MAX_HEAD_AXIS_DEGREES : TORSO_BONES.has(boneName) ? MAX_TORSO_AXIS_DEGREES : null;
        if (limit === null || !("rotation" in poseBone) || !poseBone.rotation) return [];

        return poseBone.rotation.flatMap((radians, axisIndex) => {
          const degrees = toDegrees(radians);
          return Math.abs(degrees) > limit ? [`${pose.id}:${boneName}:${axisIndex}:${degrees}`] : [];
        });
      })
    );

    const awkwardOffsets = POSE_PRESETS.flatMap((pose) => (Math.abs(pose.yOffset ?? 0) > MAX_Y_OFFSET ? [`${pose.id}:yOffset:${pose.yOffset}`] : []));

    expect([...awkwardCoreRotations, ...awkwardOffsets]).toEqual([]);
  });

  it("applies natural idle spawn poses with visible left-right asymmetry", () => {
    const { bones, vrm } = createTestVrm();

    for (const idle of NATURAL_IDLE_POSES) {
      expect(applyPoseToVrm(vrm, idle.bones, idle.yOffset ?? 0), `${idle.id} apply`).toBe(true);

      const left = getBoneDirection(bones, "leftUpperArm", "leftLowerArm");
      const right = getBoneDirection(bones, "rightUpperArm", "rightLowerArm");

      // 팔은 자연스럽게 아래로 늘어진다.
      expect(left.y, `${idle.id} left arm down`).toBeLessThan(-0.8);
      expect(right.y, `${idle.id} right arm down`).toBeLessThan(-0.8);

      // 좌우 비대칭: 오른팔을 미러링해도 왼팔과 1° 이상 어긋나야 한다.
      const mirroredRight = new THREE.Vector3(-right.x, right.y, right.z);
      const asymmetryDeg = THREE.MathUtils.radToDeg(left.angleTo(mirroredRight));
      expect(asymmetryDeg, `${idle.id} arm asymmetry`).toBeGreaterThan(1);

      // 어깨 내림(왼 -z / 오 +z)과 손가락 릴랙스 컬(왼 -z / 오 +z)이 실제로 적용된다.
      expect(bones.leftShoulder!.rotation.z, `${idle.id} left shoulder drop`).toBeLessThan(0);
      expect(bones.rightShoulder!.rotation.z, `${idle.id} right shoulder drop`).toBeGreaterThan(0);
      expect(bones.leftIndexProximal!.rotation.z, `${idle.id} left finger curl`).toBeLessThan(0);
      expect(bones.rightIndexProximal!.rotation.z, `${idle.id} right finger curl`).toBeGreaterThan(0);
    }
  });

  it("picks spawn idle poses deterministically per model id", () => {
    for (const id of ["sample-vrm", "alicia", "kage", "upload-123"]) {
      expect(pickNaturalIdlePose(id).id).toBe(pickNaturalIdlePose(id).id);
    }
    expect(NATURAL_IDLE_POSES.map((pose) => pose.id)).toContain(pickNaturalIdlePose("sample-vrm").id);
  });

  it("offers calm comic-panel pose options with natural labels", () => {
    expect(POSE_PRESETS.map((pose) => pose.id)).toEqual([
      "default",
      "wave",
      "point",
      "cheer",
      "think",
      "sit",
      "run",
      "present",
      "support",
      "despair",
      "attack",
      "defense",
      "peace",
      "fist",
      "flying",
      "heart",
      "shy",
      "arrogant",
      "shock",
      "surrender",
      "phone",
      "salute",
      "fighting",
      "thinking",
      "pray",
      "dance",
      "bow",
      "crouch",
      "heroic",
      "shy2",
      "lean",
      "crossArms",
      "run2",
      "jump",
    ]);
    expect(POSE_PRESETS.map((pose) => pose.label)).toEqual([
      "기본",
      "손인사",
      "대화",
      "기쁨",
      "생각",
      "앉기",
      "걷기",
      "설명",
      "응원",
      "낙담",
      "준비",
      "방어",
      "브이",
      "화이팅",
      "비상",
      "하트",
      "부끄럼",
      "팔짱",
      "깜짝",
      "항복",
      "통화",
      "경례",
      "격투",
      "생각중",
      "기도",
      "댄스",
      "인사",
      "쪼그림",
      "영웅",
      "수줍음",
      "기대기",
      "팔짱",
      "달리기",
      "점프",
    ]);
  });
});
