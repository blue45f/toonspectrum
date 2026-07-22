import type { BgViewportApi } from "./studio-bg3d-camera-application";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

export interface StudioBg3dPendingCameraTarget {
  current: StudioBg3dCameraSettings | null;
}

/**
 * Applies a history camera synchronously when the mounted projection matches. A perspective ↔
 * orthographic state change replaces the R3F camera, so the old controller must fail closed and
 * hand the complete immutable composition to the replacement controller instead.
 */
export function applyOrDeferStudioBg3dHistoryCamera(
  viewport: BgViewportApi | null,
  pendingTarget: StudioBg3dPendingCameraTarget,
  camera: StudioBg3dCameraSettings,
): "applied" | "deferred" {
  if (viewport?.applyView(camera) === true) {
    pendingTarget.current = null;
    return "applied";
  }
  pendingTarget.current = camera;
  return "deferred";
}
