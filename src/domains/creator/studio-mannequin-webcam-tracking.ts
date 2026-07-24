/**
 * Studio 3D 데생 인형 전용 실시간 웹캠 동적 동작 추적(Webcam Motion Tracking) 모듈.
 *
 * MediaPipe Vision PoseLandmarker (VIDEO 모드)를 구동하여 웹캠 비디오 프레임에서
 * 신체 33개 관절 랜드마크를 실시간 감지하고, 스무딩 필터(EMA/OneEuro)를 거쳐
 * 3D 데생 인형(StudioMannequinJointId) 관절 회전(Euler radians)으로 전사한다.
 */

import { solvePoseToVrmBones, type PoseLandmark } from "./studio-vrm-pose-solver";

import type { StudioMannequinJointId } from "./studio-mannequin-model";

export type { PoseLandmark };

export interface StudioMannequinTrackingOptions {
  /** 좌우 반전(거울 모드). 기본값 true. */
  readonly mirrorMode?: boolean;
  /** 깊이(Z축) 노이즈 감쇠 (0.1~1.0). 기본값 0.85. */
  readonly zDamp?: number;
  /** 스무딩 계수 (0.05=매우 부드러움, 1.0=즉각 반응). 기본값 0.35. */
  readonly smoothing?: number;
  /** 가시성 미만 절단 기준. 기본값 0.2. */
  readonly minVisibility?: number;
}

export const DEFAULT_MANNEQUIN_TRACKING_OPTIONS: Readonly<StudioMannequinTrackingOptions> = {
  mirrorMode: true,
  zDamp: 0.85,
  smoothing: 0.35,
  minVisibility: 0.2,
};

export type MannequinJointRotations = Record<StudioMannequinJointId, readonly [number, number, number]>;

/**
 * MediaPipe Pose 랜드마크 배열을 3D 데생 인형 관절 회전 맵으로 연산한다.
 */
export function solvePoseToMannequinJoints(
  landmarks: readonly PoseLandmark[],
  options: StudioMannequinTrackingOptions = DEFAULT_MANNEQUIN_TRACKING_OPTIONS,
): Partial<MannequinJointRotations> {
  const bones = solvePoseToVrmBones(landmarks as PoseLandmark[], {
    mirror: options.mirrorMode ?? true,
    zDamp: options.zDamp ?? 0.85,
    minVisibility: options.minVisibility ?? 0.2,
  });

  const result: Partial<MannequinJointRotations> = {};
  for (const [boneName, rotation] of Object.entries(bones)) {
    result[boneName as StudioMannequinJointId] = rotation;
  }

  return result;
}

/**
 * 연속된 관절 회전값에 지수 이동 평균(EMA) 스무딩을 적용한다.
 */
export function smoothMannequinJointRotations(
  previous: Partial<MannequinJointRotations>,
  current: Partial<MannequinJointRotations>,
  smoothing: number = 0.35,
): Partial<MannequinJointRotations> {
  const factor = Math.max(0.05, Math.min(1.0, smoothing));
  const result: Partial<MannequinJointRotations> = { ...previous };

  for (const [jointIdStr, currentRot] of Object.entries(current)) {
    const jointId = jointIdStr as StudioMannequinJointId;
    const prevRot = previous[jointId];
    if (!prevRot || !currentRot) {
      result[jointId] = currentRot;
      continue;
    }

    result[jointId] = [
      prevRot[0] + (currentRot[0] - prevRot[0]) * factor,
      prevRot[1] + (currentRot[1] - prevRot[1]) * factor,
      prevRot[2] + (currentRot[2] - prevRot[2]) * factor,
    ];
  }

  return result;
}
