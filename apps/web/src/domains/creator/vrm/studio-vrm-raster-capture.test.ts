import * as THREE from "three";
import { MToonMaterial } from "@pixiv/three-vrm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dShotPngWorkerError } from "../bg3d/studio-bg3d-shot-png-worker-client";

import {
  captureStudioVrmRgba,
  encodeStudioVrmCapturePngBlob,
  encodeStudioVrmCapturePngDataUrl,
  encodeStudioVrmCapturePngOnMainThread,
  flipStudioVrmCaptureRows,
  readStudioVrmPngBlobAsDataUrl,
  type StudioVrmRasterCaptureDependencies,
} from "./studio-vrm-raster-capture";

import type { StudioBg3dLtRasterLayer } from "../bg3d/studio-bg3d-lt-render";

function png(width: number, height: number): Blob {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return new Blob([bytes], { type: "image/png" });
}

function dependencies(
  overrides: Partial<StudioVrmRasterCaptureDependencies> = {},
): StudioVrmRasterCaptureDependencies {
  return {
    encodePngInWorker: vi.fn(async (layers) => png(layers[0]?.width ?? 1, layers[0]?.height ?? 1)),
    encodePngOnMainThread: vi.fn(async (_rgba, dimensions) => png(dimensions.width, dimensions.height)),
    blobToDataUrl: vi.fn(async () => "data:image/png;base64,verified"),
    ...overrides,
  };
}

class FakeRenderer {
  readonly capabilities = { maxSamples: 8 };
  readonly outputColorSpace = THREE.SRGBColorSpace;
  readonly toneMapping = THREE.ACESFilmicToneMapping;
  readonly toneMappingExposure = 1;
  readonly calls: string[] = [];
  clearColor = new THREE.Color("#234567");
  clearAlpha = 0.75;
  failRead = false;
  captureTargets: THREE.WebGLRenderTarget[] = [];
  readTarget: THREE.WebGLRenderTarget | null = null;
  previousActiveCubeFace = 3;
  previousActiveMipmapLevel = 2;

  getRenderTarget(): THREE.WebGLRenderTarget | null {
    this.calls.push("get-target");
    return null;
  }

  getActiveCubeFace(): number {
    this.calls.push("get-active-cube-face");
    return this.previousActiveCubeFace;
  }

  getActiveMipmapLevel(): number {
    this.calls.push("get-active-mipmap-level");
    return this.previousActiveMipmapLevel;
  }

  getClearColor(target: THREE.Color): THREE.Color {
    this.calls.push("get-clear-color");
    return target.copy(this.clearColor);
  }

  getClearAlpha(): number {
    this.calls.push("get-clear-alpha");
    return this.clearAlpha;
  }

  setRenderTarget(
    target: THREE.WebGLRenderTarget | null,
    activeCubeFace = 0,
    activeMipmapLevel = 0,
  ): void {
    if (target) {
      this.captureTargets.push(target);
      this.calls.push(`set-capture-target:${this.captureTargets.length}`);
    } else {
      this.calls.push(`restore-target:${activeCubeFace}:${activeMipmapLevel}`);
    }
  }

  setClearColor(value: THREE.ColorRepresentation, alpha = 1): void {
    if (value instanceof THREE.Color) {
      this.calls.push("restore-clear-color");
      this.clearColor.copy(value);
    } else {
      this.calls.push("set-transparent-clear");
      this.clearColor.set(value);
    }
    this.clearAlpha = alpha;
  }

  clear(): void {
    this.calls.push("clear");
  }

  render(_scene?: THREE.Object3D, _camera?: THREE.Camera): void {
    this.calls.push("render");
  }

  readRenderTargetPixels(
    target: THREE.WebGLRenderTarget,
    _x: number,
    _y: number,
    width: number,
    height: number,
    output: Uint8Array,
  ): void {
    this.calls.push("read");
    this.readTarget = target;
    if (this.failRead) throw new Error("readback failed");
    expect({ width, height }).toEqual({ width: 1, height: 2 });
    output.set([
      1, 2, 3, 4,
      5, 6, 7, 8,
    ]);
  }
}

/** Simulate bottom-up readback from each real cropped camera projection, without a GPU. */
class TiledFakeRenderer extends FakeRenderer {
  readonly windows: { left: number; top: number; width: number; height: number }[] = [];
  readonly fullProjectionInverse: THREE.Matrix4;
  failOnTile = Number.POSITIVE_INFINITY;

  constructor(
    readonly captureScene: THREE.Scene,
    camera: THREE.Camera,
    readonly imageWidth: number,
    readonly imageHeight: number,
  ) {
    super();
    this.fullProjectionInverse = camera.projectionMatrix.clone().invert();
  }

  override render(scene?: THREE.Object3D, camera?: THREE.Camera): void {
    super.render();
    if (scene !== this.captureScene || !camera) return;
    const crop = camera.projectionMatrix.clone().multiply(this.fullProjectionInverse);
    const width = Math.round(this.imageWidth / crop.elements[0]);
    const height = Math.round(this.imageHeight / crop.elements[5]);
    this.windows.push({
      left: Math.round((this.imageWidth - crop.elements[12] * width - width) / 2),
      top: Math.round((crop.elements[13] * height - height + this.imageHeight) / 2),
      width,
      height,
    });
  }

  override readRenderTargetPixels(
    _target: THREE.WebGLRenderTarget,
    _x: number,
    _y: number,
    width: number,
    height: number,
    output: Uint8Array,
  ): void {
    if (this.windows.length === this.failOnTile) throw new Error("tile readback failed");
    const window = this.windows[this.windows.length - 1]!;
    expect({ width, height }).toEqual({ width: window.width, height: window.height });
    expect(width).toBeLessThanOrEqual(1024);
    expect(height).toBeLessThanOrEqual(1024);
    for (let row = 0; row < height; row += 1) {
      const y = window.top + height - row - 1;
      for (let column = 0; column < width; column += 1) {
        const x = window.left + column;
        const offset = (row * width + column) * 4;
        output[offset] = x % 251;
        output[offset + 1] = y % 251;
        output[offset + 2] = (Math.floor(x / 251) + Math.floor(y / 251)) % 256;
        output[offset + 3] = 255;
      }
    }
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Studio VRM raster capture", () => {
  it("flips bottom-up WebGL rows into a fresh top-down RGBA snapshot", () => {
    const source = new Uint8Array([
      1, 2, 3, 4,
      5, 6, 7, 8,
    ]);

    const output = flipStudioVrmCaptureRows(source, { width: 1, height: 2 });

    expect([...output]).toEqual([
      5, 6, 7, 8,
      1, 2, 3, 4,
    ]);
    expect(output.buffer).not.toBe(source.buffer);
    expect(() => flipStudioVrmCaptureRows(source, { width: 2, height: 2 })).toThrow(TypeError);
  });

  it("renders the scene into an MSAA linear target, tone-maps through the straight-alpha output pass, and restores renderer state", () => {
    const renderer = new FakeRenderer();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#ff00ff");

    const output = captureStudioVrmRgba(
      renderer as unknown as THREE.WebGLRenderer,
      scene,
      new THREE.PerspectiveCamera(),
      { width: 1, height: 2 },
    );

    expect([...output]).toEqual([5, 6, 7, 8, 1, 2, 3, 4]);
    expect(renderer.calls).toEqual([
      "get-target",
      "get-active-cube-face",
      "get-active-mipmap-level",
      "get-clear-color",
      "get-clear-alpha",
      "set-capture-target:1",
      "set-transparent-clear",
      "clear",
      "render",
      "set-capture-target:2",
      "render",
      "read",
      "restore-target:3:2",
      "restore-clear-color",
    ]);
    // Transparent cutouts suppress scene.background for the color pass, then restore it.
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect((scene.background as THREE.Color).getHexString()).toBe("ff00ff");
    const [sceneTarget, outputTarget] = renderer.captureTargets;
    // Scene pass: antialiased linear working buffer; no output color space of its own.
    expect(sceneTarget?.samples).toBe(4);
    expect(sceneTarget?.texture.colorSpace).toBe(THREE.NoColorSpace);
    // Output pass target: display-ready bytes, read back synchronously.
    expect(outputTarget?.samples).toBe(0);
    expect(outputTarget?.texture.colorSpace).toBe(THREE.NoColorSpace);
    expect(renderer.readTarget).toBe(outputTarget);
    expect(renderer.clearColor.getHexString()).toBe("234567");
    expect(renderer.clearAlpha).toBe(0.75);
  });

  it("honors an opaque capture clear without suppressing scene.background", () => {
    const renderer = new FakeRenderer();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#112233");

    captureStudioVrmRgba(
      renderer as unknown as THREE.WebGLRenderer,
      scene,
      new THREE.PerspectiveCamera(),
      { width: 1, height: 2 },
      { color: "#abcdef", alpha: 1 },
    );

    expect(renderer.clearAlpha).toBe(0.75);
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect((scene.background as THREE.Color).getHexString()).toBe("112233");
    expect(renderer.calls).toContain("set-transparent-clear");
  });

  it("restores renderer state even when GPU readback fails", () => {
    const renderer = new FakeRenderer();
    renderer.failRead = true;

    expect(() => captureStudioVrmRgba(
      renderer as unknown as THREE.WebGLRenderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      { width: 1, height: 2 },
    )).toThrow("readback failed");
    expect(renderer.calls.slice(-2)).toEqual(["restore-target:3:2", "restore-clear-color"]);
    expect(renderer.clearColor.getHexString()).toBe("234567");
    expect(renderer.clearAlpha).toBe(0.75);
  });

  it.each(["perspective", "orthographic"])("stitches exact 4K %s pixels across tile boundaries and preserves the camera", (projection) => {
    const width = 4096;
    const height = projection === "perspective" ? 4096 : 2050;
    const camera = projection === "perspective"
      ? new THREE.PerspectiveCamera(37, 1.37, 0.02, 800)
      : new THREE.OrthographicCamera(-4, 4, 3, -3, 0.02, 800);
    camera.zoom = 1.6;
    camera.setViewOffset(1370, 1000, 60, -45, 1370, 1000);
    const projectionBefore = camera.projectionMatrix.clone();
    const inverseBefore = camera.projectionMatrixInverse.clone();
    const viewBefore = { ...camera.view };
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#fedcba");
    const renderer = new TiledFakeRenderer(scene, camera, width, height);

    const output = captureStudioVrmRgba(renderer as unknown as THREE.WebGLRenderer, scene, camera, { width, height });
    expect(output.byteLength).toBe(width * height * 4);
    expect(renderer.windows).toHaveLength(Math.ceil(width / 1024) * Math.ceil(height / 1024));
    expect(renderer.windows.reduce((sum, tile) => sum + tile.width * tile.height, 0)).toBe(width * height);
    // Both sides of tile seams, far corners, and a partial final row retain true full-frame pixels.
    for (const y of [0, 1023, 1024, 2047, 2048, height - 1]) {
      for (const x of [0, 1023, 1024, 2047, 2048, 3071, 3072, width - 1]) {
        const offset = (y * width + x) * 4;
        expect([...output.subarray(offset, offset + 4)]).toEqual([
          x % 251, y % 251, (Math.floor(x / 251) + Math.floor(y / 251)) % 256, 255,
        ]);
      }
    }
    expect(camera.projectionMatrix.equals(projectionBefore)).toBe(true);
    expect(camera.projectionMatrixInverse.equals(inverseBefore)).toBe(true);
    expect(camera.view).toEqual(viewBefore);
    expect(camera.zoom).toBe(1.6);
    expect(renderer.captureTargets[0]?.samples).toBe(4);
    expect(renderer.clearColor.getHexString()).toBe("234567");
    expect((scene.background as THREE.Color).getHexString()).toBe("fedcba");
  });

  it("restores the original projection and renderer when a later 4K tile fails", () => {
    const camera = new THREE.PerspectiveCamera(50, 1.5);
    camera.setViewOffset(1500, 1000, 70, 40, 1500, 1000);
    const before = camera.projectionMatrix.clone();
    const beforeInverse = camera.projectionMatrixInverse.clone();
    const scene = new THREE.Scene();
    const renderer = new TiledFakeRenderer(scene, camera, 4096, 4096);
    renderer.failOnTile = 2;
    expect(() => captureStudioVrmRgba(renderer as unknown as THREE.WebGLRenderer, scene, camera, { width: 4096, height: 4096 }))
      .toThrow("tile readback failed");
    expect(renderer.windows).toHaveLength(2);
    expect(camera.projectionMatrix.equals(before)).toBe(true);
    expect(camera.projectionMatrixInverse.equals(beforeInverse)).toBe(true);
    expect(renderer.calls.slice(-2)).toEqual(["restore-target:3:2", "restore-clear-color"]);
    expect(renderer.clearColor.getHexString()).toBe("234567");
    expect(renderer.clearAlpha).toBe(0.75);
  });

  it.each([false, true])("preserves actual MToon screen-outline width across full/partial tiles and restores it (failure: %s)", (fail) => {
    const camera = new THREE.PerspectiveCamera(43, 1.5);
    camera.zoom = 1.4;
    camera.updateProjectionMatrix();
    const scene = new THREE.Scene();
    const screenOutline = new MToonMaterial({ outlineWidthMode: "screenCoordinates", outlineWidthFactor: 0.002, isOutline: true });
    const worldOutline = new MToonMaterial({ outlineWidthMode: "worldCoordinates", outlineWidthFactor: 0.003, isOutline: true });
    // Shared material ownership must not compound the per-tile multiplier.
    const geometry = new THREE.BoxGeometry();
    scene.add(new THREE.Mesh(geometry, [screenOutline, worldOutline]), new THREE.Mesh(geometry, screenOutline));
    expect(screenOutline.vertexShader).toContain("outlineOffset *= vViewPosition.z / projectionMatrix[ 1 ].y;");
    const expectedExtrusion = 0.002 * 6 / camera.projectionMatrix.elements[5];
    const renderer = new TiledFakeRenderer(scene, camera, 4096, 2050);
    renderer.failOnTile = fail ? 2 : Number.POSITIVE_INFINITY;
    const renderScene = renderer.render.bind(renderer);
    const sampledFactors: number[] = [];
    renderer.render = (renderedScene, renderedCamera) => {
      if (renderedScene === scene && renderedCamera) {
        // Exercise the installed runtime's material update, which uploads uniforms each frame.
        screenOutline.update(0);
        worldOutline.update(0);
        sampledFactors.push(screenOutline.outlineWidthFactor);
        expect(screenOutline.outlineWidthFactor * 6 / renderedCamera.projectionMatrix.elements[5])
          .toBeCloseTo(expectedExtrusion, 12);
        expect(worldOutline.outlineWidthFactor).toBe(0.003);
      }
      renderScene(renderedScene, renderedCamera);
    };
    try {
      const capture = () => captureStudioVrmRgba(renderer as unknown as THREE.WebGLRenderer, scene, camera, { width: 4096, height: 2050 });
      if (fail) expect(capture).toThrow("tile readback failed");
      else {
        expect(capture().byteLength).toBe(4096 * 2050 * 4);
        expect(sampledFactors.at(-1)).toBeCloseTo(0.002 * 2050 / 2, 12);
      }
      expect(sampledFactors[0]).toBeCloseTo(0.002 * 2050 / 1024, 12);
      expect(screenOutline.outlineWidthFactor).toBe(0.002);
      expect(worldOutline.outlineWidthFactor).toBe(0.003);
      expect(screenOutline.uniformsNeedUpdate).toBe(true);
    } finally {
      screenOutline.dispose();
      worldOutline.dispose();
      geometry.dispose();
    }
  });

  it("encodes exactly one color layer in the Worker without mutating caller pixels", async () => {
    let received: StudioBg3dLtRasterLayer | undefined;
    const deps = dependencies({
      encodePngInWorker: vi.fn(async (layers) => {
        received = layers[0];
        return png(2, 1);
      }),
    });
    const rgba = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);

    await expect(encodeStudioVrmCapturePngDataUrl(
      rgba,
      { width: 2, height: 1 },
      {},
      deps,
    )).resolves.toBe("data:image/png;base64,verified");

    expect(received).toEqual({ role: "color", width: 2, height: 1, data: rgba });
    expect([...rgba]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(deps.encodePngOnMainThread).not.toHaveBeenCalled();
    expect(deps.blobToDataUrl).toHaveBeenCalledOnce();
    expect(deps.blobToDataUrl).toHaveBeenCalledWith(expect.any(Blob), {});
  });

  it("returns a verified PNG Blob without data-URL serialization for artifact persistence", async () => {
    const deps = dependencies();
    const rgba = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);

    const result = await encodeStudioVrmCapturePngBlob(
      rgba,
      { width: 2, height: 1 },
      {},
      deps,
    );

    expect(result.type).toBe("image/png");
    expect(deps.encodePngInWorker).toHaveBeenCalledOnce();
    expect(deps.blobToDataUrl).not.toHaveBeenCalled();
    expect([...rgba]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("accepts a full 4096-square single image while rejecting dimensions above the 16MP boundary", async () => {
    const deps = dependencies();
    const rgba = new Uint8ClampedArray(4096 * 4096 * 4);
    const result = await encodeStudioVrmCapturePngBlob(rgba, { width: 4096, height: 4096 }, {}, deps);
    expect(result.type).toBe("image/png");
    expect(deps.encodePngInWorker).toHaveBeenCalledTimes(1);
    const [layers, options] = vi.mocked(deps.encodePngInWorker).mock.calls[0]!;
    expect(layers.length).toBe(1);
    expect({ role: layers[0]?.role, width: layers[0]?.width, height: layers[0]?.height })
      .toEqual({ role: "color", width: 4096, height: 4096 });
    // Avoid deep mock-argument enumeration of all 67 million channels; this also proves no copy.
    expect(layers[0]?.data === rgba).toBe(true);
    expect(options).toEqual({});
    await expect(encodeStudioVrmCapturePngOnMainThread(rgba, { width: 4096, height: 4096 }))
      .rejects.toThrow("메인 스레드 인코더의 픽셀 예산");
    await expect(encodeStudioVrmCapturePngBlob(rgba, { width: 4096, height: 4097 }, {}, deps)).rejects.toThrow(RangeError);
    expect(deps.encodePngInWorker).toHaveBeenCalledTimes(1);
  });

  it("bounds and cancels a stalled PNG data URL read", async () => {
    class HangingFileReader {
      static last: HangingFileReader | null = null;
      result: string | ArrayBuffer | null = null;
      onabort: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      abort = vi.fn();

      constructor() {
        HangingFileReader.last = this;
      }

      readAsDataURL(): void {
        // Intentionally never settles.
      }
    }
    vi.useFakeTimers();
    vi.stubGlobal("FileReader", HangingFileReader);

    const pending = readStudioVrmPngBlobAsDataUrl(png(1, 1), { timeoutMs: 100 });
    const rejection = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(100);

    await rejection;
    expect(HangingFileReader.last?.abort).toHaveBeenCalledOnce();
  });

  it("keeps Worker failure terminal and uses main-thread encoding only when preselected", async () => {
    const encodePngOnMainThread = vi.fn(
      async (_rgba, dimensions) => png(dimensions.width, dimensions.height),
    );
    const workerUnavailable = dependencies({
      encodePngInWorker: vi.fn(async () => {
        throw new StudioBg3dShotPngWorkerError("worker-unavailable");
      }),
      encodePngOnMainThread,
    });

    await expect(encodeStudioVrmCapturePngDataUrl(
      new Uint8ClampedArray(8),
      { width: 2, height: 1 },
      {},
      workerUnavailable,
    )).rejects.toMatchObject({ code: "worker-unavailable" });
    expect(encodePngOnMainThread).not.toHaveBeenCalled();

    const explicitMainThread = dependencies({
      encodePngInWorker: vi.fn(),
      encodePngOnMainThread,
    });
    await expect(encodeStudioVrmCapturePngDataUrl(
      new Uint8ClampedArray(8),
      { width: 2, height: 1 },
      { encoderBackend: "main-thread" },
      explicitMainThread,
    )).resolves.toBe("data:image/png;base64,verified");
    expect(encodePngOnMainThread).toHaveBeenCalledOnce();
    expect(explicitMainThread.encodePngInWorker).not.toHaveBeenCalled();
  });

  it("rejects malformed output, oversized requests, and already-aborted work", async () => {
    const malformed = dependencies({
      encodePngInWorker: vi.fn(async () => new Blob([new Uint8Array(32)], { type: "image/png" })),
    });
    await expect(encodeStudioVrmCapturePngDataUrl(
      new Uint8ClampedArray(8),
      { width: 2, height: 1 },
      {},
      malformed,
    )).rejects.toThrow("PNG 헤더");
    expect(malformed.blobToDataUrl).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort();
    const aborted = dependencies();
    await expect(encodeStudioVrmCapturePngDataUrl(
      new Uint8ClampedArray(8),
      { width: 2, height: 1 },
      { signal: controller.signal },
      aborted,
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(aborted.encodePngInWorker).not.toHaveBeenCalled();

    expect(() => flipStudioVrmCaptureRows(new Uint8Array(4), {
      width: 4_097,
      height: 1,
    })).toThrow(RangeError);
  });
});
