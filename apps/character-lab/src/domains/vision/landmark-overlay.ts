/**
 * 원본 사진 위 랜드마크 오버레이 계획(순수). 정규화 좌표(0..1)를 이미지 픽셀 좌표로 바꾸고
 * 연결선(MediaPipe 공개 토폴로지의 인덱스 쌍)을 SVG가 그릴 수 있는 숫자로 돌려준다.
 * 오버레이는 항상 원본 사진 기준이므로 거울 모드와 무관하다.
 */
import { HAND_LANDMARK_COUNT, HAND_LANDMARK_NAMES, LANDMARK_VISIBILITY_MIN, POSE_LANDMARK_COUNT, POSE_LANDMARK_NAMES } from "../../contracts";

import { clampVisibility } from "./landmark-space";

import type { PoseLandmark } from "../../contracts";

export interface OverlayPoint {
  readonly index: number;
  readonly name: string;
  /** 이미지 픽셀 좌표 */
  readonly x: number;
  readonly y: number;
  readonly visibility: number;
  readonly visible: boolean;
}

export interface OverlaySegment {
  readonly from: number;
  readonly to: number;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** 양 끝이 모두 가시성 기준 이상 */
  readonly visible: boolean;
}

export interface OverlayPlan {
  readonly width: number;
  readonly height: number;
  /** `0 0 width height` */
  readonly viewBox: string;
  readonly points: readonly OverlayPoint[];
  readonly segments: readonly OverlaySegment[];
}

export interface OverlayOptions {
  readonly visibilityMin?: number;
}

/** MediaPipe Pose 33점 연결(인덱스 쌍, 공개 토폴로지) */
export const POSE_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

/** MediaPipe Hand 21점 연결(인덱스 쌍, 공개 토폴로지) */
export const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

function buildPlan(
  landmarks: readonly PoseLandmark[],
  names: readonly string[],
  connections: readonly (readonly [number, number])[],
  imageWidth: number,
  imageHeight: number,
  options: OverlayOptions,
  gateVisibility: boolean,
): OverlayPlan {
  const visibilityMin = options.visibilityMin ?? LANDMARK_VISIBILITY_MIN;
  const points: OverlayPoint[] = landmarks.map((landmark, index) => {
    const visibility = clampVisibility(landmark.visibility);
    const finite = Number.isFinite(landmark.x) && Number.isFinite(landmark.y);
    return {
      index,
      name: names[index] ?? `#${index}`,
      x: finite ? landmark.x * imageWidth : Number.NaN,
      y: finite ? landmark.y * imageHeight : Number.NaN,
      visibility,
      visible: finite && (!gateVisibility || visibility >= visibilityMin),
    };
  });
  const segments: OverlaySegment[] = [];
  for (const [from, to] of connections) {
    const a = points[from];
    const b = points[to];
    if (!a || !b) continue;
    segments.push({ from, to, x1: a.x, y1: a.y, x2: b.x, y2: b.y, visible: a.visible && b.visible });
  }
  return { width: imageWidth, height: imageHeight, viewBox: `0 0 ${imageWidth} ${imageHeight}`, points, segments };
}

/** 포즈 33점 오버레이. 개수가 33이 아니면 throw. */
export function poseOverlayPlan(landmarks: readonly PoseLandmark[], imageWidth: number, imageHeight: number, options: OverlayOptions = {}): OverlayPlan {
  if (landmarks.length !== POSE_LANDMARK_COUNT) throw new Error(`포즈 랜드마크는 ${POSE_LANDMARK_COUNT}개여야 합니다(받음 ${landmarks.length}).`);
  return buildPlan(landmarks, POSE_LANDMARK_NAMES, POSE_CONNECTIONS, imageWidth, imageHeight, options, true);
}

/** 손 21점 오버레이(가시성은 보고되지 않는 경우가 많아 게이트하지 않는다). */
export function handOverlayPlan(landmarks: readonly PoseLandmark[], imageWidth: number, imageHeight: number, options: OverlayOptions = {}): OverlayPlan {
  if (landmarks.length !== HAND_LANDMARK_COUNT) throw new Error(`손 랜드마크는 ${HAND_LANDMARK_COUNT}개여야 합니다(받음 ${landmarks.length}).`);
  return buildPlan(landmarks, HAND_LANDMARK_NAMES, HAND_CONNECTIONS, imageWidth, imageHeight, options, false);
}

export interface FitResult {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
}

/** 이미지를 상자 안에 비율 유지(contain)로 맞추는 배율·오프셋 */
export function fitImageInBox(imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number): FitResult {
  if (imageWidth <= 0 || imageHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) return { scale: 1, offsetX: 0, offsetY: 0, width: imageWidth, height: imageHeight };
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { scale, offsetX: (boxWidth - width) / 2, offsetY: (boxHeight - height) / 2, width, height };
}
