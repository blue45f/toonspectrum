import { Euler, Object3D, Quaternion, Vector3 } from "three";

import { STUDIO_HUMANOID_BONE_NAMES, getStudioHumanoidBoneDescriptor, type StudioHumanoidBoneName } from "../../studio-humanoid-bones";
import { characterPoseRegionForBone, type CharacterPoseRegion, type CharacterQuaternion, type CharacterVector3 } from "../pose/character-pose-v2";
import { solveCharacterGroundBalance } from "./character-ground-balance-solver";
import { limitCharacterSwingTwist } from "./character-swing-twist";
import { solveCharacterTwoBoneIk } from "./character-two-bone-ik";
import { validateCharacterPoseDocumentV3, type CharacterPoseDocumentV3 } from "./character-pose-v3";

export interface CharacterPoseRuntimeSource {
  readonly scene: Object3D;
  readonly humanoid: {
    getNormalizedBoneNode(name: StudioHumanoidBoneName): Object3D | null;
    readonly normalizedRestPose?: Readonly<Partial<Record<StudioHumanoidBoneName, { readonly rotation?: readonly number[] }>>>;
    update?(): void;
  };
}

const BODY_BONES = STUDIO_HUMANOID_BONE_NAMES.filter((bone) => getStudioHumanoidBoneDescriptor(bone).region !== "finger");

export function isCharacterPoseBodyBone(name: string): boolean { return BODY_BONES.some((bone) => bone === name); }

export const CHARACTER_POSE_EFFECTOR_BONES = ["leftHand", "rightHand", "leftFoot", "rightFoot"] as const;
export type CharacterPoseEffectorBone = typeof CHARACTER_POSE_EFFECTOR_BONES[number];
const CHAINS = {
  leftHand: ["leftUpperArm", "leftLowerArm", "leftHand"],
  rightHand: ["rightUpperArm", "rightLowerArm", "rightHand"],
  leftFoot: ["leftUpperLeg", "leftLowerLeg", "leftFoot"],
  rightFoot: ["rightUpperLeg", "rightLowerLeg", "rightFoot"],
} as const;

const ALL_REGIONS: readonly CharacterPoseRegion[] = ["head", "torso", "left-arm", "right-arm", "left-leg", "right-leg", "left-hand", "right-hand"];
const vector = (value: Vector3): CharacterVector3 => [value.x, value.y, value.z];
const quaternion = (value: Quaternion): CharacterQuaternion => [value.x, value.y, value.z, value.w];

export function readCharacterPoseRuntimeSource(value: unknown): CharacterPoseRuntimeSource | null {
  if (!value || typeof value !== "object" || !("scene" in value) || !(value.scene instanceof Object3D)
    || !("humanoid" in value) || !value.humanoid || typeof value.humanoid !== "object"
    || !("getNormalizedBoneNode" in value.humanoid) || typeof value.humanoid.getNormalizedBoneNode !== "function") return null;
  const humanoid = value.humanoid;
  const getBone = humanoid.getNormalizedBoneNode;
  if (typeof getBone !== "function") return null;
  const update = "update" in humanoid && typeof humanoid.update === "function" ? humanoid.update.bind(humanoid) : undefined;
  const rawRest: unknown = Reflect.get(humanoid, "normalizedRestPose");
  const normalizedRestPose: Partial<Record<StudioHumanoidBoneName, { readonly rotation?: readonly number[] }>> = {};
  if (rawRest && typeof rawRest === "object") {
    for (const name of BODY_BONES) {
      const rest: unknown = Reflect.get(rawRest, name);
      const rotation: unknown = rest && typeof rest === "object" ? Reflect.get(rest, "rotation") : null;
      if (Array.isArray(rotation) && rotation.length === 4 && rotation.every((value) => typeof value === "number" && Number.isFinite(value))) {
        normalizedRestPose[name] = { rotation: [...rotation] };
      }
    }
  }
  return { scene: value.scene, humanoid: { getNormalizedBoneNode: (name) => {
    const node: unknown = getBone.call(humanoid, name);
    return node instanceof Object3D ? node : null;
  }, normalizedRestPose, update } };
}

export function inspectCharacterPoseRuntime(source: CharacterPoseRuntimeSource | null) {
  const effectors = source ? CHARACTER_POSE_EFFECTOR_BONES.filter((name) => CHAINS[name].every((bone) => source.humanoid.getNormalizedBoneNode(bone))) : [];
  return {
    supported: Boolean(source?.humanoid.getNormalizedBoneNode("hips")) && effectors.length > 0,
    effectors,
    reason: !source ? "정규화된 VRM 사람형 뼈대가 필요합니다. 일반 GLB와 비인간형 모델은 지원하지 않습니다."
      : !source.humanoid.getNormalizedBoneNode("hips") || effectors.length === 0 ? "골반과 팔 또는 다리의 상부·하부·끝 관절이 연결된 사람형 뼈대가 필요합니다." : null,
  };
}

/** 메시·재질을 복제하지 않고 뼈대의 조상 변환만 분리하여 계산 중 원본 변경을 막는다. */
function detachedRig(source: CharacterPoseRuntimeSource) {
  const nodes = new Map<Object3D, Object3D>();
  const copy = (node: Object3D): Object3D => {
    const found = nodes.get(node);
    if (found) return found;
    const cloned = new Object3D();
    cloned.position.copy(node.position);
    cloned.quaternion.copy(node.quaternion);
    cloned.scale.copy(node.scale);
    nodes.set(node, cloned);
    if (node.parent) copy(node.parent).add(cloned);
    return cloned;
  };
  const scene = copy(source.scene);
  const bones = new Map<string, Object3D>();
  for (const name of BODY_BONES) {
    const node = source.humanoid.getNormalizedBoneNode(name);
    if (node) bones.set(name, copy(node));
  }
  return { scene, bones, update: () => scene.updateWorldMatrix(true, true) };
}

export function captureCharacterPoseRuntimeV3(input: {
  readonly source: CharacterPoseRuntimeSource;
  readonly poseId: string;
  readonly generationId: number;
}): CharacterPoseDocumentV3 {
  const bones: Record<string, CharacterQuaternion> = {};
  for (const name of BODY_BONES) {
    const node = input.source.humanoid.getNormalizedBoneNode(name);
    if (node) bones[name] = quaternion(node.quaternion.clone().normalize());
  }
  return validateCharacterPoseDocumentV3({
    schemaVersion: 3, poseId: input.poseId, generationId: input.generationId, source: "manual",
    root: { position: vector(input.source.scene.position), rotation: quaternion(input.source.scene.quaternion) },
    bones, confidence: { overall: 1, regions: {}, joints: {} }, effectors: [], contacts: [], fixedControllers: [], regionWeights: {},
    stylization: { exaggeration: 0, silhouetteWeight: 0, preserveFootPlant: true, dramaticImbalance: false }, sourceWarnings: [], solveReceipt: null,
  });
}

export function characterPoseEulerBones(pose: CharacterPoseDocumentV3): Readonly<Record<string, CharacterVector3>> {
  return Object.fromEntries(Object.entries(pose.bones).map(([name, value]) => {
    const rotation = new Euler().setFromQuaternion(new Quaternion(...value), /Hand|Arm|Finger/u.test(name) ? "YXZ" : "XYZ");
    return [name, [rotation.x, rotation.y, rotation.z] as const];
  }));
}

/** 생략한 몸통 관절은 검증된 정규화 rest로 채운다. 현재 포즈를 기본값으로 추측하지 않는다. */
export function resolveCharacterPoseRuntimeV3(source: CharacterPoseRuntimeSource, pose: CharacterPoseDocumentV3): CharacterPoseDocumentV3 {
  validateCharacterPoseDocumentV3(pose);
  for (const name of Object.keys(pose.bones)) {
    if (!isCharacterPoseBodyBone(name)) throw new Error(`${name}: Pose V3는 몸통·팔·다리·머리 관절을 지원합니다. 손가락은 손 모양 편집을 이용해 주세요.`);
  }
  const bones: Record<string, CharacterQuaternion> = {};
  for (const name of BODY_BONES) {
    const rotation = pose.bones[name];
    const node = source.humanoid.getNormalizedBoneNode(name);
    if (rotation && !node) throw new Error(`${name}: 현재 모델에 저장된 관절이 없습니다. 같은 뼈대의 모델을 불러와 주세요.`);
    if (!node) continue;
    if (rotation) { bones[name] = rotation; continue; }
    const rest = source.humanoid.normalizedRestPose?.[name]?.rotation;
    if (!rest || rest.length !== 4 || !rest.every(Number.isFinite) || Math.hypot(...rest) < 1e-8) {
      throw new Error(`${name}: 생략된 관절을 복원할 정규화 rest 회전을 확인할 수 없습니다. 원본은 보존됩니다.`);
    }
    const normalized = new Quaternion(rest[0], rest[1], rest[2], rest[3]).normalize();
    bones[name] = quaternion(normalized);
  }
  return validateCharacterPoseDocumentV3({ ...pose, bones });
}

/** 저장·미리보기·취소·undo가 같은 Quaternion을 재생하며 관절을 재계산하지 않는다. */
export function applyCharacterPoseRuntimeV3(source: CharacterPoseRuntimeSource, pose: CharacterPoseDocumentV3): void {
  const resolved = resolveCharacterPoseRuntimeV3(source, pose);
  for (const name of BODY_BONES) {
    const node = source.humanoid.getNormalizedBoneNode(name);
    const rotation = resolved.bones[name];
    if (node && rotation) node.quaternion.set(...rotation).normalize();
  }
  source.scene.position.set(...pose.root.position);
  source.scene.quaternion.set(...pose.root.rotation).normalize();
  source.scene.updateMatrixWorld(true);
  source.humanoid.update?.();
}

function clampBone(name: string, node: Object3D, child?: Object3D): void {
  const lowerLeg = /LowerLeg/u.test(name);
  const lowerArm = /LowerArm/u.test(name);
  const twist = lowerLeg ? Math.PI / 6 : Math.PI / 2;
  const swing = name === "neck" ? Math.PI * 0.42 : lowerLeg ? Math.PI * 0.92 : Math.PI * 0.95;
  const axis = child?.position.clone().normalize() ?? new Vector3(0, 1, 0);
  const limited = limitCharacterSwingTwist(quaternion(node.quaternion), {
    twistAxis: vector(axis), primarySwingAxis: /Leg/u.test(name) || lowerArm ? [0, 0, 1] : undefined, maximumPrimarySwingRadians: swing,
    maximumSecondarySwingRadians: lowerLeg ? Math.PI / 8 : lowerArm ? Math.PI / 3 : swing,
    minimumTwistRadians: -twist, maximumTwistRadians: twist,
  });
  node.quaternion.set(...limited.rotation);
}

function aimBone(node: Object3D, child: Object3D, target: Vector3): void {
  node.updateWorldMatrix(true, true);
  const start = node.getWorldPosition(new Vector3());
  const from = child.getWorldPosition(new Vector3()).sub(start);
  const to = target.clone().sub(start);
  if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return;
  const world = node.getWorldQuaternion(new Quaternion());
  const nextWorld = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize()).multiply(world);
  const parent = node.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
  node.quaternion.copy(parent.invert().multiply(nextWorld)).normalize();
  node.updateWorldMatrix(false, true);
}

function receiptHash(pose: CharacterPoseDocumentV3): string {
  let value = 2166136261;
  for (const character of JSON.stringify(pose)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function solveCharacterPoseRuntimeV3(input: {
  readonly source: CharacterPoseRuntimeSource;
  readonly pose: CharacterPoseDocumentV3;
  readonly selectedRegions?: readonly CharacterPoseRegion[];
  readonly preserveFootPlant?: boolean;
  readonly groundY?: number;
}) {
  const pose = validateCharacterPoseDocumentV3(input.pose);
  const capability = inspectCharacterPoseRuntime(input.source);
  if (!capability.supported) throw new Error(capability.reason ?? "지원하지 않는 사람형 뼈대입니다.");
  const rig = detachedRig(input.source);
  const selected = new Set(input.selectedRegions ?? ALL_REGIONS);
  const locked = new Set(pose.fixedControllers.filter((item) => item.lockRotation).map((item) => item.bone));
  const selectedBone = (name: string) => selected.has(characterPoseRegionForBone(name)) && !locked.has(name);
  const preserveFeet = input.preserveFootPlant ?? pose.stylization.preserveFootPlant;
  const contacts = pose.contacts.filter((contact) => preserveFeet || !contact.id.startsWith("runtime:"));
  const moveRoot = selected.has("torso") && selected.has("left-leg") && selected.has("right-leg");
  rig.update();
  if (preserveFeet) for (const foot of ["leftFoot", "rightFoot"] as const) {
    const node = rig.bones.get(foot);
    if (!node || contacts.some((contact) => contact.bone === foot)) continue;
    const target = node.getWorldPosition(new Vector3());
    if (input.groundY !== undefined && Number.isFinite(input.groundY)) target.y = input.groundY;
    contacts.push({ id: `runtime:${foot}`, bone: foot, kind: "ground", mode: "hard-pin", target: vector(target), tolerance: 0.01, weight: 1 });
  }
  if (moveRoot) {
    rig.scene.position.set(...pose.root.position);
    rig.scene.quaternion.set(...pose.root.rotation);
  }
  const appliedBones: string[] = [];
  const preservedBones: string[] = [];
  for (const [name, node] of rig.bones) {
    const requested = pose.bones[name];
    if (requested && selectedBone(name)) {
      node.quaternion.set(...requested).normalize();
      const child = [...rig.bones.values()].find((candidate) => candidate.parent === node);
      clampBone(name, node, child);
      appliedBones.push(name);
    } else preservedBones.push(name);
  }
  rig.update();
  // 몸통과 양 다리를 함께 선택한 경우에만 루트를 이동해 다른 부위의 월드 위치를 보존한다.
  const groundContacts = contacts.filter((contact) => contact.kind === "ground" && contact.weight > 0);
  const rootWorld = rig.scene.getWorldPosition(new Vector3());
  const balance = solveCharacterGroundBalance({
    rootPosition: vector(rootWorld), groundY: 0,
    contacts: groundContacts.flatMap((contact) => {
      const node = rig.bones.get(contact.bone);
      return node ? [{ id: contact.id, position: vector(node.getWorldPosition(new Vector3()).sub(new Vector3(...contact.target))), weight: contact.weight }] : [];
    }),
    supportPoints: groundContacts.map((contact) => [contact.target[0], contact.target[2]]),
    massSegments: [...rig.bones.entries()].map(([name, node]) => ({ id: name, position: vector(node.getWorldPosition(new Vector3())), mass: /hips|spine|chest/iu.test(name) ? 8 : 1 })),
    dramaticImbalance: pose.stylization.dramaticImbalance, targetMargin: 0,
    maximumHorizontalCorrection: moveRoot ? 0.08 : 0,
  });
  if (moveRoot && groundContacts.length > 0) {
    const next = new Vector3(...balance.rootPosition);
    rig.scene.position.copy(rig.scene.parent ? rig.scene.parent.worldToLocal(next) : next);
    rig.update();
  }
  const warnings: string[] = [];
  const effectors = [...pose.effectors];
  for (const contact of contacts) {
    if (!effectors.some((effector) => effector.bone === contact.bone)) effectors.push({
      id: `effector:${contact.id}`, bone: contact.bone, target: contact.target, weight: contact.weight, pinned: contact.mode === "hard-pin",
    });
  }
  let maximumError = 0;
  let unresolvedEffectors = false;
  for (const effector of effectors) {
    const key = CHARACTER_POSE_EFFECTOR_BONES.find((name) => name === effector.bone);
    if (effector.weight <= 0) continue;
    if (!key) {
      unresolvedEffectors = true;
      warnings.push(`${effector.bone}: 지원하지 않는 위치 제어 관절입니다.`);
      continue;
    }
    const [upperName, lowerName, endName] = CHAINS[key];
    const upper = rig.bones.get(upperName); const lower = rig.bones.get(lowerName); const end = rig.bones.get(endName);
    if (!upper || !lower || !end || !selectedBone(upperName) || !selectedBone(lowerName)) {
      if (end) maximumError = Math.max(maximumError, end.getWorldPosition(new Vector3()).distanceTo(new Vector3(...effector.target)));
      else unresolvedEffectors = true;
      warnings.push(`${effector.bone}: 선택하지 않았거나 잠긴 관절은 보존했습니다.`); continue;
    }
    const target = end.getWorldPosition(new Vector3()).lerp(new Vector3(...effector.target), effector.pinned ? 1 : effector.weight);
    const start = upper.getWorldPosition(new Vector3());
    const joint = lower.getWorldPosition(new Vector3());
    const tip = end.getWorldPosition(new Vector3());
    const pole = effector.poleTarget ? new Vector3(...effector.poleTarget) : joint.clone().add(new Vector3(0, 0, /Foot/u.test(key) ? 1 : -1).applyQuaternion(rig.scene.getWorldQuaternion(new Quaternion())));
    const solved = solveCharacterTwoBoneIk({ start: vector(start), joint: vector(joint), end: vector(tip), target: vector(target), pole: vector(pole), stretch: 1 });
    if (solved.degenerate) {
      unresolvedEffectors = true;
      maximumError = Math.max(maximumError, tip.distanceTo(new Vector3(...effector.target)));
      warnings.push(`${key}: 길이가 없는 관절은 보정할 수 없습니다.`); continue;
    }
    aimBone(upper, lower, new Vector3(...solved.joint));
    clampBone(upperName, upper, lower); rig.update();
    aimBone(lower, end, new Vector3(...solved.end));
    clampBone(lowerName, lower, end); rig.update();
    if (effector.rotation && selectedBone(endName)) end.quaternion.set(...effector.rotation).normalize();
    const error = end.getWorldPosition(new Vector3()).distanceTo(new Vector3(...effector.target));
    maximumError = Math.max(maximumError, error);
    if (error > 0.01) warnings.push(`${key}: 관절 한계 또는 도달 거리로 ${error.toFixed(3)}m 오차가 남았습니다.`);
  }
  const bones = Object.fromEntries([...rig.bones].map(([name, node]) => [name, quaternion(node.quaternion)]));
  const result = validateCharacterPoseDocumentV3({
    ...pose, bones, contacts, root: { position: vector(rig.scene.position), rotation: quaternion(rig.scene.quaternion) },
    stylization: { ...pose.stylization, preserveFootPlant: preserveFeet },
    solveReceipt: { solverRevision: "runtime-v3.1", inputHash: receiptHash(pose), iterations: 1, converged: !unresolvedEffectors && maximumError <= 0.01, maximumError, centerOfMassMargin: Number.isFinite(balance.marginAfter) ? balance.marginAfter : null, warnings },
  });
  return { pose: result, eulerBones: characterPoseEulerBones(result), appliedBones, preservedBones, warnings, maximumError };
}
