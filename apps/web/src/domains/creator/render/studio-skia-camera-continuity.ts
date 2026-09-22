import type { SkiaDocumentFrame } from "@toonspectrum/studio-engine-skia";

export type StudioSkiaDocumentCamera = SkiaDocumentFrame["camera"];

export interface StudioSkiaRetainedCameraTranslation {
  readonly x: number;
  readonly y: number;
}

function isFiniteCamera(camera: StudioSkiaDocumentCamera): boolean {
  return camera.scaleX !== 0
    && camera.scaleY !== 0
    && Object.values(camera).every(Number.isFinite);
}

/**
 * Keep the last exact GPU frame visible while an imperative Stage scroll is re-presented.
 *
 * Adaptive clipping moves the Konva container by +scroll and its camera by -scroll in the same
 * task. Applying the camera delta to the retained CanvasKit bitmap cancels that container move,
 * so the old pixels remain document-locked until the next GPU flush. Scale or rotation changes
 * cannot use this translation-only bridge and deliberately fall back to the guarded handoff.
 */
export function planStudioSkiaRetainedCameraTranslation(
  presented: StudioSkiaDocumentCamera | null,
  next: StudioSkiaDocumentCamera | null,
): StudioSkiaRetainedCameraTranslation | null {
  if (!presented || !next || !isFiniteCamera(presented) || !isFiniteCamera(next)) return null;
  if (
    presented.scaleX !== next.scaleX
    || presented.scaleY !== next.scaleY
    || presented.rotation !== next.rotation
  ) return null;

  const x = next.offsetX - presented.offsetX;
  const y = next.offsetY - presented.offsetY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Object.is(x, -0) ? 0 : x,
    y: Object.is(y, -0) ? 0 : y,
  };
}
