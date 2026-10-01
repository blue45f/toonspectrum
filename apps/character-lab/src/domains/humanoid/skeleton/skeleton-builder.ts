/**
 * VRM 1.0 휴머노이드 55본 rest 스켈레톤. 비례(proportions.ts)에서 월드 위치를 비율표로 배치하고
 * 부모 기준 평행이동만 담는다(rest 회전은 항등: VRM 정규화 리그 규약, T-포즈·손바닥 아래·+x = 왼쪽).
 * 본 순서는 contracts/bones.ts의 HUMANOID_BONE_NAMES 그대로다.
 * 원리 참고: three-vrm 정규화 리그(포즈 = rest 기준 로컬 회전만), SMPL 관절 회귀(개념만).
 */
import { HUMANOID_BONE_NAMES, HUMANOID_BONE_PARENTS, IDENTITY_QUAT, type BoneData, type HumanoidBoneName, type SkeletonData } from "../../../contracts";
import { v3Add, v3Scale, v3Sub, type Vec3 } from "../../../shared/math";
import { HEAD_LANDMARKS, LEFT_THUMB_AXIS, fingerCenterZ, headLocalToWorld, leftKnuckleX, leftThumbBase, leftWristX, type BodyProportions } from "../proportions";

export type BoneWorldPositions = Readonly<Record<HumanoidBoneName, Vec3>>;

function mirror(p: Vec3): Vec3 {
  return [-p[0], p[1], p[2]];
}

/** 모든 휴머노이드 본의 rest 월드 위치(m) */
export function boneWorldPositions(p: BodyProportions): BoneWorldPositions {
  const frame = p.head;
  const y = p.shoulderJointY;
  const wristX = leftWristX(p);
  const knuckleX = leftKnuckleX(p);
  const left: Partial<Record<HumanoidBoneName, Vec3>> = {
    hips: [0, p.hipsBoneY, 0],
    spine: [0, p.spineY, 0],
    chest: [0, p.chestBoneY, 0],
    upperChest: [0, p.upperChestBoneY, 0],
    neck: [0, p.neckBaseY, 0],
    head: [0, frame.center[1] - 0.3 * frame.scale, 0],
    leftEye: headLocalToWorld(frame, HEAD_LANDMARKS.eye),
    jaw: headLocalToWorld(frame, HEAD_LANDMARKS.jawPivot),
    leftShoulder: [0.045 * p.scale, y + 0.01 * p.scale, 0],
    leftUpperArm: [p.shoulderJointX, y, 0],
    leftLowerArm: [p.shoulderJointX + p.upperArmLength, y, 0],
    leftHand: [wristX, y, 0],
    leftUpperLeg: [p.legJointX, p.hipJointY, 0],
    leftLowerLeg: [p.legJointX, p.ankleY + p.lowerLegLength, 0],
    leftFoot: [p.legJointX, p.ankleY, 0],
    leftToes: [p.legJointX, 0.015 * p.scale, 0.1 * p.scale],
  };
  const fingerNames: ReadonlyArray<readonly [HumanoidBoneName, HumanoidBoneName, HumanoidBoneName]> = [
    ["leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal"],
    ["leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal"],
    ["leftRingProximal", "leftRingIntermediate", "leftRingDistal"],
    ["leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal"],
  ];
  fingerNames.forEach(([proximal, intermediate, distal], index) => {
    const z = fingerCenterZ(p, index);
    const lengths = p.fingers[index];
    left[proximal] = [knuckleX, y, z];
    left[intermediate] = [knuckleX + lengths.proximal, y, z];
    left[distal] = [knuckleX + lengths.proximal + lengths.intermediate, y, z];
  });
  const thumbBase = leftThumbBase(p);
  left.leftThumbMetacarpal = thumbBase;
  left.leftThumbProximal = v3Add(thumbBase, v3Scale(LEFT_THUMB_AXIS, p.thumb.proximal));
  left.leftThumbDistal = v3Add(thumbBase, v3Scale(LEFT_THUMB_AXIS, p.thumb.proximal + p.thumb.intermediate));

  const out: Partial<Record<HumanoidBoneName, Vec3>> = {};
  for (const name of HUMANOID_BONE_NAMES) {
    const direct = left[name];
    if (direct) {
      out[name] = direct;
      continue;
    }
    if (!name.startsWith("right")) throw new Error(`본 위치가 정의되지 않았습니다: ${name}`);
    const leftName = `left${name.slice(5)}` as HumanoidBoneName;
    const source = left[leftName];
    if (!source) throw new Error(`거울 본 위치가 정의되지 않았습니다: ${leftName}`);
    out[name] = mirror(source);
  }
  return out as BoneWorldPositions;
}

/** 스펙 공개 API: 55본 rest 스켈레톤(부모 기준 평행이동, 회전 항등) */
export function buildHumanoidSkeleton(p: BodyProportions): SkeletonData {
  const positions = boneWorldPositions(p);
  const bones: BoneData[] = HUMANOID_BONE_NAMES.map((name) => {
    const parent = HUMANOID_BONE_PARENTS[name];
    const world = positions[name];
    const restTranslation = parent === null ? world : v3Sub(world, positions[parent]);
    return { name, parent, restTranslation, restRotation: IDENTITY_QUAT };
  });
  return { bones };
}

/** 스킨 웨이트·충돌 캡슐용 본 반경(m). 눈·턱은 자동 웨이트에서 제외한다(0). */
export function boneCapsuleRadii(p: BodyProportions): Readonly<Record<HumanoidBoneName, number>> {
  const finger = p.fingerRadius * 1.3;
  const out: Partial<Record<HumanoidBoneName, number>> = {
    hips: p.hipHalfWidth * 0.85,
    spine: p.waistHalfWidth * 0.9,
    chest: p.chestHalfWidth * 0.9,
    upperChest: p.shoulderHalfWidth * 0.8,
    neck: p.neckRadius * 1.3,
    head: p.head.scale * 1.0,
    leftEye: 0,
    rightEye: 0,
    jaw: 0,
    leftShoulder: p.upperArmRadius * 1.1,
    leftUpperArm: p.upperArmRadius,
    leftLowerArm: p.elbowRadius * 0.95,
    leftHand: p.handThickness * 0.9,
    leftUpperLeg: p.thighRadius,
    leftLowerLeg: p.calfRadius,
    leftFoot: p.ankleRadius * 1.1,
    leftToes: p.footHalfWidth * 0.8,
  };
  for (const name of HUMANOID_BONE_NAMES) {
    if (out[name] !== undefined) continue;
    if (name.startsWith("right")) {
      out[name] = out[`left${name.slice(5)}` as HumanoidBoneName] ?? finger;
      continue;
    }
    out[name] = finger;
  }
  return out as Record<HumanoidBoneName, number>;
}

/** 자동 웨이트용 월드 캡슐: 본 위치 → 자식(또는 말단 연장) 위치 */
export interface BoneCapsule {
  readonly bone: HumanoidBoneName;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly radius: number;
}

const CHILD_FOR_CAPSULE: Readonly<Partial<Record<HumanoidBoneName, HumanoidBoneName>>> = {
  hips: "spine",
  spine: "chest",
  chest: "upperChest",
  upperChest: "neck",
  neck: "head",
  leftShoulder: "leftUpperArm",
  leftUpperArm: "leftLowerArm",
  leftLowerArm: "leftHand",
  leftHand: "leftMiddleProximal",
  leftUpperLeg: "leftLowerLeg",
  leftLowerLeg: "leftFoot",
  leftFoot: "leftToes",
  leftThumbMetacarpal: "leftThumbProximal",
  leftThumbProximal: "leftThumbDistal",
  leftIndexProximal: "leftIndexIntermediate",
  leftIndexIntermediate: "leftIndexDistal",
  leftMiddleProximal: "leftMiddleIntermediate",
  leftMiddleIntermediate: "leftMiddleDistal",
  leftRingProximal: "leftRingIntermediate",
  leftRingIntermediate: "leftRingDistal",
  leftLittleProximal: "leftLittleIntermediate",
  leftLittleIntermediate: "leftLittleDistal",
};

function capsuleChild(name: HumanoidBoneName): HumanoidBoneName | null {
  const direct = CHILD_FOR_CAPSULE[name];
  if (direct) return direct;
  if (name.startsWith("right")) {
    const leftChild = CHILD_FOR_CAPSULE[`left${name.slice(5)}` as HumanoidBoneName];
    return leftChild ? (`right${leftChild.slice(4)}` as HumanoidBoneName) : null;
  }
  return null;
}

/** 말단 본의 캡슐 끝: 손가락 끝·발가락 끝·머리 꼭대기 */
function leafTail(name: HumanoidBoneName, p: BodyProportions, start: Vec3): Vec3 {
  if (name === "head") return v3Add(start, [0, p.head.scale * 1.3, 0]);
  if (name.endsWith("Toes")) return v3Add(start, [0, 0, 0.06 * p.scale]);
  if (name.endsWith("ThumbDistal")) {
    const axis = name.startsWith("left") ? LEFT_THUMB_AXIS : mirror(LEFT_THUMB_AXIS);
    return v3Add(start, v3Scale(axis, p.thumb.distal));
  }
  const sign = name.startsWith("left") ? 1 : -1;
  const finger = name.includes("Index") ? 0 : name.includes("Middle") ? 1 : name.includes("Ring") ? 2 : 3;
  return v3Add(start, [sign * p.fingers[finger].distal, 0, 0]);
}

/** 자동 웨이트 후보 캡슐(눈·턱 제외, 하체 hips 캡슐은 가랑이까지 내린다) */
export function boneCapsules(p: BodyProportions): BoneCapsule[] {
  const positions = boneWorldPositions(p);
  const radii = boneCapsuleRadii(p);
  const capsules: BoneCapsule[] = [];
  for (const name of HUMANOID_BONE_NAMES) {
    const radius = radii[name];
    if (radius <= 0) continue;
    const start = positions[name];
    const child = capsuleChild(name);
    let a = start;
    let b = child ? positions[child] : leafTail(name, p, start);
    if (name === "hips") {
      a = [0, p.crotchY, 0];
      b = positions.spine;
    }
    capsules.push({ bone: name, a, b, radius });
  }
  return capsules;
}
