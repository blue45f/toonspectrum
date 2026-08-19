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
  estimateVrmPalmNormal,
  stripFingerBones,
  type FingerRotationMap,
  type PoseBoneMap,
  type Vec3,
} from "./studio-vrm-poser-utils";

(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

const CORE = [
  { id: "sample-vrm", name: "루미", file: "public/vrm/sample.vrm" },
  { id: "avatar-a", name: "하린", file: "public/vrm/AvatarSample_A.vrm" },
  { id: "avatar-b", name: "세라", file: "public/vrm/AvatarSample_B.vrm" },
  { id: "avatar-c", name: "유나", file: "public/vrm/AvatarSample_C.vrm" },
  { id: "mio", name: "미오", file: "public/vrm/fem_vroid.vrm" },
  { id: "noa", name: "노아", file: "public/vrm/masc_vroid.vrm" },
  { id: "alicia", name: "아리시아", file: "public/vrm/AliciaSolid.vrm" },
  { id: "jennifer", name: "제니퍼", file: "public/vrm/Jennifer.vrm" },
] as const;

function extractFingers(bones: PoseBoneMap): FingerRotationMap {
  const fingers: FingerRotationMap = {};
  for (const boneName of POSER_FINGER_BONES) {
    const rotation = bones[boneName]?.rotation as Vec3 | undefined;
    if (!rotation) continue;
    fingers[boneName] = [rotation[0], rotation[1], rotation[2]];
  }
  return fingers;
}

async function load(file: string) {
  const buf = fs.readFileSync(path.resolve(file)).buffer;
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await new Promise<{ userData: { vrm: import("@pixiv/three-vrm").VRM } }>(
    (resolve, reject) => loader.parse(buf, "", resolve as never, reject),
  );
  const vrm = gltf.userData.vrm;
  if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
  return vrm;
}

function tipPalmDot(vrm: import("@pixiv/three-vrm").VRM, side: "left" | "right") {
  const h = vrm.humanoid!;
  const hand = h.getNormalizedBoneNode(`${side}Hand`)!;
  const tip = h.getNormalizedBoneNode(`${side}MiddleDistal`) ?? h.getNormalizedBoneNode(`${side}MiddleProximal`)!;
  const palm = estimateVrmPalmNormal(vrm, side)!;
  return tip.getWorldPosition(new THREE.Vector3())
    .sub(hand.getWorldPosition(new THREE.Vector3()))
    .normalize()
    .dot(palm);
}

describe("VRM finger curl polarity", () => {
  it("curls middle fingertips into the palm for core humanoids (including Lumi axis flip)", async () => {
    const failures: string[] = [];
    for (const character of CORE) {
      if (!fs.existsSync(path.resolve(character.file))) continue;
      const vrm = await load(character.file);
      const pose = pickNaturalIdlePose(character.id);
      const bones = stripFingerBones(pose.bones as PoseBoneMap);
      const fingers = extractFingers(pose.bones as PoseBoneMap);
      applyPoseToVrm(vrm, bones, pose.yOffset ?? 0);
      vrm.humanoid?.update();
      vrm.scene.updateMatrixWorld(true);
      const beforeL = tipPalmDot(vrm, "left");
      const beforeR = tipPalmDot(vrm, "right");
      applyFingerRotations(vrm, fingers);
      vrm.humanoid?.update();
      vrm.scene.updateMatrixWorld(true);
      const afterL = tipPalmDot(vrm, "left");
      const afterR = tipPalmDot(vrm, "right");
      if (afterL - beforeL > 0.05) {
        failures.push(`${character.name}/L curl wrong way Δ=${(afterL - beforeL).toFixed(3)}`);
      }
      if (afterR - beforeR > 0.05) {
        failures.push(`${character.name}/R curl wrong way Δ=${(afterR - beforeR).toFixed(3)}`);
      }
      // Palm still medial after curl
      const palmL = estimateVrmPalmNormal(vrm, "left");
      const palmR = estimateVrmPalmNormal(vrm, "right");
      if (!palmL || palmL.x > -0.15) failures.push(`${character.name}/L palm not medial`);
      if (!palmR || palmR.x < 0.15) failures.push(`${character.name}/R palm not medial`);
    }
    expect(failures, failures.join(" | ")).toEqual([]);
  }, 180_000);
});
