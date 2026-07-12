/** Three/WebGL implementation of the renderer-neutral Studio 3D capture contract. */

import * as THREE from "three";

import { captureStudioBg3dThreeDepth } from "./studio-bg3d-lt-three-depth";
import { normalizeStudioBg3dRgbaReadback } from "./studio-bg3d-readback-normalize";

import type {
  StudioBg3dCaptureAdapter,
  StudioBg3dCapturedRaster,
  StudioBg3dCaptureRequest,
} from "./studio-bg3d-capture-adapter";

export interface CreateStudioBg3dThreeWebglCaptureAdapterInput {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
}

// Identity-only registry: GLTF extras are copied into Object3D.userData, so a public string flag
// would let uploaded assets accidentally or deliberately remove themselves from Studio exports.
const captureExcludedObjects = new WeakSet<THREE.Object3D>();

/** Registers a renderer-owned viewport helper that never belongs in a color/depth export. */
export function registerStudioBg3dCaptureExcludedObject(object: THREE.Object3D | null): void {
  if (object) captureExcludedObjects.add(object);
}

function hideCaptureExcludedObjects(scene: THREE.Scene): () => void {
  const previousVisibility: Array<{ object: THREE.Object3D; visible: boolean }> = [];
  scene.traverse((object) => {
    if (!captureExcludedObjects.has(object)) return;
    previousVisibility.push({ object, visible: object.visible });
    object.visible = false;
  });
  return () => {
    for (const { object, visible } of previousVisibility) object.visible = visible;
  };
}

function readCanvasRgba(
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number
): Uint8ClampedArray {
  const canvas = sourceCanvas.ownerDocument.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D capture context unavailable.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, width, height);
  context.drawImage(sourceCanvas, 0, 0, width, height);
  return normalizeStudioBg3dRgbaReadback({
    width,
    height,
    rgba: context.getImageData(0, 0, width, height).data,
  });
}

export function createStudioBg3dThreeWebglCaptureAdapter(
  input: CreateStudioBg3dThreeWebglCaptureAdapterInput
): StudioBg3dCaptureAdapter {
  const { renderer, scene, camera } = input;
  const isWebglRenderer =
    (renderer as THREE.WebGLRenderer & { readonly isWebGLRenderer?: boolean } | null)
      ?.isWebGLRenderer === true;
  if (!isWebglRenderer || !scene?.isScene || !camera?.isCamera) {
    throw new TypeError("Three WebGL capture requires a renderer, scene, and camera.");
  }

  async function capture(request: StudioBg3dCaptureRequest): Promise<StudioBg3dCapturedRaster> {
    const previousClearColor = renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = renderer.getClearAlpha();
    const restoreCaptureExcludedObjects = hideCaptureExcludedObjects(scene);
    let rgba: Uint8ClampedArray;
    let depthReadback: Promise<Float32Array> | undefined;
    try {
      renderer.setClearColor(request.background.color, request.background.alpha);
      renderer.render(scene, camera);
      rgba = readCanvasRgba(renderer.domElement, request.width, request.height);
      if (request.includeDepth) {
        depthReadback = captureStudioBg3dThreeDepth({
          renderer,
          scene,
          camera,
          width: request.width,
          height: request.height,
        });
      }
    } finally {
      // The depth readback may wait on a GPU fence. Restore the visible R3F clear state before
      // awaiting it so live frames cannot briefly render with export-only state. Engine-level
      // helper exclusion also closes the gap before React commits isCapturing=true.
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      restoreCaptureExcludedObjects();
    }
    const depth = depthReadback ? await depthReadback : undefined;
    return {
      width: request.width,
      height: request.height,
      rgba,
      ...(depth ? { depth } : {}),
    };
  }

  return Object.freeze({
    backend: "three-webgl" as const,
    getSourceSize: () => ({
      width: renderer.domElement.width,
      height: renderer.domElement.height,
    }),
    capture,
  });
}
