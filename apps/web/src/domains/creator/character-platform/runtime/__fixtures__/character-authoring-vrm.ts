import { VRM, VRMHumanoid } from "@pixiv/three-vrm";
import { Bone, Group } from "three";

export function createAuthoringPoseVrm() {
  const scene = new Group();
  const add = (parent: Group | Bone, x: number, y: number, z = 0) => {
    const node = new Bone(); node.position.set(x, y, z); parent.add(node); return { node };
  };
  const hips = add(scene, 0, 1);
  const spine = add(hips.node, 0, 0.3);
  const head = add(spine.node, 0, 0.4);
  const leftUpperArm = add(spine.node, 0.2, 0.2);
  const leftLowerArm = add(leftUpperArm.node, 0.35, 0);
  const leftHand = add(leftLowerArm.node, 0.3, 0);
  const rightUpperArm = add(spine.node, -0.2, 0.2);
  const rightLowerArm = add(rightUpperArm.node, -0.35, 0);
  const rightHand = add(rightLowerArm.node, -0.3, 0);
  const leftUpperLeg = add(hips.node, 0.1, 0);
  const leftLowerLeg = add(leftUpperLeg.node, 0, -0.45);
  const leftFoot = add(leftLowerLeg.node, 0, -0.45);
  const rightUpperLeg = add(hips.node, -0.1, 0);
  const rightLowerLeg = add(rightUpperLeg.node, 0, -0.45);
  const rightFoot = add(rightLowerLeg.node, 0, -0.45);
  const leftIndexProximal = add(leftHand.node, 0.05, 0, 0.02);
  const leftIndexIntermediate = add(leftIndexProximal.node, 0.04, 0);
  const leftIndexDistal = add(leftIndexIntermediate.node, 0.03, 0);
  const leftMiddleProximal = add(leftHand.node, 0.05, 0, -0.01);
  const leftMiddleIntermediate = add(leftMiddleProximal.node, 0.04, 0);
  const leftMiddleDistal = add(leftMiddleIntermediate.node, 0.03, 0);
  const rightIndexProximal = add(rightHand.node, -0.05, 0, 0.02);
  const rightIndexIntermediate = add(rightIndexProximal.node, -0.04, 0);
  const rightIndexDistal = add(rightIndexIntermediate.node, -0.03, 0);
  scene.updateMatrixWorld(true);
  const humanoid = new VRMHumanoid({ hips, spine, head, leftIndexProximal, leftIndexIntermediate, leftIndexDistal, leftMiddleProximal, leftMiddleIntermediate, leftMiddleDistal, rightIndexProximal, rightIndexIntermediate, rightIndexDistal, leftUpperArm, leftLowerArm, leftHand,
    rightUpperArm, rightLowerArm, rightHand, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot });
  scene.add(humanoid.normalizedHumanBonesRoot);
  return new VRM({ scene, humanoid, meta: { metaVersion: "1", name: "테스트 뼈대", authors: ["fixture"], licenseUrl: "https://example.test/license" } });
}
