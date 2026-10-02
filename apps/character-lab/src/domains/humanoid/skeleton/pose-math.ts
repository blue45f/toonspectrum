/**
 * 포즈 수학(CPU 참고 구현): 본 월드 행렬, 역바인드, 선형 블렌드 스키닝, 스켈레톤 기반 충돌 캡슐.
 * 엔진(render)이 같은 의미로 GPU 스키닝을 하는지 비교하는 기준이며, 물리 충돌 캡슐 갱신에도 쓴다.
 * world(b) = world(parent) · T(rest) · R(rest · pose). identity 포즈에서 skinning = I(원형 복원).
 */
import { HUMANOID_BONE_NAMES, isHumanoidBoneName, type CapsuleCollider, type HumanoidBoneName, type MeshPartData, type Pose, type SkeletonData } from "../../../contracts";
import { mat4FromTRS, mat4Identity, mat4Invert, mat4Multiply, qMultiply, qNormalize, type Mat4, type Quat, type Vec3 } from "../../../shared/math";

export interface BoneMatrices {
  /** skeleton.bones 순서의 본 이름 */
  readonly order: readonly string[];
  readonly world: readonly Mat4[];
  readonly inverseBind: readonly Mat4[];
  /** world · inverseBind (정점에 바로 곱한다) */
  readonly skinning: readonly Mat4[];
}

function parentIndexMap(skeleton: SkeletonData): Int32Array {
  const index = new Map<string, number>();
  skeleton.bones.forEach((bone, i) => index.set(bone.name, i));
  const parents = new Int32Array(skeleton.bones.length);
  skeleton.bones.forEach((bone, i) => {
    if (bone.parent === null) {
      parents[i] = -1;
      return;
    }
    const p = index.get(bone.parent);
    if (p === undefined) throw new Error(`본 ${bone.name}의 부모 ${bone.parent}가 스켈레톤에 없습니다.`);
    if (p >= i) throw new Error(`본 ${bone.name}의 부모 ${bone.parent}가 자식보다 뒤에 있습니다(위상 순서 위반).`);
    parents[i] = p;
  });
  return parents;
}

/** rest 포즈 월드 행렬 */
export function restWorldMatrices(skeleton: SkeletonData): Mat4[] {
  return boneWorldMatrices(skeleton, {}).world as Mat4[];
}

/** 스펙 공개 API: 포즈(본별 로컬 회전)를 적용한 월드·스키닝 행렬 */
export function boneWorldMatrices(skeleton: SkeletonData, pose: Pose): BoneMatrices {
  const parents = parentIndexMap(skeleton);
  const world: Mat4[] = [];
  const rest: Mat4[] = [];
  skeleton.bones.forEach((bone, i) => {
    const poseRotation: Quat | undefined = isHumanoidBoneName(bone.name) ? pose[bone.name] : undefined;
    const rotation = poseRotation ? qNormalize(qMultiply(bone.restRotation, poseRotation)) : bone.restRotation;
    const local = mat4FromTRS(bone.restTranslation, rotation);
    const localRest = mat4FromTRS(bone.restTranslation, bone.restRotation);
    const parent = parents[i];
    world.push(parent < 0 ? local : mat4Multiply(world[parent], local));
    rest.push(parent < 0 ? localRest : mat4Multiply(rest[parent], localRest));
  });
  const inverseBind = rest.map((m, i) => {
    const inv = mat4Invert(m);
    if (!inv) throw new Error(`본 ${skeleton.bones[i].name}의 rest 행렬이 특이 행렬입니다.`);
    return inv;
  });
  const skinning = world.map((w, i) => mat4Multiply(w, inverseBind[i]));
  return { order: skeleton.bones.map((b) => b.name), world, inverseBind, skinning };
}

/** 본 월드 위치(rest 또는 포즈) */
export function boneWorldPosition(matrices: BoneMatrices, boneName: string): Vec3 | null {
  const i = matrices.order.indexOf(boneName);
  if (i < 0) return null;
  const m = matrices.world[i];
  return [m[12], m[13], m[14]];
}

/** 스펙 공개 API: CPU 선형 블렌드 스키닝(참고 구현). 스킨 데이터가 없으면 위치를 복사한다. */
export function skinPositionsCpu(part: Pick<MeshPartData, "positions" | "jointIndices" | "jointWeights">, matrices: BoneMatrices): Float32Array {
  const out = new Float32Array(part.positions.length);
  const { jointIndices, jointWeights } = part;
  if (!jointIndices || !jointWeights) {
    out.set(part.positions);
    return out;
  }
  const vertexCount = part.positions.length / 3;
  for (let v = 0; v < vertexCount; v += 1) {
    const x = part.positions[v * 3];
    const y = part.positions[v * 3 + 1];
    const z = part.positions[v * 3 + 2];
    let ox = 0;
    let oy = 0;
    let oz = 0;
    for (let i = 0; i < 4; i += 1) {
      const w = jointWeights[v * 4 + i];
      if (w === 0) continue;
      const m = matrices.skinning[jointIndices[v * 4 + i]];
      if (!m) throw new Error(`정점 ${v}의 본 인덱스 ${jointIndices[v * 4 + i]}가 스켈레톤 범위를 벗어납니다.`);
      ox += w * (m[0] * x + m[4] * y + m[8] * z + m[12]);
      oy += w * (m[1] * x + m[5] * y + m[9] * z + m[13]);
      oz += w * (m[2] * x + m[6] * y + m[10] * z + m[14]);
    }
    out[v * 3] = ox;
    out[v * 3 + 1] = oy;
    out[v * 3 + 2] = oz;
  }
  return out;
}

/** 충돌 캡슐을 만들 본과 캡슐 끝(자식 본) */
const COLLIDER_CHAIN: ReadonlyArray<readonly [HumanoidBoneName, HumanoidBoneName | null]> = [
  ["hips", "spine"],
  ["spine", "chest"],
  ["chest", "upperChest"],
  ["upperChest", "neck"],
  ["neck", "head"],
  ["head", null],
  ["leftUpperArm", "leftLowerArm"],
  ["leftLowerArm", "leftHand"],
  ["rightUpperArm", "rightLowerArm"],
  ["rightLowerArm", "rightHand"],
  ["leftUpperLeg", "leftLowerLeg"],
  ["leftLowerLeg", "leftFoot"],
  ["rightUpperLeg", "rightLowerLeg"],
  ["rightLowerLeg", "rightFoot"],
];

/**
 * 스펙 공개 API: 스켈레톤에서 본 로컬 캡슐 충돌체를 만든다. a = 본 원점, b = 자식 본의 rest 오프셋(머리는 위로 연장).
 * radii에 없는 본은 건너뛴다.
 */
export function collidersFromSkeleton(skeleton: SkeletonData, radii: Partial<Record<HumanoidBoneName, number>>, headHeight = 0.14): CapsuleCollider[] {
  const byName = new Map(skeleton.bones.map((b) => [b.name, b]));
  const out: CapsuleCollider[] = [];
  for (const [bone, child] of COLLIDER_CHAIN) {
    const radius = radii[bone];
    if (radius === undefined || !byName.has(bone)) continue;
    const childBone = child ? byName.get(child) : undefined;
    const b: Vec3 = childBone ? childBone.restTranslation : [0, headHeight, 0];
    out.push({ bone, a: [0, 0, 0], b, radius });
  }
  return out;
}

/**
 * 체형 morph 가중치만큼 관절 rest 위치를 옮긴 스켈레톤(CPU 참고 구현). `jointOffsets`는 morph 이름 → 본 → rest 평행이동 오프셋이며
 * (`buildHumanoidModel`이 `ProceduralHumanoidModel.jointOffsets`로 돌려준다) 가중치 w인 morph는 본마다 w × 오프셋을 더한다.
 * 정점이 morph로 움직였는데 본이 그대로면 팔꿈치 같은 관절이 옛 위치에서 회전해 형상이 찢어지므로, 엔진은 이 합을 rest 본에 반영하고
 * 역바인드를 morph된 rest에서 다시 만들어야 한다(이 함수 + `boneWorldMatrices`가 그 기준 구현).
 */
export function skeletonWithJointOffsets(
  skeleton: SkeletonData,
  jointOffsets: Readonly<Partial<Record<string, Readonly<Partial<Record<string, Vec3>>>>>>,
  weights: Readonly<Partial<Record<string, number>>>,
): SkeletonData {
  const sum = new Map<string, Vec3>();
  for (const [morphName, weight] of Object.entries(weights)) {
    if (!weight) continue;
    const perBone = jointOffsets[morphName];
    if (!perBone) continue;
    for (const [bone, offset] of Object.entries(perBone)) {
      if (!offset) continue;
      const previous = sum.get(bone) ?? [0, 0, 0];
      sum.set(bone, [previous[0] + weight * offset[0], previous[1] + weight * offset[1], previous[2] + weight * offset[2]]);
    }
  }
  return {
    bones: skeleton.bones.map((bone) => {
      const delta = sum.get(bone.name);
      return delta ? { ...bone, restTranslation: [bone.restTranslation[0] + delta[0], bone.restTranslation[1] + delta[1], bone.restTranslation[2] + delta[2]] } : bone;
    }),
  };
}

/** 항등 행렬 배열(테스트·초기화용) */
export function identityMatrices(count: number): Mat4[] {
  return Array.from({ length: count }, () => mat4Identity());
}

export const HUMANOID_BONE_COUNT = HUMANOID_BONE_NAMES.length;
