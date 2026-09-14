import { Vector3 } from "three";

import { captureStudioVrmRgbaCooperatively, encodeStudioVrmCapturePngBlob } from "../vrm/studio-vrm-raster-capture";

import { measureCharacterTurnaroundBounds, planCharacterTurnaround } from "./character-shaper-turnaround-plan";

import type { CharacterTurnaroundCount } from "./character-shaper-turnaround-plan";
import type { StudioBg3dShotContactSheetImage } from "../bg3d/studio-bg3d-shot-contact-sheet-contract";
import type { Camera, Scene, WebGLRenderer } from "three";

export interface CharacterTurnaroundExportInput {
  readonly gl: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly count: CharacterTurnaroundCount;
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
  readonly onProgress?: (text: string) => void;
  readonly onCaptured?: () => void;
}
export interface CharacterTurnaroundDependencies {
  readonly measure: typeof measureCharacterTurnaroundBounds;
  readonly capture: typeof captureStudioVrmRgbaCooperatively;
  readonly encode: typeof encodeStudioVrmCapturePngBlob;
  readonly assemble?: (
    images: readonly StudioBg3dShotContactSheetImage[],
    options?: import("../bg3d/studio-bg3d-shot-contact-sheet-worker-client").StudioBg3dShotContactSheetWorkerOptions,
  ) => Promise<import("../bg3d/studio-bg3d-shot-contact-sheet-contract").StudioBg3dShotContactSheetResult>;
}
const DEPENDENCIES: CharacterTurnaroundDependencies = {
  measure: measureCharacterTurnaroundBounds, capture: captureStudioVrmRgbaCooperatively,
  encode: encodeStudioVrmCapturePngBlob,
};
const CELL = { width: 768, height: 1024 } as const;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/** Sequential snapshots; never edits the model, pose or scene camera. */
export async function exportCharacterTurnaround(
  input: CharacterTurnaroundExportInput, dependencies: CharacterTurnaroundDependencies = DEPENDENCIES,
): Promise<{ readonly blob: Blob; readonly width: number; readonly height: number; readonly count: number }> {
  const check = () => {
    if (input.signal.aborted) throw new DOMException("설정화 내보내기를 취소했습니다.", "AbortError");
    input.assertCurrent();
  };
  check();
  if (input.count !== 4 && input.count !== 8) throw new RangeError("설정화는 4방향 또는 8방향을 선택할 수 있습니다.");
  input.onProgress?.("설정화 · 현재 포즈와 의상 범위 계산 중");
  const bounds = await dependencies.measure(input.scene, input.camera, {
    signal: input.signal, assertCurrent: input.assertCurrent,
  });
  check();
  const direction = input.camera.getWorldDirection(new Vector3()).negate();
  const baseAzimuth = Math.hypot(direction.x, direction.z) < 1e-8 ? 0 : Math.atan2(direction.x, direction.z);
  const views = planCharacterTurnaround(bounds, input.count, CELL.width / CELL.height, baseAzimuth);
  const images: StudioBg3dShotContactSheetImage[] = [];
  let bytes = 0;
  for (const [index, view] of views.entries()) {
    check();
    view.camera.layers.mask = input.camera.layers.mask;
    const rgba = await dependencies.capture(input.gl, input.scene, view.camera, CELL, { alpha: 0 }, {
      signal: input.signal, assertCurrent: input.assertCurrent,
      onProgress: ({ completedTiles, totalTiles }) => input.onProgress?.(
        `설정화 ${index + 1}/${views.length} · ${view.label} · ${Math.round(completedTiles / totalTiles * 100)}%`,
      ),
    });
    check();
    const png = await dependencies.encode(rgba, CELL, { signal: input.signal });
    check();
    bytes += png.size;
    if (bytes > MAX_SOURCE_BYTES) throw new RangeError("설정화 이미지의 메모리 예산을 초과했습니다.");
    images.push({ shotId: view.id, shotName: view.label, ...CELL, png });
  }
  input.onCaptured?.();
  check();
  input.onProgress?.("설정화 · 방향 라벨과 이미지 합성 중");
  const assemble = dependencies.assemble
    ?? (await import("../bg3d/studio-bg3d-shot-contact-sheet-worker-client")).buildStudioBg3dShotContactSheetsInWorker;
  check();
  const result = await assemble(images, {
    signal: input.signal,
    layout: { columns: input.count === 4 ? 2 : 4, rows: 2, cellWidth: CELL.width, cellHeight: CELL.height },
  });
  check();
  const sheet = result.sheets[0];
  if (result.sheets.length !== 1 || !sheet || sheet.shotIds.length !== input.count) {
    throw new Error("설정화 결과에서 일부 방향이 누락되었습니다.");
  }
  return { blob: sheet.png, width: sheet.width, height: sheet.height, count: input.count };
}
