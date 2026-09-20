import * as THREE from "three";
import { assertStudioBg3dRasterWindow } from "./studio-bg3d-tile-plan";
import type { StudioBg3dRasterWindow } from "./studio-bg3d-tile-plan";

/** Preserve the actual projection (lens shift, zoom and existing view crop), not a reconstructed lens. */
export function snapshotStudioBg3dCaptureCamera(
  camera: THREE.Camera,
  coordinateSystem = camera.coordinateSystem,
): THREE.Camera {
  if (
    !camera?.isCamera ||
    (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera &&
      !(camera as THREE.OrthographicCamera).isOrthographicCamera)
  )
    throw new TypeError(
      "Tiled capture requires a perspective or orthographic camera.",
    );
  if (
    !camera.projectionMatrix.elements.every(Number.isFinite) ||
    Math.abs(camera.projectionMatrix.determinant()) < 1e-20 ||
    !camera.matrixWorld.elements.every(Number.isFinite)
  )
    throw new RangeError("Invalid capture camera matrices.");
  if (camera.reversedDepth)
    throw new Error("Reversed-depth tiled capture has not been admitted.");
  const snapshot = (camera as THREE.PerspectiveCamera).isPerspectiveCamera
    ? new THREE.PerspectiveCamera().copy(
        camera as THREE.PerspectiveCamera,
        false,
      )
    : new THREE.OrthographicCamera().copy(
        camera as THREE.OrthographicCamera,
        false,
      );
  if (coordinateSystem !== camera.coordinateSystem) {
    // Clip-space conversion changes only Z. Letting Renderer refresh the projection would
    // otherwise discard a custom crop on the first render of a new WebGPU camera.
    const toGpu = coordinateSystem === THREE.WebGPUCoordinateSystem;
    const zConversion = new THREE.Matrix4().set(
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      toGpu ? 0.5 : 2,
      toGpu ? 0.5 : -1,
      0,
      0,
      0,
      1,
    );
    snapshot.projectionMatrix.premultiply(zConversion);
    snapshot.projectionMatrixInverse.copy(snapshot.projectionMatrix).invert();
    snapshot.coordinateSystem = coordinateSystem;
  }
  // clone() has no parent; preserve the parent's already-applied world transform.
  snapshot.matrix.copy(camera.matrixWorld);
  snapshot.matrixWorld.copy(camera.matrixWorld);
  snapshot.matrixWorldInverse.copy(camera.matrixWorldInverse);
  snapshot.matrix.decompose(
    snapshot.position,
    snapshot.quaternion,
    snapshot.scale,
  );
  snapshot.matrixAutoUpdate = false;
  snapshot.matrixWorldAutoUpdate = false;
  return snapshot;
}
export function createStudioBg3dTileCamera(
  frozen: THREE.Camera,
  window: StudioBg3dRasterWindow,
): THREE.Camera {
  assertStudioBg3dRasterWindow(window);
  const camera = snapshotStudioBg3dCaptureCamera(frozen);
  const scaleX = window.fullWidth / window.width,
    scaleY = window.fullHeight / window.height;
  const shiftX =
    (window.fullWidth - 2 * window.x - window.width) / window.width;
  const shiftY =
    (2 * window.y + window.height - window.fullHeight) / window.height;
  const crop = new THREE.Matrix4().set(
    scaleX,
    0,
    0,
    shiftX,
    0,
    scaleY,
    0,
    shiftY,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
  );
  camera.projectionMatrix.premultiply(crop);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return camera;
}
