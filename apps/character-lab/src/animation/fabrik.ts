/**
 * FABRIK(Forward And Backward Reaching IK) 체인 솔버 + 휴머노이드 체인(척추·손가락)의 Pose 환산.
 *
 * 원리(Aristidou & Lasenby 2011; 구조 참고 lo-th/fullik·Caliko, 코드 복제 없음 — TS 자체 구현):
 *   전방 패스: p_n = T, p_i = p_{i+1} + l_i·(p_i − p_{i+1}) / |p_i − p_{i+1}|
 *   후방 패스: p_0 = root 고정, p_{i+1} = p_i + l_i·(p_{i+1} − p_i) / |p_{i+1} − p_i|
 *   반복 ≤ maxIterations(기본 10) 또는 |p_n − T| ≤ tolerance(기본 1e-3 m = 1 mm).
 * 초기 추정(수렴 가속, 길이 보존): 첫 반복 전에 체인 전체를 루트 기준으로 강체 회전시켜 말단이 목표 방향을 보게 하고,
 * 축과 공선인 체인은 전·후방 패스가 접지 못하므로(공선 특이점) 세그먼트를 부채꼴(+α…−α)로 접어 말단 거리를
 * 목표 거리에 맞춘다(α는 이분법). 부풀 방향은 poleDirection → 현재 굽힘 방향 → 임의 수직 순으로 고른다.
 * 제약은 후방 패스에서 세그먼트 방향에 적용한다: 힌지(축 성분 제거) → 원뿔(이전 세그먼트 방향 기준 최대 꺾임각).
 * 도달 불가(목표가 총 길이 밖)는 목표 방향으로 곧게 편 체인과 한글 사유를 돌려준다(무음 대체 없음).
 *
 * 사지(팔꿈치·무릎)는 해석적 two-bone(two-bone-ik.ts)을 쓰고, 이 솔버는 척추·손가락처럼 세그먼트가
 * 3개 이상이거나 관절마다 원뿔 제약이 필요한 체인용이다. 결과 관절 위치는 본별 from-to 쿼터니언으로
 * 루트부터 순차 환산하며 JOINT_LIMITS_DEG swing-twist 클램프를 반영해 재FK로 실제 오차를 측정한다.
 */
import { JOINT_LIMITS_DEG } from "../contracts/bones";
import {
  clamp,
  degToRad,
  qConjugate,
  qMultiply,
  qNormalize,
  qRotateVec3,
  quatFromTo,
  v3Add,
  v3AnyPerpendicular,
  v3Distance,
  v3Dot,
  v3IsFinite,
  v3Length,
  v3Normalize,
  v3Scale,
  v3Sub,
} from "../shared/math";

import { clampBoneRotation } from "./joint-limits";
import { boneAxisLocal, composeLocalRotation, computeWorldTransforms, indexBones, poseRotationFromWorld } from "./skeleton-fk";

import type { HumanoidBoneName } from "../contracts/bones";
import type { SkeletonData } from "../contracts/mesh-data";
import type { Pose, Quat, Vec3 } from "../contracts/pose";
import type { Side } from "./presets/rotation-dsl";

export interface FabrikJointConstraint {
  /** 이전 세그먼트 방향(세그먼트 0은 rootDirection) 기준 최대 꺾임각(도). 없으면 제한 없음. */
  readonly coneDeg?: number;
  /** 힌지 축(월드, 단위 벡터가 아니어도 됨). 세그먼트 방향에서 이 축 성분을 제거한다. */
  readonly hingeAxis?: Vec3;
}

export interface FabrikInput {
  /** 관절 위치(≥ 2개). points[0]은 루트(고정), 마지막이 말단. */
  readonly points: readonly Vec3[];
  readonly target: Vec3;
  /** 기본 10 */
  readonly maxIterations?: number;
  /** 기본 1e-3 (m) */
  readonly tolerance?: number;
  /** 세그먼트 i(points[i] → points[i+1])의 제약 */
  readonly constraints?: ReadonlyArray<FabrikJointConstraint | undefined>;
  /** 세그먼트 0의 원뿔 기준 방향(월드). 없으면 세그먼트 0은 원뿔 제약을 받지 않는다. */
  readonly rootDirection?: Vec3;
  /** 초기 추정에서 체인 중간이 부풀 방향 힌트(월드). 없으면 현재 굽힘 방향, 그것도 없으면 임의 수직. */
  readonly poleDirection?: Vec3;
}

export type FabrikStatus = "reached" | "max-reach" | "unconverged" | "degenerate";

export interface FabrikResult {
  readonly points: readonly Vec3[];
  readonly iterations: number;
  /** |말단 − target| */
  readonly error: number;
  readonly reached: boolean;
  readonly status: FabrikStatus;
  readonly reasonKo?: string;
}

export const FABRIK_DEFAULT_ITERATIONS = 10;
export const FABRIK_DEFAULT_TOLERANCE = 1e-3;
const LENGTH_EPSILON = 1e-9;

/** from→to 단위 방향. 두 점이 겹치면 fallback을 쓴다. */
function safeDirection(from: Vec3, to: Vec3, fallback: Vec3): Vec3 {
  const d = v3Sub(to, from);
  return v3Length(d) < LENGTH_EPSILON ? fallback : v3Normalize(d);
}

/** 세그먼트 방향에 힌지·원뿔 제약을 적용한다(단위 벡터 입력·출력). reference가 null이면 원뿔은 건너뛴다. */
export function constrainDirection(dir: Vec3, reference: Vec3 | null, constraint: FabrikJointConstraint | undefined): Vec3 {
  let d = v3Normalize(dir);
  if (constraint?.hingeAxis) {
    const axis = v3Normalize(constraint.hingeAxis);
    const projected = v3Sub(d, v3Scale(axis, v3Dot(d, axis)));
    if (v3Length(projected) > LENGTH_EPSILON) d = v3Normalize(projected);
  }
  if (constraint?.coneDeg !== undefined && reference && v3Length(reference) > LENGTH_EPSILON) {
    const ref = v3Normalize(reference);
    const cone = degToRad(clamp(constraint.coneDeg, 0, 180));
    const cos = clamp(v3Dot(d, ref), -1, 1);
    const angle = Math.acos(cos);
    if (angle > cone + 1e-12) {
      let perp = v3Sub(d, v3Scale(ref, cos));
      perp = v3Length(perp) < LENGTH_EPSILON ? v3AnyPerpendicular(ref) : v3Normalize(perp);
      d = v3Normalize(v3Add(v3Scale(ref, Math.cos(cone)), v3Scale(perp, Math.sin(cone))));
    }
  }
  return d;
}

export function solveFabrik(input: FabrikInput): FabrikResult {
  const points: Vec3[] = input.points.map((p): Vec3 => [p[0], p[1], p[2]]);
  const segmentCount = points.length - 1;
  const { target } = input;
  const maxIterations = Math.max(1, Math.floor(input.maxIterations ?? FABRIK_DEFAULT_ITERATIONS));
  const tolerance = Math.max(0, input.tolerance ?? FABRIK_DEFAULT_TOLERANCE);
  const degenerate = (reasonKo: string): FabrikResult => {
    const end = points[segmentCount];
    return { points, iterations: 0, error: end && v3IsFinite(end) && v3IsFinite(target) ? v3Distance(end, target) : Number.POSITIVE_INFINITY, reached: false, status: "degenerate", reasonKo };
  };
  if (segmentCount < 1) return degenerate("FABRIK 체인에는 관절이 2개 이상 필요합니다.");
  if (!points.every(v3IsFinite) || !v3IsFinite(target)) return degenerate("FABRIK 입력에 유한하지 않은 좌표가 있습니다.");

  const lengths: number[] = [];
  for (let i = 0; i < segmentCount; i += 1) {
    const length = v3Distance(points[i + 1] ?? target, points[i] ?? target);
    if (length < LENGTH_EPSILON) return degenerate(`FABRIK 체인의 세그먼트 ${i} 길이가 0입니다.`);
    lengths.push(length);
  }
  const total = lengths.reduce((sum, l) => sum + l, 0);
  const root = points[0] ?? target;
  const constraints = input.constraints ?? [];
  const at = (i: number): Vec3 => points[i] ?? root;

  /** 후방 패스(루트 고정 + 제약). 세그먼트 방향이 퇴화하면 이전 방향을 쓴다. */
  const backward = (): void => {
    const previous = lengths.map((_, i) => safeDirection(at(i), at(i + 1), [0, 1, 0]));
    points[0] = root;
    for (let i = 0; i < segmentCount; i += 1) {
      const raw = safeDirection(at(i), at(i + 1), previous[i] ?? [0, 1, 0]);
      const reference = i === 0 ? (input.rootDirection ?? null) : safeDirection(at(i - 1), at(i), previous[i - 1] ?? [0, 1, 0]);
      const dir = constrainDirection(raw, reference, constraints[i]);
      points[i + 1] = v3Add(at(i), v3Scale(dir, lengths[i] ?? 0));
    }
  };

  const rootDistance = v3Distance(target, root);
  if (rootDistance > total) {
    const dir = v3Normalize(v3Sub(target, root));
    for (let i = 0; i < segmentCount; i += 1) points[i + 1] = v3Add(at(i), v3Scale(dir, lengths[i] ?? 0));
    backward();
    return {
      points,
      iterations: 0,
      error: v3Distance(at(segmentCount), target),
      reached: false,
      status: "max-reach",
      reasonKo: `목표가 체인 총 길이(${total.toFixed(3)} m)보다 멀어 최대로 뻗었습니다.`,
    };
  }

  let iterations = 0;
  let error = v3Distance(at(segmentCount), target);
  if (error > tolerance) {
    // 초기 추정 1: 루트→말단 방향을 루트→목표 축으로 돌린다(강체 회전, 길이 보존).
    const endDir = safeDirection(root, at(segmentCount), [0, 1, 0]);
    const axis = safeDirection(root, target, endDir);
    const pre = quatFromTo(endDir, axis);
    for (let i = 1; i <= segmentCount; i += 1) points[i] = v3Add(root, qRotateVec3(pre, v3Sub(at(i), root)));
    // 초기 추정 2: 목표가 총 길이보다 가까우면 부채꼴로 접어 말단 거리를 맞춘다(공선 특이점 회피).
    if (segmentCount >= 2 && rootDistance < total - LENGTH_EPSILON) {
      let bulge: Vec3 = [0, 0, 0];
      for (let i = 1; i < segmentCount; i += 1) {
        const rel = v3Sub(at(i), root);
        bulge = v3Add(bulge, v3Sub(rel, v3Scale(axis, v3Dot(rel, axis))));
      }
      if (input.poleDirection) {
        const hint = v3Sub(input.poleDirection, v3Scale(axis, v3Dot(input.poleDirection, axis)));
        if (v3Length(hint) > LENGTH_EPSILON) bulge = hint;
      }
      const bulgeDir = v3Length(bulge) > LENGTH_EPSILON ? v3Normalize(bulge) : v3AnyPerpendicular(axis);
      const phi = (i: number, alpha: number): number => alpha * (1 - (2 * i + 1) / segmentCount);
      const reachAt = (alpha: number): number => lengths.reduce((sum, l, i) => sum + l * Math.cos(phi(i, alpha)), 0);
      let lo = 0;
      let hi = Math.PI / 2;
      for (let k = 0; k < 48; k += 1) {
        const mid = (lo + hi) / 2;
        if (reachAt(mid) > rootDistance) lo = mid;
        else hi = mid;
      }
      for (let i = 0; i < segmentCount; i += 1) {
        const a = phi(i, hi);
        const dir = v3Add(v3Scale(axis, Math.cos(a)), v3Scale(bulgeDir, Math.sin(a)));
        points[i + 1] = v3Add(at(i), v3Scale(dir, lengths[i] ?? 0));
      }
    }
    backward();
    error = v3Distance(at(segmentCount), target);
  }
  while (error > tolerance && iterations < maxIterations) {
    iterations += 1;
    // 전방 패스: 말단을 목표에 놓고 루트 쪽으로 길이를 보존하며 당긴다.
    const previous = lengths.map((_, i) => safeDirection(at(i + 1), at(i), [0, -1, 0]));
    points[segmentCount] = target;
    for (let i = segmentCount - 1; i >= 0; i -= 1) {
      const dir = safeDirection(at(i + 1), at(i), previous[i] ?? [0, -1, 0]);
      points[i] = v3Add(at(i + 1), v3Scale(dir, lengths[i] ?? 0));
    }
    backward();
    error = v3Distance(at(segmentCount), target);
  }

  const reached = error <= tolerance;
  const constrained = constraints.some((c) => c !== undefined);
  const reasonKo = reached
    ? undefined
    : constrained
      ? `관절 제약 안에서 ${maxIterations}회 반복해도 목표에 ${(error * 1000).toFixed(1)} mm 못 미칩니다.`
      : `${maxIterations}회 반복 후 오차 ${(error * 1000).toFixed(1)} mm로 수렴하지 못했습니다.`;
  return {
    points,
    iterations,
    error,
    reached,
    status: reached ? "reached" : "unconverged",
    ...(reasonKo === undefined ? {} : { reasonKo }),
  };
}

// ---------------------------------------------------------------- 휴머노이드 체인 → Pose

export interface ChainIkOptions {
  readonly maxIterations?: number;
  readonly tolerance?: number;
  /** 마지막 본 로컬 프레임의 말단 오프셋(손끝 등). 없으면 마지막 본 원점이 말단이고 마지막 본은 회전하지 않는다. */
  readonly tipLocal?: Vec3;
  /** 세그먼트(본)별 원뿔 각(도). 없거나 항목이 undefined면 JOINT_LIMITS_DEG[bone].swing */
  readonly coneDeg?: ReadonlyArray<number | undefined>;
}

export interface ChainIkResult {
  readonly pose: Pose;
  readonly reached: boolean;
  /** 클램프 후 재FK로 측정한 실제 말단 오차(m) */
  readonly error: number;
  readonly iterations: number;
  readonly status: FabrikStatus | "clamped";
  readonly reasonKo?: string;
  readonly chain: readonly HumanoidBoneName[];
}

/** 척추 보조 체인(머리 목표). hips는 루트 본이라 제외한다. */
export const SPINE_IK_CHAIN: readonly HumanoidBoneName[] = ["spine", "chest", "upperChest", "neck", "head"];

export type FingerName = "Thumb" | "Index" | "Middle" | "Ring" | "Little";

/** 손가락 체인(엄지는 중수골부터). 말단은 fingerTipLocal로 준다. */
export function fingerIkChain(side: Side, finger: FingerName): readonly [HumanoidBoneName, HumanoidBoneName, HumanoidBoneName] {
  if (finger === "Thumb") return [`${side}ThumbMetacarpal`, `${side}ThumbProximal`, `${side}ThumbDistal`];
  return [`${side}${finger}Proximal`, `${side}${finger}Intermediate`, `${side}${finger}Distal`];
}

/** 손끝 오프셋(원위 마디 로컬): 마디 축 방향으로 마디 자기 오프셋 길이만큼(없으면 2 cm). */
export function fingerTipLocal(skeleton: SkeletonData, distal: HumanoidBoneName): Vec3 {
  const data = indexBones(skeleton).get(distal);
  const length = data ? v3Length(data.restTranslation) : 0;
  return v3Scale(boneAxisLocal(skeleton, distal), length > LENGTH_EPSILON ? length : 0.02);
}

function requireChain(skeleton: SkeletonData, chain: readonly HumanoidBoneName[], hasTip: boolean): ReadonlyMap<string, SkeletonData["bones"][number]> {
  if (chain.length < (hasTip ? 1 : 2)) throw new Error("IK 체인에는 본이 2개 이상(말단 오프셋이 있으면 1개 이상) 필요합니다.");
  const byName = indexBones(skeleton);
  for (let i = 0; i < chain.length; i += 1) {
    const name = chain[i];
    if (name === undefined) continue;
    const data = byName.get(name);
    if (!data) throw new Error(`IK 체인 본이 스켈레톤에 없습니다: ${name}`);
    const previous = chain[i - 1];
    if (i > 0 && data.parent !== previous) throw new Error(`IK 체인 본이 연속된 부모-자식이 아닙니다: ${String(previous)} → ${name}`);
  }
  return byName;
}

/** 체인 본 목록에 FABRIK 목표를 적용한 상세 결과 */
export function solveChainIk(pose: Pose, skeleton: SkeletonData, chain: readonly HumanoidBoneName[], target: Vec3, options: ChainIkOptions = {}): ChainIkResult {
  const byName = requireChain(skeleton, chain, options.tipLocal !== undefined);
  const transforms = computeWorldTransforms(skeleton, pose);
  const worlds = chain.map((bone) => {
    const t = transforms.get(bone);
    if (!t) throw new Error(`IK 체인 본의 월드 변환을 계산하지 못했습니다: ${bone}`);
    return t;
  });
  const last = worlds[worlds.length - 1];
  if (!last) throw new Error("IK 체인이 비어 있습니다.");
  const points: Vec3[] = worlds.map((w) => w.position);
  if (options.tipLocal) points.push(v3Add(last.position, qRotateVec3(last.rotation, options.tipLocal)));
  const segmentCount = points.length - 1;

  const constraints = chain.slice(0, segmentCount).map((bone, i) => ({ coneDeg: options.coneDeg?.[i] ?? JOINT_LIMITS_DEG[bone].swing }));
  const rootBone = chain[0];
  const rootData = rootBone === undefined ? undefined : byName.get(rootBone);
  let rootDirection: Vec3 | undefined;
  let parentWorld: Quat = [0, 0, 0, 1];
  if (rootData && rootData.parent !== null) {
    const parentT = transforms.get(rootData.parent);
    if (parentT) {
      parentWorld = parentT.rotation;
      const axisWorld = qRotateVec3(parentT.rotation, boneAxisLocal(skeleton, rootData.parent));
      if (v3Length(axisWorld) > LENGTH_EPSILON) rootDirection = v3Normalize(axisWorld);
    }
  }
  const first = points[0] ?? target;
  const second = points[1] ?? target;
  rootDirection ??= safeDirection(first, second, [0, 1, 0]);
  const tolerance = Math.max(0, options.tolerance ?? FABRIK_DEFAULT_TOLERANCE);
  const solved = solveFabrik({
    points,
    target,
    tolerance,
    constraints,
    rootDirection,
    ...(options.maxIterations === undefined ? {} : { maxIterations: options.maxIterations }),
  });

  // 위치 → 회전: 루트부터 순차. 조상의 실제(클램프 반영) 월드 델타를 누적해 각 세그먼트 방향을 맞춘다.
  const next: Pose = { ...pose };
  let parentDelta: Quat = [0, 0, 0, 1];
  for (let i = 0; i < segmentCount; i += 1) {
    const bone = chain[i];
    const world = worlds[i];
    if (bone === undefined || !world) continue;
    const data = byName.get(bone);
    if (!data) continue;
    const oldDir = safeDirection(points[i] ?? first, points[i + 1] ?? first, [0, 1, 0]);
    const newDir = safeDirection(solved.points[i] ?? first, solved.points[i + 1] ?? first, oldDir);
    const provisionalDir = qRotateVec3(parentDelta, oldDir);
    const delta = quatFromTo(provisionalDir, newDir);
    const targetWorld = qNormalize(qMultiply(delta, qMultiply(parentDelta, world.rotation)));
    const requested = poseRotationFromWorld(parentWorld, data.restRotation, targetWorld);
    const clamped = clampBoneRotation(skeleton, bone, requested);
    next[bone] = clamped;
    const actualWorld = qNormalize(qMultiply(parentWorld, composeLocalRotation(data.restRotation, clamped)));
    parentDelta = qNormalize(qMultiply(actualWorld, qConjugate(world.rotation)));
    parentWorld = actualWorld;
  }

  // 클램프가 바꾼 결과를 재측정한다(무음으로 넘기지 않음).
  const after = computeWorldTransforms(skeleton, next);
  const lastBone = chain[chain.length - 1];
  const lastAfter = lastBone === undefined ? undefined : after.get(lastBone);
  const endAfter = lastAfter ? (options.tipLocal ? v3Add(lastAfter.position, qRotateVec3(lastAfter.rotation, options.tipLocal)) : lastAfter.position) : target;
  const error = v3Distance(endAfter, target);
  const reached = error <= tolerance;
  let status: ChainIkResult["status"];
  let reasonKo: string | undefined;
  if (reached) {
    status = "reached";
  } else if (solved.status === "reached") {
    status = "clamped";
    reasonKo = `관절 제한(${chain.join("·")})으로 회전을 클램프해 목표에 ${(error * 1000).toFixed(1)} mm 못 미칩니다.`;
  } else {
    status = solved.status;
    reasonKo = solved.reasonKo;
  }
  return {
    pose: next,
    reached,
    error,
    iterations: solved.iterations,
    status,
    ...(reasonKo === undefined ? {} : { reasonKo }),
    chain,
  };
}

/** 체인 본 목록에 FABRIK 목표를 적용한 새 포즈(도달 불가 시 최대 신장·제한 클램프 반영). */
export function applyChainIk(pose: Pose, skeleton: SkeletonData, chain: readonly HumanoidBoneName[], target: Vec3, options?: ChainIkOptions): Pose {
  return solveChainIk(pose, skeleton, chain, target, options).pose;
}
