import { Matrix4 } from "three";

import { characterExportSize } from "./character-shaper-export";

import type { CharacterExportEdge } from "./character-shaper-export";
import type { Camera } from "three";

export const CHARACTER_OUTPUT_ASPECTS = [
  { id: "viewport", label: "현재 화면", width: 0, height: 0 },
  { id: "square", label: "정사각 1:1", width: 1, height: 1 },
  { id: "portrait", label: "인물 3:4", width: 3, height: 4 },
  { id: "webtoon", label: "세로 컷 9:16", width: 9, height: 16 },
  { id: "landscape", label: "가로 컷 4:3", width: 4, height: 3 },
  { id: "cinema", label: "와이드 16:9", width: 16, height: 9 },
] as const;
export type CharacterOutputAspect = (typeof CHARACTER_OUTPUT_ASPECTS)[number]["id"];
export type CharacterCompositionGuide = "none" | "thirds" | "center";
export interface CharacterOutputFraming {
  readonly aspect: CharacterOutputAspect;
  readonly guide: CharacterCompositionGuide;
  readonly safeArea: boolean;
}
export const DEFAULT_CHARACTER_OUTPUT_FRAMING: CharacterOutputFraming = {
  aspect: "viewport", guide: "none", safeArea: false,
};
export interface CharacterFrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface CharacterViewportSize {
  readonly width: number;
  readonly height: number;
}

export function characterFrameRect(width: number, height: number, aspect: CharacterOutputAspect): CharacterFrameRect {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("원고 구도를 계산할 화면 크기가 올바르지 않습니다.");
  }
  const format = CHARACTER_OUTPUT_ASPECTS.find((entry) => entry.id === aspect);
  if (!format) throw new RangeError("지원하지 않는 원고 비율입니다.");
  if (format.id === "viewport") return { x: 0, y: 0, width: 1, height: 1 };
  const ratio = format.width / format.height;
  const viewportRatio = width / height;
  const w = Math.min(1, ratio / viewportRatio);
  const h = Math.min(1, viewportRatio / ratio);
  return { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h };
}

export function characterFramedExportSize(
  width: number, height: number, edge: CharacterExportEdge, aspect: CharacterOutputAspect,
): CharacterViewportSize {
  const rect = characterFrameRect(width, height, aspect);
  return characterExportSize(width * rect.width, height * rect.height, edge);
}

/** Detached world-space snapshot, including cameras attached to a transformed parent. */
export function cloneCharacterCaptureCamera(source: Camera): Camera {
  source.updateWorldMatrix(true, false);
  const camera = source.clone();
  camera.clear();
  camera.parent = null;
  camera.matrix.copy(source.matrixWorld);
  camera.matrixWorld.copy(source.matrixWorld);
  camera.matrixWorldInverse.copy(source.matrixWorldInverse);
  camera.matrix.decompose(camera.position, camera.quaternion, camera.scale);
  camera.matrixAutoUpdate = false;
  camera.matrixWorldAutoUpdate = false;
  return camera;
}

/** Crop the existing projection: keep zoom, lens shift, orthographic framing and camera roll. */
export function createCharacterFramedCamera(source: Camera, rect: CharacterFrameRect): {
  readonly camera: Camera;
  readonly screenOutlineScale: number;
} {
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0
    || x + width > 1 + 1e-10 || y + height > 1 + 1e-10) {
    throw new RangeError("출력 프레임이 화면 범위를 벗어났습니다.");
  }
  const camera = cloneCharacterCaptureCamera(source);
  const crop = new Matrix4().set(
    1 / width, 0, 0, (1 - 2 * x - width) / width,
    0, 1 / height, 0, (2 * y + height - 1) / height,
    0, 0, 1, 0,
    0, 0, 0, 1,
  );
  camera.projectionMatrix.premultiply(crop);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return { camera, screenOutlineScale: 1 / height };
}
