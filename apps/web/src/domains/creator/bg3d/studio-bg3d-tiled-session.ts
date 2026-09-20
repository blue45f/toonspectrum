import {
  assertStudioBg3dRasterWindow,
  STUDIO_BG3D_TILE_PROFILE,
} from "./studio-bg3d-tile-plan";
import {
  createStudioBg3dTileCamera,
  snapshotStudioBg3dCaptureCamera,
} from "./studio-bg3d-tile-camera";
import type * as THREE from "three";
import type {
  StudioBg3dCaptureRequest,
  StudioBg3dCapturedRaster,
} from "./studio-bg3d-capture-adapter";
import type { StudioBg3dRasterWindow } from "./studio-bg3d-tile-plan";

export interface StudioBg3dTiledCaptureSession {
  readonly profile: typeof STUDIO_BG3D_TILE_PROFILE;
  capture(
    request: StudioBg3dCaptureRequest,
    window: StudioBg3dRasterWindow,
  ): Promise<StudioBg3dCapturedRaster>;
  dispose(): void;
}
export function createStudioBg3dTiledCameraSession(
  camera: THREE.Camera,
  execute: (
    request: StudioBg3dCaptureRequest,
    camera: THREE.Camera,
  ) => Promise<StudioBg3dCapturedRaster>,
  coordinateSystem?: THREE.Camera["coordinateSystem"],
): StudioBg3dTiledCaptureSession {
  const frozen = snapshotStudioBg3dCaptureCamera(camera, coordinateSystem);
  let closed = false;
  let busy = false;
  return Object.freeze({
    profile: STUDIO_BG3D_TILE_PROFILE,
    async capture(
      request: StudioBg3dCaptureRequest,
      window: StudioBg3dRasterWindow,
    ) {
      if (closed || busy)
        throw new Error(
          "Tiled capture session is closed or already capturing.",
        );
      assertStudioBg3dRasterWindow(window);
      if (request.width !== window.width || request.height !== window.height)
        throw new RangeError("Tile raster does not match the declared window.");
      busy = true;
      try {
        const result = await execute(
          request,
          createStudioBg3dTileCamera(frozen, window),
        );
        if (closed)
          throw new Error(
            "Tiled capture session closed before readback completed.",
          );
        return result;
      } finally {
        busy = false;
      }
    },
    dispose() {
      closed = true;
    },
  });
}
