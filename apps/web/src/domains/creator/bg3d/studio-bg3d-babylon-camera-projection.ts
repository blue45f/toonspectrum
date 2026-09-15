/** Babylon-owned, immutable projection for one renderer-neutral artifact capture. */
import { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

import {
  resolveStudioBg3dCameraDistanceLimits,
  resolveStudioBg3dCameraNearClip,
  resolveStudioBg3dCameraUpVector,
} from "./studio-bg3d-camera-orientation";

import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { Scene } from "@babylonjs/core/scene";

export function createStudioBg3dBabylonCaptureCamera(
  settings: StudioBg3dSceneDocument["camera"],
  width: number,
  height: number,
  scene: Scene,
): FreeCamera {
  // Orthographic snapshots do not yet carry the editor's viewport-dependent frustum.
  if (settings.projection === "orthographic" || !scene.useRightHandedSystem
    || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1) {
    throw new RangeError("Unsupported Studio Babylon capture projection");
  }
  const camera = new FreeCamera("studio-capture-camera", new Vector3(...settings.position), scene);
  camera.minZ = resolveStudioBg3dCameraNearClip(settings.nearClip);
  camera.maxZ = resolveStudioBg3dCameraDistanceLimits(settings.position, settings.target).farClip;
  camera.fov = 2 * Math.atan(Math.tan(settings.fovDegrees * Math.PI / 360) / (settings.zoom ?? 1));
  camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
  camera.upVector.copyFromFloats(...resolveStudioBg3dCameraUpVector(settings));
  camera.setTarget(new Vector3(...settings.target));

  const engine = scene.getEngine();
  const reverseDepth = engine.useReverseDepthBuffer;
  const projection = Matrix.Identity();
  Matrix.PerspectiveFovRHToRef(camera.fov, width / height,
    reverseDepth ? camera.maxZ : camera.minZ, reverseDepth ? camera.minZ : camera.maxZ,
    projection, true, engine.isNDCHalfZRange, 0, reverseDepth);
  // Three's full-size setViewOffset moves the frustum, not the viewport or camera target.
  // Positive X moves content left; positive Y moves it up in canonical top-down output.
  const [shiftX, shiftY] = settings.lensShift ?? [0, 0];
  projection.setRowFromFloats(2, 2 * shiftX, shiftY === 0 ? 0 : -2 * shiftY, projection.m[10]!, projection.m[11]!);
  // All beauty/depth/G-buffer/ID passes must use this exact requested aspect and off-axis frustum,
  // including temporary render targets whose dimensions differ from the presentation canvas.
  camera.freezeProjectionMatrix(projection);
  scene.activeCamera = camera;
  return camera;
}
