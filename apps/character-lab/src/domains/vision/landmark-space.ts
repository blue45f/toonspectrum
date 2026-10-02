/**
 * MediaPipe 랜드마크 → 모델 공간 변환(순수).
 *
 * MediaPipe 좌표: x 오른쪽(이미지 기준), y 아래, z는 카메라 쪽이 음수. 정규화 랜드마크는 0..1(이미지 비율 미보정),
 * 월드 랜드마크는 미터(엉덩이 중심 원점). 모델 공간(계약): 우수 좌표계, Y-up, 캐릭터 정면 +Z, 캐릭터 왼쪽 +X.
 * 카메라를 보는 사람의 왼손은 이미지 오른쪽(+x)에 있으므로 x 부호는 유지하고 y·z만 뒤집는다.
 *
 * 거울 모드(mirror): 사진 속 사람의 왼팔을 캐릭터의 오른팔로 옮긴다 = 좌우 랜드마크 교환 + x 반전.
 */
import { POSE_LANDMARK_COUNT, POSE_LANDMARK_NAMES } from "../../contracts";
import { v3Normalize, v3Sub } from "../../shared/math";

import type { PoseLandmark, PoseLandmarkName } from "../../contracts";
import type { Vec3 } from "../../shared/math";

export type LandmarkSpace = "world" | "image";

export interface LandmarkSpaceOptions {
  /** 기본 "image"(정규화 좌표). PoseLandmarker worldLandmarks를 주면 "world". */
  readonly space?: LandmarkSpace;
  /** image 공간일 때 가로/세로 비(기본 1). 월드 공간에서는 무시한다. */
  readonly aspectRatio?: number;
  readonly mirror?: boolean;
}

/** 랜드마크 하나를 모델 공간 위치로 바꾼다(거울 모드면 x 반전). */
export function toModelSpace(landmark: Pick<PoseLandmark, "x" | "y" | "z">, options: LandmarkSpaceOptions = {}): Vec3 {
  const space = options.space ?? "image";
  const aspect = space === "image" ? (options.aspectRatio ?? 1) : 1;
  const sign = options.mirror ? -1 : 1;
  if (space === "image") {
    return [sign * (landmark.x - 0.5) * aspect, -(landmark.y - 0.5), -landmark.z * aspect];
  }
  return [sign * landmark.x, -landmark.y, -landmark.z];
}

/** 좌우 교환 인덱스(left_* ↔ right_*). 중앙 랜드마크는 자기 자신. */
export const POSE_MIRROR_INDEX: readonly number[] = POSE_LANDMARK_NAMES.map((name, index) => {
  const swapped = name.startsWith("left_") ? name.replace("left_", "right_") : name.startsWith("right_") ? name.replace("right_", "left_") : name === "mouth_left" ? "mouth_right" : name === "mouth_right" ? "mouth_left" : name;
  const target = POSE_LANDMARK_NAMES.indexOf(swapped as PoseLandmarkName);
  return target >= 0 ? target : index;
});

export interface PreparedLandmarks {
  /** 모델 공간 위치(33개) */
  readonly points: readonly Vec3[];
  /** 가시성 0..1(33개) */
  readonly visibility: readonly number[];
  readonly mirrored: boolean;
}

/** 33개 랜드마크를 모델 공간으로 바꾼다. 거울 모드면 좌우를 교환한다. 개수가 33이 아니면 throw. */
export function preparePoseLandmarks(landmarks: readonly PoseLandmark[], options: LandmarkSpaceOptions = {}): PreparedLandmarks {
  if (landmarks.length !== POSE_LANDMARK_COUNT) {
    throw new Error(`포즈 랜드마크는 ${POSE_LANDMARK_COUNT}개여야 합니다(받음 ${landmarks.length}).`);
  }
  const mirrored = options.mirror === true;
  const points: Vec3[] = [];
  const visibility: number[] = [];
  for (let index = 0; index < POSE_LANDMARK_COUNT; index += 1) {
    const sourceIndex = mirrored ? (POSE_MIRROR_INDEX[index] ?? index) : index;
    const landmark = landmarks[sourceIndex];
    if (!landmark) throw new Error(`랜드마크 ${sourceIndex}가 비어 있습니다.`);
    points.push(toModelSpace(landmark, options));
    visibility.push(clampVisibility(landmark.visibility));
  }
  return { points, visibility, mirrored };
}

/** visibility가 없거나 NaN이면 0(보이지 않음)으로 본다 — 보수적. */
export function clampVisibility(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function landmarkIndexOf(name: PoseLandmarkName): number {
  return POSE_LANDMARK_NAMES.indexOf(name);
}

/** from→to 단위 방향. 두 점이 겹치면 null. */
export function segmentDirection(from: Vec3, to: Vec3): Vec3 | null {
  const direction = v3Normalize(v3Sub(to, from));
  return direction[0] === 0 && direction[1] === 0 && direction[2] === 0 ? null : direction;
}

export function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
}

/** 두 벡터 사이 각(도, 0..180). 어느 한쪽이 영벡터면 0. */
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const na = v3Normalize(a);
  const nb = v3Normalize(b);
  const dotValue = na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2];
  if (!Number.isFinite(dotValue)) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, dotValue))) * 180) / Math.PI;
}
