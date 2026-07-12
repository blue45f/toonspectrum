import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { captureStudioBg3dRaster } from "./studio-bg3d-capture-adapter";
import { captureStudioBg3dThreeDepth } from "./studio-bg3d-lt-three-depth";
import {
  createStudioBg3dThreeWebglCaptureAdapter,
  registerStudioBg3dCaptureExcludedObject,
} from "./studio-bg3d-three-webgl-capture";

vi.mock("./studio-bg3d-lt-three-depth", () => ({
  captureStudioBg3dThreeDepth: vi.fn(),
}));

const captureDepthMock = vi.mocked(captureStudioBg3dThreeDepth);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function fixture(options: { contextAvailable?: boolean } = {}) {
  const rgba = Uint8ClampedArray.from([
    1, 2, 3, 255,
    4, 5, 6, 128,
    7, 8, 9, 64,
    10, 11, 12, 0,
  ]);
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: rgba })),
  };
  const destinationCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => (options.contextAvailable === false ? null : context)),
  };
  const ownerDocument = { createElement: vi.fn(() => destinationCanvas) };
  const sourceCanvas = { width: 320, height: 180, ownerDocument } as unknown as HTMLCanvasElement;
  let clearColor = new THREE.Color("#102030");
  let clearAlpha = 0.35;
  const renderer = {
    isWebGLRenderer: true,
    domElement: sourceCanvas,
    getClearColor: vi.fn((target: THREE.Color) => target.copy(clearColor)),
    getClearAlpha: vi.fn(() => clearAlpha),
    setClearColor: vi.fn((next: THREE.Color | string | number, alpha: number) => {
      clearColor = next instanceof THREE.Color ? next.clone() : new THREE.Color(next);
      clearAlpha = alpha;
    }),
    render: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  return {
    adapter: createStudioBg3dThreeWebglCaptureAdapter({ renderer, scene, camera }),
    camera,
    context,
    destinationCanvas,
    ownerDocument,
    renderer,
    rgba,
    scene,
    sourceCanvas,
    currentClear: () => ({ alpha: clearAlpha, color: clearColor }),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("Three WebGL Studio 3D capture adapter", () => {
  it("reads live source dimensions and preserves the existing scaled canvas RGBA path", async () => {
    const f = fixture();
    expect(f.adapter.getSourceSize()).toEqual({ width: 320, height: 180 });
    f.sourceCanvas.width = 640;
    f.sourceCanvas.height = 360;
    expect(f.adapter.getSourceSize()).toEqual({ width: 640, height: 360 });

    const result = await captureStudioBg3dRaster(f.adapter, {
      width: 2,
      height: 2,
      background: { color: "#abcdef", alpha: 0 },
      includeDepth: false,
    });

    expect(f.renderer.render).toHaveBeenCalledOnce();
    expect(f.renderer.render).toHaveBeenCalledWith(f.scene, f.camera);
    expect(f.destinationCanvas).toMatchObject({ width: 2, height: 2 });
    expect(f.context.clearRect).toHaveBeenCalledWith(0, 0, 2, 2);
    expect(f.context.drawImage).toHaveBeenCalledWith(f.sourceCanvas, 0, 0, 2, 2);
    expect(f.context.getImageData).toHaveBeenCalledWith(0, 0, 2, 2);
    expect(f.context.imageSmoothingEnabled).toBe(true);
    expect(f.context.imageSmoothingQuality).toBe("high");
    expect(result.rgba).toEqual(f.rgba);
    expect(result.rgba).not.toBe(f.rgba);
    expect(result.depth).toBeUndefined();
    expect(captureDepthMock).not.toHaveBeenCalled();
    expect(f.currentClear().color).toEqual(new THREE.Color("#102030"));
    expect(f.currentClear().alpha).toBe(0.35);
  });

  it("restores the visible clear state before deferred depth settles", async () => {
    const f = fixture();
    const readback = deferred<Float32Array>();
    const visibleHelper = new THREE.Group();
    registerStudioBg3dCaptureExcludedObject(visibleHelper);
    const alreadyHiddenHelper = new THREE.Group();
    registerStudioBg3dCaptureExcludedObject(alreadyHiddenHelper);
    alreadyHiddenHelper.visible = false;
    const importedLookingNode = new THREE.Group();
    importedLookingNode.userData.studioCaptureExcluded = true;
    f.scene.add(visibleHelper, alreadyHiddenHelper, importedLookingNode);
    vi.mocked(f.renderer.render).mockImplementationOnce(() => {
      expect(visibleHelper.visible).toBe(false);
      expect(alreadyHiddenHelper.visible).toBe(false);
      expect(importedLookingNode.visible).toBe(true);
    });
    captureDepthMock.mockImplementationOnce(() => {
      expect(visibleHelper.visible).toBe(false);
      expect(alreadyHiddenHelper.visible).toBe(false);
      expect(importedLookingNode.visible).toBe(true);
      return readback.promise;
    });

    const pending = captureStudioBg3dRaster(f.adapter, {
      width: 2,
      height: 2,
      background: { color: "#fedcba", alpha: 0 },
      includeDepth: true,
    });

    expect(captureDepthMock).toHaveBeenCalledWith({
      renderer: f.renderer,
      scene: f.scene,
      camera: f.camera,
      width: 2,
      height: 2,
    });
    expect(f.currentClear().color).toEqual(new THREE.Color("#102030"));
    expect(f.currentClear().alpha).toBe(0.35);
    expect(visibleHelper.visible).toBe(true);
    expect(alreadyHiddenHelper.visible).toBe(false);
    expect(importedLookingNode.visible).toBe(true);

    const depth = Float32Array.from([0, 0.25, 0.75, 1]);
    readback.resolve(depth);
    await expect(pending).resolves.toMatchObject({ depth });
  });

  it("restores clear state when color readback or depth readback fails", async () => {
    const noContext = fixture({ contextAvailable: false });
    await expect(
      captureStudioBg3dRaster(noContext.adapter, {
        width: 2,
        height: 2,
        background: { color: "#ffffff", alpha: 1 },
        includeDepth: false,
      })
    ).rejects.toThrow(/context unavailable/u);
    expect(noContext.currentClear().color).toEqual(new THREE.Color("#102030"));
    expect(noContext.currentClear().alpha).toBe(0.35);

    const depthFailure = fixture();
    const failure = new Error("GPU readback failed");
    captureDepthMock.mockRejectedValueOnce(failure);
    await expect(
      captureStudioBg3dRaster(depthFailure.adapter, {
        width: 2,
        height: 2,
        background: { color: "#ffffff", alpha: 1 },
        includeDepth: true,
      })
    ).rejects.toBe(failure);
    expect(depthFailure.currentClear().color).toEqual(new THREE.Color("#102030"));
    expect(depthFailure.currentClear().alpha).toBe(0.35);
  });

  it("rejects non-Three runtime objects at the factory boundary", () => {
    expect(() =>
      createStudioBg3dThreeWebglCaptureAdapter({
        renderer: {} as THREE.WebGLRenderer,
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(),
      })
    ).toThrow(/requires/u);
  });
});
