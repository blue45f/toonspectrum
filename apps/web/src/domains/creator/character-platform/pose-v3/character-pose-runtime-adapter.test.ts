import { Bone, BufferGeometry, Euler, Float32BufferAttribute, Group, MeshBasicMaterial, Quaternion, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import type { StudioHumanoidBoneName } from "../../studio-humanoid-bones";
import {
  applyCharacterPoseRuntimeV3, captureCharacterPoseRuntimeV3, characterPoseEulerBones,
  inspectCharacterPoseRuntime, readCharacterPoseRuntimeSource, solveCharacterPoseRuntimeV3,
} from "./character-pose-runtime-adapter";

function fixture() {
  const scene = new Group();
  const nodes = new Map<string, Bone>();
  const add = (name: string, parent: Group | Bone, position: readonly [number, number, number]) => {
    const node = new Bone(); node.name = name; node.position.set(...position); parent.add(node); nodes.set(name, node); return node;
  };
  const hips = add("hips", scene, [0, 2, 0]);
  add("spine", hips, [0, 0.2, 0]);
  const leftUpperArm = add("leftUpperArm", hips, [0.2, 0.4, 0]);
  const leftLowerArm = add("leftLowerArm", leftUpperArm, [0.6, 0, 0]);
  const leftHand = add("leftHand", leftLowerArm, [0.6, 0, 0]);
  const rightUpperArm = add("rightUpperArm", hips, [-0.2, 0.4, 0]);
  const rightLowerArm = add("rightLowerArm", rightUpperArm, [-0.6, 0, 0]);
  add("rightHand", rightLowerArm, [-0.6, 0, 0]);
  for (const [side, x] of [["left", 0.15], ["right", -0.15]] as const) {
    const upper = add(`${side}UpperLeg`, hips, [x, 0, 0]);
    const lower = add(`${side}LowerLeg`, upper, [0, -1, 0]);
    add(`${side}Foot`, lower, [0, -1, 0]);
  }
  scene.updateMatrixWorld(true);
  const source = { scene, humanoid: { getNormalizedBoneNode: (name: StudioHumanoidBoneName) => nodes.get(name) ?? null } };
  const pose = captureCharacterPoseRuntimeV3({ source, poseId: "test:pose", generationId: 1 });
  return { source, pose, nodes, scene, leftUpperArm, leftLowerArm, leftHand, rightUpperArm };
}

describe("Pose V3 실제 정규화 뼈대 어댑터", () => {
  it("IK로 선택한 팔과 스킨 메시를 목표로 움직이고 계산 중 원본은 보존한다", () => {
    const f = fixture();
    const initial = f.leftHand.getWorldPosition(new Vector3());
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(initial.toArray(), 3));
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute([2, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0], 4));
    const material = new MeshBasicMaterial();
    const mesh = new SkinnedMesh(geometry, material);
    f.scene.add(mesh); mesh.bind(new Skeleton([f.leftUpperArm, f.leftLowerArm, f.leftHand]));
    const target = new Vector3(1.1, 2.5, -0.3);
    const solved = solveCharacterPoseRuntimeV3({ source: f.source, pose: { ...f.pose,
      effectors: [{ id: "hand:target", bone: "leftHand", target: [target.x, target.y, target.z], weight: 1, pinned: true }],
    }, selectedRegions: ["left-arm"], preserveFootPlant: false });
    expect(f.leftHand.getWorldPosition(new Vector3()).distanceTo(initial)).toBe(0);
    expect(solved.pose.bones.rightUpperArm).toEqual(f.pose.bones.rightUpperArm);
    expect(solved.pose.root).toEqual(f.pose.root);
    applyCharacterPoseRuntimeV3(f.source, solved.pose);
    expect(f.leftHand.getWorldPosition(new Vector3()).distanceTo(target)).toBeLessThan(0.01);
    expect(f.leftLowerArm.position.length()).toBeCloseTo(0.6, 8);
    expect(f.leftHand.position.length()).toBeCloseTo(0.6, 8);
    mesh.skeleton.update();
    expect(mesh.applyBoneTransform(0, initial.clone()).distanceTo(target)).toBeLessThan(0.01);
    expect(Array.from(geometry.getAttribute("position").array)).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(geometry.getAttribute("position").getX(0)).toBeCloseTo(initial.x, 5);
    geometry.dispose(); material.dispose();
  });

  it("루트 접지 보정을 실제 발 위치로 재검산하고 발목 고정을 저장한다", () => {
    const f = fixture();
    const left = f.nodes.get("leftFoot"); const right = f.nodes.get("rightFoot");
    if (!left || !right) throw new Error("발 fixture 누락");
    const before = left.getWorldPosition(new Vector3());
    const solved = solveCharacterPoseRuntimeV3({ source: f.source, pose: { ...f.pose, root: { ...f.pose.root, position: [0, 0.15, 0] } }, preserveFootPlant: true });
    expect(solved.pose.contacts.filter((contact) => contact.mode === "hard-pin")).toHaveLength(2);
    applyCharacterPoseRuntimeV3(f.source, solved.pose);
    expect(left.getWorldPosition(new Vector3()).distanceTo(before)).toBeLessThan(0.01);
    expect(right.getWorldPosition(new Vector3()).y).toBeCloseTo(0, 3);
    expect(solved.pose.root.position[1]).toBeCloseTo(0, 6);
  });

  it("무릎 비틀기를 제한하고 선택하지 않은 팔의 원래 회전은 유지한다", () => {
    const f = fixture();
    const twist = new Quaternion().setFromAxisAngle(new Vector3(0, -1, 0), 2.1);
    f.rightUpperArm.rotation.set(0.2, 0.3, 0.4);
    const unchanged = f.rightUpperArm.quaternion.clone();
    const solved = solveCharacterPoseRuntimeV3({ source: f.source, pose: { ...f.pose, bones: { ...f.pose.bones, leftLowerLeg: [twist.x, twist.y, twist.z, twist.w] } }, selectedRegions: ["left-leg"], preserveFootPlant: false });
    const knee = solved.pose.bones.leftLowerLeg;
    if (!knee) throw new Error("무릎 결과 누락");
    expect(2 * Math.acos(Math.abs(knee[3]))).toBeLessThanOrEqual(Math.PI / 6 + 1e-7);
    expect(solved.pose.bones.rightUpperArm).toEqual(unchanged.toArray());
  });

  it("팔 Euler의 YXZ 순서를 보존하여 호스트 재렌더링 후에도 포즈가 같다", () => {
    const f = fixture();
    f.leftUpperArm.rotation.set(0.3, -0.4, 0.5, "YXZ");
    const pose = captureCharacterPoseRuntimeV3({ source: f.source, poseId: "test:euler", generationId: 2 });
    const euler = characterPoseEulerBones(pose).leftUpperArm;
    if (!euler) throw new Error("팔 결과 누락");
    const replayed = new Quaternion().setFromEuler(new Euler(...euler, "YXZ"));
    expect(replayed.angleTo(f.leftUpperArm.quaternion)).toBeLessThan(1e-7);
  });

  it("도달할 수 없는 IK 목표는 뼈 길이를 늘리지 않고 실제 오차를 보고한다", () => {
    const f = fixture();
    const solved = solveCharacterPoseRuntimeV3({ source: f.source, pose: { ...f.pose, effectors: [{ id: "hand:far", bone: "leftHand", target: [10, 2, 0], pinned: true, weight: 1 }] }, selectedRegions: ["left-arm"], preserveFootPlant: false });
    expect(solved.maximumError).toBeGreaterThan(8);
    expect(solved.pose.solveReceipt?.converged).toBe(false);
    expect(solved.warnings.join(" ")).toContain("도달 거리");
    applyCharacterPoseRuntimeV3(f.source, solved.pose);
    expect(f.leftLowerArm.position.length()).toBeCloseTo(0.6);
  });

  it("미지원 모델과 없는 관절의 import는 원본을 변형하기 전에 거부한다", () => {
    expect(readCharacterPoseRuntimeSource({ scene: new Group() })).toBeNull();
    expect(inspectCharacterPoseRuntime(null).supported).toBe(false);
    const f = fixture();
    expect(() => applyCharacterPoseRuntimeV3(f.source, { ...f.pose, bones: { ...f.pose.bones, head: [0, 0, 0, 1] }, root: { ...f.pose.root, position: [1, 2, 3] } })).toThrow("현재 모델에");
    expect(f.scene.position.toArray()).toEqual([0, 0, 0]);
  });

  it("부분 pose의 생략된 몸통 관절은 실제 normalized rest로 복원하고 손가락은 보존한다", () => {
    const f = fixture();
    const rest = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.15);
    const source = { ...f.source, humanoid: { ...f.source.humanoid,
      normalizedRestPose: Object.fromEntries([...f.nodes].map(([name]) => [name, { rotation: name === "leftUpperArm" ? rest.toArray() : [0, 0, 0, 1] }])),
    } };
    f.leftUpperArm.rotation.set(0.6, 0.4, 0.7);
    const finger = new Bone(); finger.rotation.set(0.2, 0.3, 0.4); f.leftHand.add(finger); f.nodes.set("leftIndexProximal", finger);
    const fingerBefore = finger.quaternion.clone();
    applyCharacterPoseRuntimeV3(source, { ...f.pose, bones: { hips: [0, 0, 0, 1] } });
    expect(f.leftUpperArm.quaternion.angleTo(rest)).toBeLessThan(1e-7);
    expect(f.rightUpperArm.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-7);
    expect(finger.quaternion.angleTo(fingerBefore)).toBeLessThan(1e-7);
  });

  it("생략된 관절의 실제 rest를 모르면 일부 관절이나 root도 먼저 변경하지 않는다", () => {
    const f = fixture();
    f.leftUpperArm.rotation.z = 0.7;
    const previous = f.leftUpperArm.quaternion.clone();
    expect(() => applyCharacterPoseRuntimeV3(f.source, { ...f.pose, bones: { leftUpperArm: [0, 0, 0, 1] },
      root: { ...f.pose.root, position: [7, 8, 9] } })).toThrow("정규화 rest");
    expect(f.leftUpperArm.quaternion.angleTo(previous)).toBeLessThan(1e-7);
    expect(f.scene.position.toArray()).toEqual([0, 0, 0]);
  });

  it("선택하지 않았거나 잠긴 IK 관절도 실제 잔여 오차를 측정하며 수렴 성공으로 보고하지 않는다", () => {
    for (const locked of [false, true]) {
      const f = fixture();
      const target = [1.1, 2.5, -0.3] as const;
      const expectedError = f.leftHand.getWorldPosition(new Vector3()).distanceTo(new Vector3(...target));
      const solved = solveCharacterPoseRuntimeV3({ source: f.source, pose: { ...f.pose,
        effectors: [{ id: "hand:skipped", bone: "leftHand", target, pinned: true, weight: 1 }],
        fixedControllers: locked ? [{ id: "arm:locked", bone: "leftUpperArm", lockPosition: false, lockRotation: true }] : [],
      }, selectedRegions: locked ? ["left-arm"] : ["right-arm"], preserveFootPlant: false });
      expect(solved.maximumError).toBeCloseTo(expectedError, 8);
      expect(solved.pose.solveReceipt?.converged).toBe(false);
      expect(solved.pose.bones.leftUpperArm).toEqual(f.pose.bones.leftUpperArm);
      expect(solved.warnings.join(" ")).toContain("보존했습니다");
    }
  });
});
