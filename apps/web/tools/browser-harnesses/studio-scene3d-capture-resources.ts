import * as THREE from "three";

import { renderStudioBg3dLtLayersInWorker } from "../../src/domains/creator/bg3d/studio-bg3d-lt-render-worker-client";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "../../src/domains/creator/bg3d/studio-bg3d-scene-document";
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
    const request = { width: 64, height: 64, includeDepth: true, includeNormals: true,
      background: { color: "#000000", alpha: 0 } } as const;
    const first = await gpuAdapter.capture(request);
    const previousGlTarget = new THREE.WebGLRenderTarget(128, 128);
    let reference: StudioBg3dCapturedRaster;
    try {
      gl.setRenderTarget(previousGlTarget);
      gl.setViewport(7, 9, 19, 21);
      gl.setScissor(2, 3, 11, 13);
      gl.setScissorTest(true);
      reference = await glAdapter.capture(request);
      assert(gl.getRenderTarget() === previousGlTarget, "WebGL capture changed the previous framebuffer.");
      assert(gl.getViewport(new THREE.Vector4()).equals(new THREE.Vector4(7, 9, 19, 21)),
        "WebGL capture changed the live viewport.");
      assert(gl.getScissor(new THREE.Vector4()).equals(new THREE.Vector4(2, 3, 11, 13)) && gl.getScissorTest(),
        "WebGL capture changed the live scissor.");
    } finally {
      gl.setRenderTarget(null); gl.setViewport(0, 0, 64, 64);
      gl.setScissor(0, 0, 64, 64); gl.setScissorTest(false);
      previousGlTarget.dispose();
    }
    assert(first.normalRgba && reference.normalRgba, "Requested normals were not produced.");
    const normalCenter = Array.from(first.normalRgba.slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4));
    assert(normalCenter.every((value, index) => Math.abs(value - [128, 128, 255, 255][index]!) <= 1),
      `View normal differs from the independent plane oracle: ${normalCenter}`);
    let maxNormalDelta = 0;
    for (let i = 0; i < first.normalRgba.length; i += 1) {
      maxNormalDelta = Math.max(maxNormalDelta, Math.abs(first.normalRgba[i]! - reference.normalRgba[i]!));
    }
    assert(maxNormalDelta <= 1, `WebGPU/WebGL normal parity failed: ${maxNormalDelta}`);
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
      assert(next.normalRgba?.every((value, index) => value === first.normalRgba?.[index]), "Reused capture changed normals.");
      assert(tracked.size === warmTargetCount, "Warm capture allocated another render target.");
    }
    const largeCaptures = [];
    for (const size of [2048, 4096]) {
      const start = performance.now();
      const image = await gpuAdapter.capture({ ...request, width: size, height: size, includeDepth: false, includeNormals: false });
      assert(image.rgba.length === size * size * 4, "High-resolution capture dimensions were changed.");
      assert(center(image).every((value, index) => Math.abs(value - expected[index]!) <= 2),
        "High-resolution capture changed HDR pixels.");
      largeCaptures.push({ width: size, height: size, byteLength: image.rgba.length,
        centerRgba: center(image), elapsedMs: performance.now() - start });
    }
    // Actual mesh -> paired geometry MRT -> real module Worker -> artist-facing crease control.
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    const cube = new THREE.Mesh(cubeGeometry, material);
    cube.rotation.set(0.2, 0.55, 0);
    scene.clear(); scene.add(cube);
    const cubeRaster = await gpuAdapter.capture({ ...request, width: 128, height: 128 });
    assert(cubeRaster.normalRgba?.some((value, index) => index % 4 === 3 && value === 0),
      "Normal background did not preserve the no-surface mask.");
    const settings = { line: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line,
      enabled: true, strength: 1, depthEnabled: true, depthStrength: 1, depthOutlineOnly: false,
      exteriorOutlineStrength: 0, textureLineEnabled: false, creaseAngleDegrees: 25 },
      tone: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone, mode: "none" as const } };
    const lower = await renderStudioBg3dLtLayersInWorker(cubeRaster, settings);
    const higher = await renderStudioBg3dLtLayersInWorker(cubeRaster,
      { ...settings, line: { ...settings.line, creaseAngleDegrees: 150 } });
    const alphaSum = (layers: typeof lower.layers) => layers.reduce((total, layer) => {
      if (layer.role !== "main-line") return total;
      for (let i = 3; i < layer.data.length; i += 4) total += layer.data[i]!;
      return total;
    }, 0);
    const crease = { lowAngleAlphaSum: alphaSum(lower.layers), highAngleAlphaSum: alphaSum(higher.layers) };
    assert(crease.lowAngleAlphaSum > crease.highAngleAlphaSum, "Changing crease angle did not change real Worker line pixels.");
    const perspectiveCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    perspectiveCamera.position.set(0.1, 0.15, 2.2);
    perspectiveCamera.lookAt(0, 0, 0); perspectiveCamera.updateMatrixWorld(true);
    const perspectiveGpu = createStudioBg3dThreeWebGpuCaptureAdapter({ renderer, scene, camera: perspectiveCamera });
    const perspectiveGl = createStudioBg3dThreeWebglCaptureAdapter({ renderer: gl, scene, camera: perspectiveCamera });
    const perspective = { comparedSurfacePixels: 0, coverageMismatchPixels: 0, maxNormalDelta: 0 };
    try {
      // Odd dimensions exercise WebGPU's aligned rows as well as the perspective normal matrix.
      const perspectiveRequest = { ...request, width: 65, height: 63 };
      const gpu = await perspectiveGpu.capture(perspectiveRequest);
      const reference = await perspectiveGl.capture(perspectiveRequest);
      assert(gpu.normalRgba && reference.normalRgba, "Perspective normals missing.");
      for (let offset = 0; offset < gpu.normalRgba.length; offset += 4) {
        const a = gpu.normalRgba[offset + 3]!;
        const b = reference.normalRgba[offset + 3]!;
        if (a !== b) perspective.coverageMismatchPixels += 1;
        if (!a || !b) continue;
        perspective.comparedSurfacePixels += 1;
        for (let channel = 0; channel < 3; channel += 1) {
          perspective.maxNormalDelta = Math.max(perspective.maxNormalDelta,
            Math.abs(gpu.normalRgba[offset + channel]! - reference.normalRgba[offset + channel]!));
        }
      }
      assert(perspective.comparedSurfacePixels > 100, "Perspective proof had no meaningful geometry coverage.");
      assert(perspective.coverageMismatchPixels <= 4 && perspective.maxNormalDelta <= 2,
        `Perspective normal parity exceeded the explicit raster tolerance: ${JSON.stringify(perspective)}`);
    } finally { perspectiveGpu.dispose?.(); perspectiveGl.dispose?.(); }
    const appendPreview = (label: string, rgba: Uint8Array | Uint8ClampedArray) => {
      const title = document.createElement("h2"); title.textContent = label; document.body.append(title);
      const preview = document.createElement("canvas"); preview.width = 128; preview.height = 128;
      preview.style.cssText = "width:256px;height:256px;background:white;image-rendering:pixelated";
      preview.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(rgba), 128, 128), 0, 0);
      document.body.append(preview);
    };
    appendPreview("Cube geometry normals", cubeRaster.normalRgba!);
    for (const [label, result] of [["Crease angle 25 degrees", lower], ["Crease angle 150 degrees", higher]] as const) {
      const line = result.layers.find((layer) => layer.role === "main-line");
      if (line) appendPreview(label, line.data);
    }
    cubeGeometry.dispose();
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
      webglViewportRestored: true,
      normals: { center: normalCenter, maxBackendDelta: maxNormalDelta, perspective }, crease,
      hdr: { expected, webgpu: actual, webgl: glPixel, maxChannelDelta },
      reuse: { captures: 9, warmTargetCount, extraTargetsDuringEightWarmCaptures: 0,
        totalTargetCount: tracked.size, disposedTargets: disposedTargets.size },
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
