/** WebGL2 reference for the optional view-space geometry-normal capture contract. */
import * as THREE from "three";

import { assertStudioBg3dCaptureBudget } from "./studio-bg3d-capture-budget";
import { hideStudioBg3dDepthExcludedObjects } from "./studio-bg3d-capture-exclusion";
import { normalizeStudioBg3dRgbaReadback } from "./studio-bg3d-readback-normalize";

export async function captureStudioBg3dThreeNormals(input: {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly width: number;
  readonly height: number;
}): Promise<Uint8ClampedArray> {
  const { renderer, scene, camera, width, height } = input;
  assertStudioBg3dCaptureBudget({ width, height, includeDepth: true });
  if (!renderer || !scene?.isScene || !camera?.isCamera) {
    throw new TypeError("Normal capture requires a Three renderer, scene, and camera.");
  }
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true, stencilBuffer: false, format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter, generateMipmaps: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  const material = new THREE.MeshNormalMaterial();
  material.toneMapped = false;
  material.blending = THREE.NoBlending;
  const previous = {
    target: renderer.getRenderTarget(), cube: renderer.getActiveCubeFace(),
    mip: renderer.getActiveMipmapLevel(), clear: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear, xr: renderer.xr.enabled,
    viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
    scissorTest: renderer.getScissorTest(), background: scene.background, override: scene.overrideMaterial,
    backgroundRotation: scene.backgroundRotation.clone(),
  };
  const restoreExcluded = hideStudioBg3dDepthExcludedObjects(scene);
  const packed = new Uint8Array(width * height * 4);
  try {
    let readback: Promise<THREE.TypedArray> | undefined;
    let failed = false;
    let failure: unknown;
    try {
      try {
        renderer.xr.enabled = false;
        renderer.autoClear = false;
        renderer.setRenderTarget(target);
        renderer.setScissorTest(false);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, true, true);
        scene.background = null;
        scene.overrideMaterial = material;
        renderer.render(scene, camera);
        readback = renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height, packed);
      } finally {
        try {
          scene.background = previous.background;
          scene.backgroundRotation.copy(previous.backgroundRotation);
          scene.overrideMaterial = previous.override;
          renderer.setRenderTarget(previous.target, previous.cube, previous.mip);
          renderer.setClearColor(previous.clear, previous.alpha);
          renderer.autoClear = previous.autoClear;
          renderer.xr.enabled = previous.xr;
          renderer.setViewport(previous.viewport);
          renderer.setScissor(previous.scissor);
          renderer.setScissorTest(previous.scissorTest);
        } finally {
          restoreExcluded();
        }
      }
    } catch (error) {
      failed = true;
      failure = error;
    }
    const settled = await Promise.allSettled(readback ? [readback] : []);
    if (failed) throw failure;
    if (settled[0]?.status === "rejected") throw settled[0].reason;
    return normalizeStudioBg3dRgbaReadback({ width, height, rgba: packed, flipY: true });
  } finally {
    material.dispose();
    target.dispose();
  }
}
