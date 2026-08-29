/**
 * Real-Chromium harness for the Studio BG3D next-generation engine.
 *
 * It exercises the production modules — the capability probe, the engine-selection policy, the
 * WebGPU renderer factory, and the WebGPU capture adapter — against a live GPU, then renders the
 * same deterministic scene through the existing WebGL adapter and compares the two rasters. That
 * comparison is the point: the engine promotion is only real if the line-and-tone pipeline gets
 * the same pixels and the same depth from either backend.
 */

import * as THREE from "three";

import { selectStudioBg3dEngine } from "../src/domains/creator/bg3d/studio-bg3d-engine-selection";
import { classifyStudioBg3dInAppBrowser } from "../src/domains/creator/bg3d/studio-bg3d-inapp-browser";
import { createStudioBg3dThreeWebglCaptureAdapter } from "../src/domains/creator/bg3d/studio-bg3d-three-webgl-capture";
import {
  createStudioBg3dThreeWebGpuCaptureAdapter,
  createStudioBg3dThreeWebGpuRenderer,
} from "../src/domains/creator/bg3d/studio-bg3d-three-webgpu-entry";
import { probeStudioBg3dWebGpuCapability } from "../src/domains/creator/bg3d/studio-bg3d-webgpu-capability";

import type { StudioBg3dCaptureAdapter } from "../src/domains/creator/bg3d/studio-bg3d-capture-adapter";

declare global {
  interface Window {
    __studioBg3dWebGpuEngineResult?: unknown;
  }
}

const CAPTURE_WIDTH = 96;
const CAPTURE_HEIGHT = 64;
/** From STUDIO_BG3D_ENGINE_BENCHMARK_PIXEL_CHANNEL_TOLERANCE / _DEPTH_TOLERANCE. */
const CHANNEL_TOLERANCE = 4;
const DEPTH_TOLERANCE = 0.001;

interface RasterComparison {
  readonly maxChannelDelta: number;
  readonly meanChannelDelta: number;
  readonly overToleranceChannels: number;
  readonly comparedChannels: number;
  /** Alpha is the one channel that is always defined, so it is compared on its own. */
  readonly maxAlphaDelta: number;
  /**
   * Straight-alpha RGB is undefined where alpha is zero and numerically unstable where it is
   * nearly zero, so the composited (premultiplied) value is what a reader actually sees.
   */
  readonly maxCompositedDelta: number;
  readonly overToleranceCompositedChannels: number;
  readonly comparedPixels: number;
}

interface DepthComparison {
  readonly maxDepthDelta: number;
  readonly overToleranceSamples: number;
  readonly comparedSamples: number;
  readonly distinctDepthValues: number;
}

/**
 * Each backend gets its own camera on purpose. `WebGPURenderer` rewrites `camera.coordinateSystem`
 * (and therefore the projection matrix) to the WebGPU [0,1] clip convention, while `WebGLRenderer`
 * never resets it — so one camera shared between both would hand the WebGL depth pass a WebGPU
 * projection and produce a `0.5·z+0.5` shifted raster. The editor cannot hit this (switching
 * backends remounts the R3F canvas with a fresh camera), but the harness renders both at once.
 */
function buildCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, CAPTURE_WIDTH / CAPTURE_HEIGHT, 0.1, 20);
  camera.position.set(0, 0.4, 3.2);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

function buildScene(): THREE.Scene {
  const scene = new THREE.Scene();
  // Unlit materials on purpose: both backends must agree on colour before lighting models are
  // allowed to explain a difference away.
  const near = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xd0402a }),
  );
  near.position.set(-0.5, 0, 0.4);
  const far = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.MeshBasicMaterial({ color: 0x2a63d0 }),
  );
  far.position.set(0.7, 0.1, -1.6);
  scene.add(near, far);
  return scene;
}

function compareRasters(
  left: Uint8Array | Uint8ClampedArray,
  right: Uint8Array | Uint8ClampedArray,
): RasterComparison {
  const length = Math.min(left.length, right.length);
  let maxChannelDelta = 0;
  let total = 0;
  let overTolerance = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = Math.abs((left[index] ?? 0) - (right[index] ?? 0));
    total += delta;
    if (delta > maxChannelDelta) maxChannelDelta = delta;
    if (delta > CHANNEL_TOLERANCE) overTolerance += 1;
  }

  let maxAlphaDelta = 0;
  let maxCompositedDelta = 0;
  let overToleranceComposited = 0;
  const pixels = Math.floor(length / 4);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const leftAlpha = left[offset + 3] ?? 0;
    const rightAlpha = right[offset + 3] ?? 0;
    maxAlphaDelta = Math.max(maxAlphaDelta, Math.abs(leftAlpha - rightAlpha));
    for (let channel = 0; channel < 3; channel += 1) {
      const composited = Math.abs(
        ((left[offset + channel] ?? 0) * leftAlpha - (right[offset + channel] ?? 0) * rightAlpha)
        / 255,
      );
      if (composited > maxCompositedDelta) maxCompositedDelta = composited;
      if (composited > CHANNEL_TOLERANCE) overToleranceComposited += 1;
    }
  }

  return {
    maxChannelDelta,
    meanChannelDelta: length > 0 ? total / length : 0,
    overToleranceChannels: overTolerance,
    comparedChannels: length,
    maxAlphaDelta,
    maxCompositedDelta,
    overToleranceCompositedChannels: overToleranceComposited,
    comparedPixels: pixels,
  };
}

function sampleDepthDeltas(left: Float32Array, right: Float32Array) {
  const rows: Array<{ index: number; webgpu: number; webgl: number; delta: number }> = [];
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    rows.push({ index, webgpu: a, webgl: b, delta: Math.abs(a - b) });
  }
  rows.sort((first, second) => second.delta - first.delta);
  return rows.slice(0, 6);
}

function compareDepth(left: Float32Array, right: Float32Array): DepthComparison {
  const length = Math.min(left.length, right.length);
  let maxDepthDelta = 0;
  let overTolerance = 0;
  const distinct = new Set<number>();
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    distinct.add(Math.round(a * 1000));
    const delta = Math.abs(a - b);
    if (delta > maxDepthDelta) maxDepthDelta = delta;
    if (delta > DEPTH_TOLERANCE) overTolerance += 1;
  }
  return {
    maxDepthDelta,
    overToleranceSamples: overTolerance,
    comparedSamples: length,
    distinctDepthValues: distinct.size,
  };
}

function summarizeRaster(rgba: Uint8Array | Uint8ClampedArray) {
  let nonZeroAlpha = 0;
  let maxRed = 0;
  let maxBlue = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    if ((rgba[index + 3] ?? 0) > 0) nonZeroAlpha += 1;
    maxRed = Math.max(maxRed, rgba[index] ?? 0);
    maxBlue = Math.max(maxBlue, rgba[index + 2] ?? 0);
  }
  return { nonZeroAlpha, maxRed, maxBlue, byteLength: rgba.length };
}

function applyRenderContract(renderer: {
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  outputColorSpace: string;
}): void {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

async function captureWith(
  adapter: StudioBg3dCaptureAdapter,
  alpha: number,
): Promise<{ rgba: Uint8Array | Uint8ClampedArray; depth: Float32Array }> {
  const raster = await adapter.capture({
    width: CAPTURE_WIDTH,
    height: CAPTURE_HEIGHT,
    background: { color: "#ffffff", alpha },
    includeDepth: true,
  });
  if (!raster.depth) throw new Error("capture adapter returned no depth for includeDepth");
  return { rgba: raster.rgba, depth: raster.depth };
}

/** Engine-selection evidence for the hosts Korean traffic actually arrives through. */
function selectionMatrix(probe: Awaited<ReturnType<typeof probeStudioBg3dWebGpuCapability>>) {
  const hosts = [
    ["desktop-chrome", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"],
    ["kakaotalk", "Mozilla/5.0 (Linux; Android 15; SM-S928N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.6.5"],
    ["naver-app", "Mozilla/5.0 (Linux; Android 15; SM-S928N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.9.6)"],
    ["instagram", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0"],
    ["ios-webview", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"],
  ] as const;
  return hosts.map(([id, userAgent]) => {
    const inApp = classifyStudioBg3dInAppBrowser({ userAgent });
    const auto = selectStudioBg3dEngine({
      preference: "auto",
      probe,
      inApp,
      deviceProfile: id === "desktop-chrome" ? "desktop" : "mobile",
      webgpuRuntimeAvailable: true,
    });
    const opted = selectStudioBg3dEngine({
      preference: "webgpu",
      probe,
      inApp,
      deviceProfile: id === "desktop-chrome" ? "desktop" : "mobile",
      webgpuRuntimeAvailable: true,
    });
    return {
      id,
      family: inApp.family,
      gpuTrust: inApp.gpuTrust,
      autoBackend: auto.backend,
      autoReason: auto.reason,
      optInBackend: opted.backend,
      optInReason: opted.reason,
      notice: auto.notice,
    };
  });
}

async function run(): Promise<unknown> {
  const probe = await probeStudioBg3dWebGpuCapability({
    secureContext: window.isSecureContext,
    gpu: (navigator as Navigator & { gpu?: Parameters<typeof probeStudioBg3dWebGpuCapability>[0]["gpu"] }).gpu,
  });
  if (!probe.supported) {
    return { status: "unsupported", reason: probe.reason, probe };
  }

  const webgpuCanvas = document.createElement("canvas");
  webgpuCanvas.width = CAPTURE_WIDTH;
  webgpuCanvas.height = CAPTURE_HEIGHT;
  document.body.append(webgpuCanvas);

  const deviceLosses: string[] = [];
  const runtime = await createStudioBg3dThreeWebGpuRenderer(webgpuCanvas, {
    antialias: false,
    alpha: true,
    onDeviceLost: (loss) => deviceLosses.push(`${loss.reason}: ${loss.message}`),
  });
  const webgpuRenderer = runtime.renderer;
  applyRenderContract(webgpuRenderer as unknown as Parameters<typeof applyRenderContract>[0]);
  webgpuRenderer.setSize(CAPTURE_WIDTH, CAPTURE_HEIGHT, false);

  const webglCanvas = document.createElement("canvas");
  webglCanvas.width = CAPTURE_WIDTH;
  webglCanvas.height = CAPTURE_HEIGHT;
  document.body.append(webglCanvas);
  const webglRenderer = new THREE.WebGLRenderer({
    canvas: webglCanvas,
    antialias: false,
    alpha: true,
  });
  applyRenderContract(webglRenderer);
  webglRenderer.setSize(CAPTURE_WIDTH, CAPTURE_HEIGHT, false);

  const scene = buildScene();
  const webgpuAdapter = createStudioBg3dThreeWebGpuCaptureAdapter({
    renderer: webgpuRenderer,
    scene,
    camera: buildCamera(),
  });
  const webglAdapter = createStudioBg3dThreeWebglCaptureAdapter({
    renderer: webglRenderer,
    scene,
    camera: buildCamera(),
  });

  const opaqueWebgpu = await captureWith(webgpuAdapter, 1);
  const opaqueWebgl = await captureWith(webglAdapter, 1);
  const transparentWebgpu = await captureWith(webgpuAdapter, 0);
  const transparentWebgl = await captureWith(webglAdapter, 0);

  const result = {
    status: "ok",
    backend: "real-chromium-three-webgpu",
    probe,
    adapters: {
      webgpu: {
        backend: webgpuAdapter.backend,
        graphicsApi: webgpuAdapter.graphicsApi,
        profileId: webgpuAdapter.profileId,
        implementationRevision: webgpuAdapter.implementationRevision,
        engineVersion: webgpuAdapter.engineVersion,
        sourceSize: webgpuAdapter.getSourceSize(),
      },
      webgl: {
        backend: webglAdapter.backend,
        graphicsApi: webglAdapter.graphicsApi,
        profileId: webglAdapter.profileId,
      },
    },
    opaque: {
      webgpu: summarizeRaster(opaqueWebgpu.rgba),
      webgl: summarizeRaster(opaqueWebgl.rgba),
      raster: compareRasters(opaqueWebgpu.rgba, opaqueWebgl.rgba),
      depth: compareDepth(opaqueWebgpu.depth, opaqueWebgl.depth),
      worstDepthSamples: sampleDepthDeltas(opaqueWebgpu.depth, opaqueWebgl.depth),
    },
    transparent: {
      webgpu: summarizeRaster(transparentWebgpu.rgba),
      webgl: summarizeRaster(transparentWebgl.rgba),
      raster: compareRasters(transparentWebgpu.rgba, transparentWebgl.rgba),
      depth: compareDepth(transparentWebgpu.depth, transparentWebgl.depth),
      worstDepthSamples: sampleDepthDeltas(transparentWebgpu.depth, transparentWebgl.depth),
    },
    selection: selectionMatrix(probe),
    liveUserAgent: {
      userAgent: navigator.userAgent,
      classified: classifyStudioBg3dInAppBrowser({ userAgent: navigator.userAgent }),
    },
    deviceLosses,
  };

  webglRenderer.dispose();
  await runtime.dispose();
  return result;
}

run().then(
  (value) => {
    window.__studioBg3dWebGpuEngineResult = value;
  },
  (error: unknown) => {
    window.__studioBg3dWebGpuEngineResult = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? (error.stack ?? null) : null,
    };
  },
);
