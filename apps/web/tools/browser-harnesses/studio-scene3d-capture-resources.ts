import * as THREE from "three";

import { createStudioBg3dThreeWebglCaptureAdapter } from "../../src/domains/creator/bg3d/studio-bg3d-three-webgl-capture";
import { createStudioBg3dThreeWebGpuCaptureAdapter } from "../../src/domains/creator/bg3d/studio-bg3d-three-webgpu-capture";
import { createStudioBg3dThreeWebGpuRenderer } from "../../src/domains/creator/bg3d/studio-bg3d-three-webgpu-renderer";

import type { StudioBg3dCapturedRaster } from "../../src/domains/creator/bg3d/studio-bg3d-capture-adapter";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function center(raster: StudioBg3dCapturedRaster): number[] {
  const offset = (Math.floor(raster.height / 2) * raster.width + Math.floor(raster.width / 2)) * 4;
  return Array.from(raster.rgba.slice(offset, offset + 4));
}
function expectedChannel(linear: number): number {
  const mapped = linear / (1 + linear); // Reinhard, exposure=1; no engine code in this oracle.
  return Math.round(255 * (mapped <= 0.0031308 ? mapped * 12.92 : 1.055 * mapped ** (1 / 2.4) - 0.055));
}

async function run() {
  if (!navigator.gpu) return { status: "unsupported", reason: "webgpu-api-unavailable" };
  const canvas = document.createElement("canvas"); document.body.append(canvas);
  const runtime = await createStudioBg3dThreeWebGpuRenderer(canvas, { antialias: false });
  const renderer = runtime.renderer;
  renderer.setSize(64, 64); renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ReinhardToneMapping; renderer.toneMappingExposure = 1;
  const scene = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(4, 1, 0.25) });
  scene.add(new THREE.Mesh(geometry, material));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2; camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const tracked = new Set<THREE.RenderTarget>();
  const disposedTargets = new Set<THREE.RenderTarget>();
  const originalSetTarget = renderer.setRenderTarget.bind(renderer);
  renderer.setRenderTarget = (...args: Parameters<typeof renderer.setRenderTarget>) => {
    const target = args[0];
    if (target && !tracked.has(target)) {
      tracked.add(target); target.addEventListener("dispose", () => disposedTargets.add(target));
    }
    return originalSetTarget(...args);
  };
  const gpuAdapter = createStudioBg3dThreeWebGpuCaptureAdapter({ renderer, scene, camera });
  const glCanvas = document.createElement("canvas"); document.body.append(glCanvas);
  const gl = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, alpha: true });
  gl.setSize(64, 64); gl.setPixelRatio(1);
  gl.toneMapping = THREE.ReinhardToneMapping; gl.toneMappingExposure = 1;
  const glAdapter = createStudioBg3dThreeWebglCaptureAdapter({ renderer: gl, scene, camera });
  try {
    assert(gl.extensions.has("EXT_color_buffer_float"), "WebGL float-target extension is unavailable for HDR parity.");
    const request = { width: 64, height: 64, includeDepth: true,
      background: { color: "#000000", alpha: 0 } } as const;
    const first = await gpuAdapter.capture(request);
    const reference = await glAdapter.capture(request);
    const expected = [expectedChannel(4), expectedChannel(1), expectedChannel(0.25), 255];
    const actual = center(first); const glPixel = center(reference);
    assert(actual.every((value, index) => Math.abs(value - expected[index]!) <= 2),
      `HDR highlights were clipped before tone mapping: ${actual}, expected ${expected}`);
    assert(glPixel.every((value, index) => Math.abs(value - expected[index]!) <= 2),
      `WebGL HDR output differs from the independent oracle: ${glPixel}`);
    let maxChannelDelta = 0;
    for (let i = 0; i < first.rgba.length; i += 1) {
      maxChannelDelta = Math.max(maxChannelDelta, Math.abs(first.rgba[i]! - reference.rgba[i]!));
    }
    assert(maxChannelDelta <= 2, `HDR backend parity failed: ${maxChannelDelta}`);
    const warmTargetCount = tracked.size;
    const durations: number[] = [];
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const start = performance.now();
      const next = await gpuAdapter.capture(request);
      durations.push(performance.now() - start);
      assert(next.rgba.every((value, index) => value === first.rgba[index]), "Reused capture changed pixels.");
      assert(next.depth?.every((value, index) => value === first.depth?.[index]), "Reused capture changed depth.");
      assert(tracked.size === warmTargetCount, "Warm capture allocated another render target.");
    }
    const largeCaptures = [];
    for (const size of [2048, 4096]) {
      const start = performance.now();
      const image = await gpuAdapter.capture({ ...request, width: size, height: size, includeDepth: false });
      assert(image.rgba.length === size * size * 4, "High-resolution capture dimensions were changed.");
      assert(center(image).every((value, index) => Math.abs(value - expected[index]!) <= 2),
        "High-resolution capture changed HDR pixels.");
      largeCaptures.push({ width: size, height: size, byteLength: image.rgba.length,
        centerRgba: center(image), elapsedMs: performance.now() - start });
    }
    const device = (renderer.backend as unknown as { device?: { adapterInfo?: {
      vendor?: string; architecture?: string; isFallbackAdapter?: boolean;
    } } }).device;
    const info = device?.adapterInfo;
    gpuAdapter.dispose?.();
    assert(disposedTargets.size === tracked.size, "Adapter disposal retained render targets.");
    const preview = document.createElement("canvas"); preview.width = 64; preview.height = 64;
    preview.style.cssText = "width:256px;height:256px;image-rendering:pixelated";
    preview.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(first.rgba), 64, 64), 0, 0);
    document.body.append(preview);
    return { status: "ok", implementationRevision: gpuAdapter.implementationRevision,
      actualDevice: { vendor: info?.vendor ?? null, architecture: info?.architecture ?? null,
        isFallbackAdapter: info?.isFallbackAdapter ?? null },
      hdr: { expected, webgpu: actual, webgl: glPixel, maxChannelDelta },
      reuse: { captures: 9, warmTargetCount, extraTargetsDuringEightWarmCaptures: 0,
        targetCountAfterLargeCaptures: tracked.size, disposedTargets: disposedTargets.size },
      warmCaptureElapsedMs: durations, largeCaptures };
  } finally {
    gpuAdapter.dispose?.(); glAdapter.dispose?.();
    geometry.dispose(); material.dispose(); gl.dispose(); await runtime.dispose();
  }
}

const scope = window as unknown as { __scene3dCaptureProof?: unknown };
void run().then((result) => { scope.__scene3dCaptureProof = result; }, (error: unknown) => {
  scope.__scene3dCaptureProof = { status: "failed", message: error instanceof Error ? error.message : String(error) };
});
