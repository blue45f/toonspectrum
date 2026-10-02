/**
 * 포즈 스코프 병합·정규화.
 *
 * - `mergePose(base, overlay, scope)`: 스코프(bonesInScope) 안의 본만 overlay로 덮고 밖의 본은 base를 보존한다.
 *   `replaceScope`가 true면 스코프 안에서 overlay에 없는 본은 rest(제거)로 되돌린다(프리셋을 부분 적용할 때).
 * - `normalizePose`: 단위 쿼터니언으로 정규화(이미 단위면 비트 보존), w ≥ 0 통일, 유한하지 않거나 항등인 본은 제거(없는 본 = rest).
 * - `posesEqual`·`poseHash`: 프리셋 상이성 검사와 썸네일 캐시 키에 쓴다.
 */
import { HUMANOID_BONE_NAMES, bonesInScope, isHumanoidBoneName } from "../contracts/bones";
import { fnv1a64Hex } from "../shared/hash";
import { qAngle, qSlerp } from "../shared/math";

import { unitQuat } from "./joint-limits";

import type { HumanoidBoneName, PoseScope } from "../contracts/bones";
import type { Pose, Quat } from "../contracts/pose";

export interface MergePoseOptions {
  /** true면 스코프 안에서 overlay에 없는 본을 rest로 되돌린다. 기본 false(overlay에 있는 본만 덮음). */
  readonly replaceScope?: boolean;
}

const IDENTITY_EPSILON = 1e-9;

function isIdentity(q: Quat): boolean {
  return Math.abs(q[0]) < IDENTITY_EPSILON && Math.abs(q[1]) < IDENTITY_EPSILON && Math.abs(q[2]) < IDENTITY_EPSILON && Math.abs(1 - Math.abs(q[3])) < IDENTITY_EPSILON;
}

function canonical(q: Quat): Quat {
  const n = unitQuat(q);
  return n[3] < 0 ? [-n[0], -n[1], -n[2], -n[3]] : n;
}

/** 포즈를 정규화한다. 결과 키 순서는 HUMANOID_BONE_NAMES 순서(결정적). */
export function normalizePose(pose: Pose): Pose {
  const result: Pose = {};
  for (const bone of HUMANOID_BONE_NAMES) {
    const q = pose[bone];
    if (!q || q.length !== 4 || !q.every(Number.isFinite)) continue;
    const n = canonical(q);
    if (isIdentity(n)) continue;
    result[bone] = n;
  }
  return result;
}

export function mergePose(base: Pose, overlay: Pose, scope: PoseScope, options: MergePoseOptions = {}): Pose {
  const inScope = new Set<HumanoidBoneName>(bonesInScope(scope));
  const result: Pose = {};
  for (const bone of HUMANOID_BONE_NAMES) {
    if (inScope.has(bone)) {
      const over = overlay[bone];
      if (over) {
        result[bone] = over;
        continue;
      }
      if (options.replaceScope) continue;
    }
    const kept = base[bone];
    if (kept) result[bone] = kept;
  }
  return normalizePose(result);
}

/** 두 포즈가 각도 허용 오차 안에서 같은지(없는 본 = 항등) */
export function posesEqual(a: Pose, b: Pose, toleranceRad = 1e-6): boolean {
  const na = normalizePose(a);
  const nb = normalizePose(b);
  for (const bone of HUMANOID_BONE_NAMES) {
    const qa = na[bone] ?? [0, 0, 0, 1];
    const qb = nb[bone] ?? [0, 0, 0, 1];
    if (qAngle(qa, qb) > toleranceRad) return false;
  }
  return true;
}

/** 정규화·양자화(1e-6)한 포즈의 결정적 해시(fnv1a64 hex) */
export function poseHash(pose: Pose): string {
  const n = normalizePose(pose);
  const parts: string[] = [];
  for (const bone of HUMANOID_BONE_NAMES) {
    const q = n[bone];
    if (!q) continue;
    parts.push(`${bone}:${q.map((v) => Math.round(v * 1e6) / 1e6).join(",")}`);
  }
  return fnv1a64Hex(parts.join(";"));
}

/** 두 포즈를 본별 slerp로 보간한다(없는 본 = 항등). */
export function lerpPose(from: Pose, to: Pose, t: number): Pose {
  const k = Math.min(1, Math.max(0, t));
  const result: Pose = {};
  for (const bone of HUMANOID_BONE_NAMES) {
    const qa = from[bone];
    const qb = to[bone];
    if (!qa && !qb) continue;
    result[bone] = qSlerp(qa ?? [0, 0, 0, 1], qb ?? [0, 0, 0, 1], k);
  }
  return normalizePose(result);
}

/** 포즈에서 휴머노이드 어휘 밖 키를 제거한다(외부 입력 방어). */
export function sanitizePoseKeys(pose: Record<string, Quat | undefined>): Pose {
  const result: Pose = {};
  for (const [key, q] of Object.entries(pose)) {
    if (!q || !isHumanoidBoneName(key)) continue;
    result[key] = q;
  }
  return result;
}
