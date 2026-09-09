import fs from "node:fs";
import path from "node:path";

import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { POSER_FINGER_BONES, pickNaturalIdlePose } from "../studio-pose-presets";

import {
  applyFingerRotations,
  applyPoseToVrm,
  desiredRelaxedPalmNormal,
  estimateVrmPalmNormal,
  stripFingerBones,
  type FingerRotationMap,
  type PoseBoneMap,
  type Vec3,
} from "./studio-vrm-poser-utils";

(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

function extractFingers(bones: PoseBoneMap): FingerRotationMap {
  const fingers: FingerRotationMap = {};
  for (const boneName of POSER_FINGER_BONES) {
    const rotation = bones[boneName]?.rotation as Vec3 | undefined;
    if (!rotation) continue;
    fingers[boneName] = [rotation[0], rotation[1], rotation[2]];
  }
  return fingers;
}

async function loadBundledVrm(relativePath: string) {
  const buf = fs.readFileSync(path.resolve(relativePath)).buffer;
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await new Promise<{ userData: { vrm: import("@pixiv/three-vrm").VRM } }>(
    (resolve, reject) => loader.parse(buf, "", resolve as never, reject),
  );
  const vrm = gltf.userData.vrm;
  if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
  return vrm;
}

const CHARACTERS = [
  { id: "sample", name: "루미", file: "apps/web/public/vrm/sample.vrm" },
  { id: "avatar-a", name: "하린", file: "apps/web/public/vrm/AvatarSample_A.vrm" },
  { id: "avatar-b", name: "세라", file: "apps/web/public/vrm/AvatarSample_B.vrm" },
  { id: "avatar-c", name: "유나", file: "apps/web/public/vrm/AvatarSample_C.vrm" },
  { id: "alicia", name: "아리시아", file: "apps/web/public/vrm/AliciaSolid.vrm" },
  { id: "mio", name: "미오", file: "apps/web/public/vrm/fem_vroid.vrm" },
] as const;

function applyNaturalIdle(vrm: import("@pixiv/three-vrm").VRM, characterId: string) {
  const pose = pickNaturalIdlePose(characterId);
  const bones = stripFingerBones(pose.bones as PoseBoneMap);
  const fingers = extractFingers(pose.bones as PoseBoneMap);
  applyPoseToVrm(vrm, bones, pose.yOffset ?? 0);
  applyFingerRotations(vrm, fingers);
  vrm.humanoid?.update();
  vrm.scene.updateMatrixWorld(true);
  return pose;
}

function worldPosition(node: THREE.Object3D | null | undefined): THREE.Vector3 | null {
  return node?.getWorldPosition(new THREE.Vector3()) ?? null;
}

function wristKinkDegrees(vrm: import("@pixiv/three-vrm").VRM, side: "left" | "right"): number | null {
  const humanoid = vrm.humanoid;
  const lower = humanoid?.getNormalizedBoneNode(`${side}LowerArm`);
  const hand = humanoid?.getNormalizedBoneNode(`${side}Hand`);
  const middle = humanoid?.getNormalizedBoneNode(`${side}MiddleProximal`)
    ?? humanoid?.getNormalizedBoneNode(`${side}MiddleDistal`);
  if (!lower || !hand || !middle) return null;
  const lowerPos = worldPosition(lower)!;
  const handPos = worldPosition(hand)!;
  const middlePos = worldPosition(middle)!;
  const forearm = handPos.clone().sub(lowerPos);
  const handAxis = middlePos.clone().sub(handPos);
  if (forearm.lengthSq() < 1e-8 || handAxis.lengthSq() < 1e-8) return null;
  const dot = THREE.MathUtils.clamp(forearm.normalize().dot(handAxis.normalize()), -1, 1);
  return THREE.MathUtils.radToDeg(Math.acos(dot));
}

function approximateAvatarHeight(vrm: import("@pixiv/three-vrm").VRM): number | null {
  const humanoid = vrm.humanoid;
  const head = worldPosition(humanoid?.getNormalizedBoneNode("head"));
  const leftFoot = worldPosition(humanoid?.getNormalizedBoneNode("leftFoot"));
  const rightFoot = worldPosition(humanoid?.getNormalizedBoneNode("rightFoot"));
  const feet = [leftFoot, rightFoot].filter((value): value is THREE.Vector3 => value !== null);
  if (!head || feet.length === 0) return null;
  const footY = Math.min(...feet.map((value) => value.y));
  const value = head.y - footY;
  return Number.isFinite(value) && value > 0.4 ? value : null;
}

describe("desiredRelaxedPalmNormal", () => {
  it("prefers medial + down + forward, not camera-back", () => {
    const left = desiredRelaxedPalmNormal(
      "left",
      new THREE.Vector3(0.2, 0.9, 0.12),
      new THREE.Vector3(0, 1.0, 0),
    );
    const right = desiredRelaxedPalmNormal(
      "right",
      new THREE.Vector3(-0.2, 0.9, 0.12),
      new THREE.Vector3(0, 1.0, 0),
    );
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
    expect(left.z).toBeGreaterThan(-0.15);
    expect(right.z).toBeGreaterThan(-0.15);
    expect(left.y).toBeLessThan(-0.12);
    expect(right.y).toBeLessThan(-0.12);
  });
});

describe("relaxed hand palm orientation across bundled characters", () => {
  it("orients natural-idle palms inward + down (not outward / camera-back / palm-up)", async () => {
    const failures: string[] = [];

    for (const character of CHARACTERS) {
      const vrm = await loadBundledVrm(character.file);
      if (
        !vrm.humanoid?.getNormalizedBoneNode("leftHand")
        || !vrm.humanoid?.getNormalizedBoneNode("rightHand")
        || !vrm.humanoid?.getNormalizedBoneNode("leftMiddleProximal")
      ) {
        continue;
      }

      applyNaturalIdle(vrm, character.id);
      const left = estimateVrmPalmNormal(vrm, "left");
      const right = estimateVrmPalmNormal(vrm, "right");
      if (!left || !right) {
        failures.push(`${character.name}: missing palm normal`);
        continue;
      }

      if (left.x >= -0.15) failures.push(`${character.name}: left palm not medial (x=${left.x.toFixed(2)})`);
      if (right.x <= 0.15) failures.push(`${character.name}: right palm not medial (x=${right.x.toFixed(2)})`);
      if (left.z < -0.55) failures.push(`${character.name}: left palm too camera-back (z=${left.z.toFixed(2)})`);
      if (right.z < -0.55) failures.push(`${character.name}: right palm too camera-back (z=${right.z.toFixed(2)})`);
      if (left.y > 0.35) failures.push(`${character.name}: left palm too up (y=${left.y.toFixed(2)})`);
      if (right.y > 0.35) failures.push(`${character.name}: right palm too up (y=${right.y.toFixed(2)})`);
    }

    expect(failures, failures.join(" | ")).toEqual([]);
  }, 180_000);

  it("keeps relaxed wrists beside the same-side thigh instead of crossing or kinking", async () => {
    const failures: string[] = [];

    for (const character of CHARACTERS) {
      const vrm = await loadBundledVrm(character.file);
      applyNaturalIdle(vrm, character.id);
      const humanoid = vrm.humanoid;
      const hips = worldPosition(humanoid?.getNormalizedBoneNode("hips"));
      const leftHand = worldPosition(humanoid?.getNormalizedBoneNode("leftHand"));
      const rightHand = worldPosition(humanoid?.getNormalizedBoneNode("rightHand"));
      const leftKnee = worldPosition(humanoid?.getNormalizedBoneNode("leftLowerLeg"));
      const rightKnee = worldPosition(humanoid?.getNormalizedBoneNode("rightLowerLeg"));
      const height = approximateAvatarHeight(vrm);
      if (!hips || !leftHand || !rightHand || !leftKnee || !rightKnee || !height) continue;

      // Same-side placement: left/right hands must not cross the body midline in a relaxed stand.
      if (leftHand.x <= hips.x) failures.push(`${character.name}: left hand crossed torso center`);
      if (rightHand.x >= hips.x) failures.push(`${character.name}: right hand crossed torso center`);

      // Hands should hang around the upper/mid thigh: below the hips, but not substantially below knee.
      const hipSlack = height * 0.05;
      const kneeSlack = height * 0.08;
      if (leftHand.y > hips.y + hipSlack || leftHand.y < leftKnee.y - kneeSlack) {
        failures.push(`${character.name}: left hand vertical placement unnatural (hand=${leftHand.y.toFixed(2)}, hip=${hips.y.toFixed(2)}, knee=${leftKnee.y.toFixed(2)})`);
      }
      if (rightHand.y > hips.y + hipSlack || rightHand.y < rightKnee.y - kneeSlack) {
        failures.push(`${character.name}: right hand vertical placement unnatural (hand=${rightHand.y.toFixed(2)}, hip=${hips.y.toFixed(2)}, knee=${rightKnee.y.toFixed(2)})`);
      }

      // A relaxed wrist can bend, but a gross 65°+ break reads as a dislocated/spun hand.
      const leftKink = wristKinkDegrees(vrm, "left");
      const rightKink = wristKinkDegrees(vrm, "right");
      if (leftKink !== null && leftKink > 65) failures.push(`${character.name}: left wrist kink ${leftKink.toFixed(1)}°`);
      if (rightKink !== null && rightKink > 65) failures.push(`${character.name}: right wrist kink ${rightKink.toFixed(1)}°`);

      // Gross lateral runaway check, normalized to the character's own scale.
      if (Math.abs(leftHand.x - hips.x) > height * 0.34) failures.push(`${character.name}: left hand too far from body`);
      if (Math.abs(rightHand.x - hips.x) > height * 0.34) failures.push(`${character.name}: right hand too far from body`);
    }

    expect(failures, failures.join(" | ")).toEqual([]);
  }, 180_000);

  it("does not force palm twist on a clearly raised arm (wave-like)", async () => {
    const vrm = await loadBundledVrm("apps/web/public/vrm/AvatarSample_A.vrm");
    const bones: PoseBoneMap = {
      rightUpperArm: { direction: { sideX: 0.48, y: 0.66, z: 0.08 } },
      rightLowerArm: { direction: { sideX: 0.18, y: 0.96, z: 0.1 } },
      rightHand: { rotation: [0, 0, THREE.MathUtils.degToRad(-15)] },
      leftUpperArm: { direction: { sideX: 0.35, y: -0.94 } },
      leftLowerArm: { direction: { sideX: 0.2, y: -0.98 } },
      leftHand: { rotation: [0, 0, THREE.MathUtils.degToRad(2)] },
    };
    applyPoseToVrm(vrm, bones, 0);
    vrm.humanoid?.update();
    vrm.scene.updateMatrixWorld(true);

    const rightLower = vrm.humanoid?.getNormalizedBoneNode("rightLowerArm");
    const rightHand = vrm.humanoid?.getNormalizedBoneNode("rightHand");
    expect(rightLower && rightHand).toBeTruthy();
    const lowerPos = rightLower!.getWorldPosition(new THREE.Vector3());
    const handPos = rightHand!.getWorldPosition(new THREE.Vector3());
    const forearm = handPos.clone().sub(lowerPos).normalize();
    expect(forearm.y).toBeGreaterThan(-0.15);
  }, 60_000);
});
