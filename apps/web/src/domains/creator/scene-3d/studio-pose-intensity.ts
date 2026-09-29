/**
 * Studio 3D 데생 인형 — Magic Poser 벤치마크: 포즈 강도 슬라이더 (MP2).
 *
 * 프리셋 포즈를 0~100% 강도로 블렌딩합니다(중립 ↔ 풀프리셋).
 * Magic Poser의 "같은 포즈, 다른 강도" UX를 웹툰 콘티용으로 흡수한 것으로,
 * 콘티 단계에서 과장된 포즈를 미세 조정할 때 사용합니다.
 *
 * Three.js/R3F를 import하지 않는 순수 데이터+로직 모듈입니다.
 */

import {
  createStudioMannequinRestPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import type {
  StudioMannequinJointId,
  StudioMannequinVec3,
} from "./studio-mannequin-model";

/** 포즈 강도 범위. 0 = 중립, 100 = 풀프리셋. */
export const STUDIO_POSE_INTENSITY_MIN = 0 as const;
export const STUDIO_POSE_INTENSITY_MAX = 100 as const;

/** 강도 값을 0~100으로 클램프합니다. 비유한 값은 0으로 처리합니다. */
export function clampStudioPoseIntensity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return STUDIO_POSE_INTENSITY_MIN;
  return Math.min(STUDIO_POSE_INTENSITY_MAX, Math.max(STUDIO_POSE_INTENSITY_MIN, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(a: StudioMannequinVec3, b: StudioMannequinVec3, t: number): StudioMannequinVec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * 두 포즈 사이를 t(0~1)로 선형 보간합니다.
 * 관절 오일러와 골반 오프셋을 각각 보간하며, 한쪽에만 있는 관절은
 * 다른 쪽의 중립(항등 회전)으로 간주합니다.
 */
export function blendStudioMannequinPose(
  from: StudioMannequinPose,
  to: StudioMannequinPose,
  t: number,
): StudioMannequinPose {
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const jointIds = new Set<StudioMannequinJointId>([
    ...Object.keys(from.joints),
    ...Object.keys(to.joints),
  ] as StudioMannequinJointId[]);
  const joints: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {};
  const identity: StudioMannequinVec3 = [0, 0, 0];
  for (const jointId of jointIds) {
    const a = from.joints[jointId] ?? identity;
    const b = to.joints[jointId] ?? identity;
    const blended = lerpVec3(a, b, clamped);
    // 항등 회전은 생략해 페이로드를 가볍게 유지합니다.
    if (blended[0] !== 0 || blended[1] !== 0 || blended[2] !== 0) {
      joints[jointId] = blended;
    }
  }
  return {
    joints,
    pelvisOffset: lerpVec3(from.pelvisOffset, to.pelvisOffset, clamped),
  };
}

/**
 * 프리셋 포즈에 강도를 적용합니다.
 * 0%면 중립 포즈, 100%면 프리셋 그대로를 돌립니다.
 */
export function applyStudioPoseIntensity(
  preset: StudioMannequinPose,
  intensity: number,
): StudioMannequinPose {
  const rest = createStudioMannequinRestPose();
  return blendStudioMannequinPose(rest, preset, clampStudioPoseIntensity(intensity) / 100);
}
