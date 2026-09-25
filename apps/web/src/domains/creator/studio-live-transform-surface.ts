import { studioKonvaRuntime } from "./render/studio-konva-runtime";
import { STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS } from "./studio-live-transform-exact-draft-admission";

import type Konva from "konva";

export const STUDIO_LIVE_TRANSFORM_SURFACE_ATTRIBUTE = "data-studio-live-transform-surface";
export const STUDIO_LIVE_TRANSFORM_SURFACE_ATTRIBUTE_VALUE = "adaptive-preview";

/** Bound only the ephemeral scene surface; document/export and pointer hit pixels stay untouched. */
export function studioLiveTransformSurfacePixelRatio(
  width: number,
  height: number,
  preferredPixelRatio: number,
): number | null {
  if (
    !Number.isFinite(width) || width <= 0
    || !Number.isFinite(height) || height <= 0
    || !Number.isFinite(preferredPixelRatio) || preferredPixelRatio <= 0
  ) return null;
  const area = Math.ceil(width) * Math.ceil(height);
  if (!Number.isFinite(area)) return null;
  return Math.min(preferredPixelRatio, Math.sqrt(STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS / area));
}

/**
 * Retina/4K viewports used to exceed the full-canvas admission ceiling even for a two-point line.
 * Size the already-dedicated preview canvas to that ceiling, not the document canvas. Geometry,
 * clip coordinates and the hit canvas remain in the original coordinate system. Pointer-up paints
 * the committed vector on the untouched full-resolution document surface.
 */
export function attachStudioLiveTransformSurface(layer: Konva.Layer): () => void {
  const stage = layer.getStage();
  if (!stage) return () => undefined;
  const canvas = layer.getCanvas();
  const nativeCanvas = canvas._canvas;
  nativeCanvas.setAttribute(
    STUDIO_LIVE_TRANSFORM_SURFACE_ATTRIBUTE,
    STUDIO_LIVE_TRANSFORM_SURFACE_ATTRIBUTE_VALUE,
  );
  const syncResolution = () => {
    const ratio = studioLiveTransformSurfacePixelRatio(
      stage.width(), stage.height(), studioKonvaRuntime.pixelRatio,
    );
    if (ratio === null || Math.abs(canvas.getPixelRatio() - ratio) < 1e-9) return;
    // setPixelRatio clears this surface; redraw in the same turn, including any active draft.
    canvas.setPixelRatio(ratio);
    layer.drawScene();
  };
  syncResolution();
  const events = "widthChange.studioLiveTransformSurface heightChange.studioLiveTransformSurface";
  stage.on(events, syncResolution);
  globalThis.addEventListener?.("resize", syncResolution);
  return () => {
    stage.off(events, syncResolution);
    globalThis.removeEventListener?.("resize", syncResolution);
    nativeCanvas.removeAttribute(STUDIO_LIVE_TRANSFORM_SURFACE_ATTRIBUTE);
  };
}
