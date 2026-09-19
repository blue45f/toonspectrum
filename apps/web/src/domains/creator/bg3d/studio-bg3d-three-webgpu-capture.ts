/**
 * Three/WebGPU implementation of the renderer-neutral Studio 3D capture contract.
 *
 * The WebGL adapter and this one must produce the same raster for the same scene, because the
 * line-and-tone pipeline, shot batches, and the studio insert flow all consume the result as one
 * profile. Two differences between the renderers make that non-trivial, and both are handled here
 * rather than papered over:
 *
 * 1. `WebGPURenderer.readRenderTargetPixelsAsync()` returns a fresh buffer instead of filling a
 *    caller-owned one, so the adapter owns the copy into the contract's packed layout.
 * 2. WebGPURenderer applies tone mapping and the output transfer function only when drawing to the
 *    *output* target. Rendering into a capture target therefore lands in the linear working space,
 *    and this module runs the same straight-alpha → tone-map → sRGB transform the WebGL adapter
 *    gets from `OutputPass`, expressed in TSL.
 *
 * Depth uses Three's `RGBADepthPacking` byte layout so both backends decode through the one
 * `decodeStudioBg3dThreeRgbaDepth` implementation. `MeshDepthMaterial` has no node-material
 * equivalent, so the packing is transliterated from Three's `packing.glsl.js` into TSL and covered
 * by a pure round-trip test.
 */

import * as THREE from "three";

import { createStudioScene3dResourcePool } from "../scene3d/studio-scene3d-resource-pool";
import { registerStudioScene3dResourceOwner } from "../scene3d/studio-scene3d-resource-owner";
import {
  Fn,
  depth as fragmentDepth,
  float,
  screenUV,
  mrt,
  output,
  normalView,
  texture,
  vec3,
  vec4,
} from "three/tsl";
import { MeshBasicNodeMaterial, NodeMaterial, QuadMesh } from "three/webgpu";

import {
  STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
  STUDIO_BG3D_CAPTURE_NORMAL_PROFILE_V1,
  assertStudioBg3dCaptureRequest,
} from "./studio-bg3d-capture-adapter";
import {
  hideStudioBg3dCaptureExcludedObjects,
  hideStudioBg3dDepthExcludedObjects,
} from "./studio-bg3d-capture-exclusion";
import {
  decodeStudioBg3dThreeRgbaDepth,
} from "./studio-bg3d-lt-render";
import { assertStudioBg3dCaptureBudget } from "./studio-bg3d-capture-budget";
import { normalizeStudioBg3dRgbaReadback } from "./studio-bg3d-readback-normalize";

import type {
  StudioBg3dCaptureAdapter,
  StudioBg3dCapturedRaster,
  StudioBg3dCaptureRequest,
} from "./studio-bg3d-capture-adapter";
import type { WebGPURenderer } from "three/webgpu";

/** App-owned revision; bump when adapter orchestration, shaders, or readback change. */
export const STUDIO_BG3D_THREE_WEBGPU_CAPTURE_IMPLEMENTATION_V1 =
  "studio-three-webgpu-capture-adapter-v1";
export const STUDIO_BG3D_THREE_WEBGPU_CAPTURE_IMPLEMENTATION_V2 =
  "studio-three-webgpu-capture-adapter-v2-hdr-owned";
export const STUDIO_BG3D_THREE_WEBGPU_CAPTURE_IMPLEMENTATION_V3 =
  "studio-three-webgpu-capture-adapter-v3-hdr-mrt-normals";

export interface CreateStudioBg3dThreeWebGpuCaptureAdapterInput {
  readonly renderer: WebGPURenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
}

/**
 * Three types the readback as a generic typed array. The capture contract is 8-bit, and a backend
 * that returned anything else would silently corrupt the raster, so this refuses instead.
 */
function toReadbackBytes(value: unknown): Uint8Array | Uint8ClampedArray {
  if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) return value;
  throw new TypeError("3D WebGPU capture readback must be an 8-bit typed array.");
}

function assertCaptureDimensions(width: number, height: number, includeDepth = false): void {
  assertStudioBg3dCaptureBudget({ width, height, includeDepth });
}

function createCaptureTarget(width: number, height: number, depthBuffer: boolean, count = 1): THREE.RenderTarget {
  const target = new THREE.RenderTarget(width, height, {
    depthBuffer,
    count,
    stencilBuffer: false,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  });
  // Working-colour buffer: the explicit transfer happens in the output quad below, exactly once.
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

/**
 * Transliteration of Three's `packDepthToRGBA` (`packing.glsl.js`). `modf` has no TSL counterpart,
 * so each step is written as the `floor`/`fract` pair it decomposes to; depth is non-negative here,
 * so `floor` and truncation agree.
 */
type StudioTslFloatNode = ReturnType<typeof float>;

const packDepthToRgba = /*@__PURE__*/ Fn(([value]: readonly [StudioTslFloatNode]) => {
  const clamped = value.clamp(0, 1);
  const scaled = clamped.mul(16_777_216);
  const alphaFraction = scaled.fract();
  const afterAlpha = scaled.floor();
  const blueScaled = afterAlpha.div(256);
  const blueFraction = blueScaled.fract();
  const afterBlue = blueScaled.floor();
  const greenScaled = afterBlue.div(256);
  const greenFraction = greenScaled.fract();
  const red = greenScaled.floor();
  return vec4(
    red.div(255),
    greenFraction.mul(256 / 255),
    blueFraction.mul(256 / 255),
    alphaFraction,
  );
});

function createDepthNodeMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.name = "Studio BG3D WebGPU depth";
  material.blending = THREE.NoBlending;
  material.toneMapped = false;
  material.transparent = false;
  material.fog = false;
  // `fragmentDepth` is Three's window-space fragment depth — the same value `MeshDepthMaterial`
  // packs on the WebGL side, resolved per camera projection by the node graph.
  material.colorNode = packDepthToRgba(fragmentDepth as unknown as StudioTslFloatNode);
  return material;
}

/**
 * Applies the straight-alpha restore, tone mapping, and sRGB transfer that the WebGL adapter gets
 * from `OutputPass`. Three stores a premultiplied linear composite in a transparent target, and
 * Studio's raster contract is straight alpha.
 */
function createOutputQuad(
  sceneTexture: THREE.Texture,
  toneMapping: THREE.ToneMapping,
): QuadMesh {
  const material = new NodeMaterial();
  material.name = "Studio BG3D WebGPU straight-alpha output";
  material.fragmentNode = Fn(() => {
    const sampled = texture(sceneTexture, screenUV);
    const alpha = sampled.a;
    const straight = alpha.greaterThan(0).select(sampled.rgb.div(alpha), vec3(0));
    return vec4(straight, alpha).renderOutput(toneMapping, THREE.SRGBColorSpace);
  })();
  return new QuadMesh(material);
}

/** `Mesh.material` is typed as one-or-many; the capture quad always owns exactly one. */
function disposeQuadMaterial(quad: QuadMesh | null): void {
  const material = quad?.material;
  if (!material) return;
  for (const entry of Array.isArray(material) ? material : [material]) entry.dispose();
}

interface RendererCaptureState {
  readonly clearColor: THREE.Color;
  readonly mrt: ReturnType<WebGPURenderer["getMRT"]> | null;
  readonly viewport: THREE.Vector4;
  readonly scissor: THREE.Vector4;
  readonly scissorTest: boolean;
  readonly activeCubeFace: number;
  readonly activeMipmapLevel: number;
  readonly renderTarget: THREE.RenderTarget | null;
  readonly clearAlpha: number;
  readonly autoClear: boolean;
  readonly xrEnabled: boolean;
}

/** Three's WebGPU renderer reads its clear colour into a `Color4`; only RGB round-trips here. */
type StudioWebGpuClearColorTarget = Parameters<WebGPURenderer["getClearColor"]>[0];

function readRendererState(renderer: WebGPURenderer): RendererCaptureState {
  const clearColor = new THREE.Color() as unknown as StudioWebGpuClearColorTarget;
  renderer.getClearColor(clearColor);
  return {
    clearColor: (clearColor as unknown as THREE.Color).clone(),
    mrt: renderer.getMRT(),
    viewport: renderer.getViewport(new THREE.Vector4()),
    scissor: renderer.getScissor(new THREE.Vector4()),
    scissorTest: renderer.getScissorTest(),
    activeCubeFace: renderer.getActiveCubeFace(),
    activeMipmapLevel: renderer.getActiveMipmapLevel(),
    renderTarget: renderer.getRenderTarget(),
    clearAlpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
    xrEnabled: renderer.xr.enabled,
  };
}

function restoreRendererState(renderer: WebGPURenderer, state: RendererCaptureState): void {
  renderer.setMRT(state.mrt);
  renderer.setRenderTarget(state.renderTarget, state.activeCubeFace, state.activeMipmapLevel);
  renderer.setClearColor(state.clearColor, state.clearAlpha);
  renderer.setViewport(state.viewport);
  renderer.setScissor(state.scissor);
  renderer.setScissorTest(state.scissorTest);
  renderer.autoClear = state.autoClear;
  renderer.xr.enabled = state.xrEnabled;
}

interface CaptureResources {
  readonly sceneTarget: THREE.RenderTarget;
  readonly outputTarget: THREE.RenderTarget;
  readonly outputQuad: QuadMesh;
  readonly depthTarget: THREE.RenderTarget | null;
  readonly depthMaterial: MeshBasicNodeMaterial | null;
  readonly geometryMrt: ReturnType<typeof mrt> | null;
}

function createCaptureResources(request: StudioBg3dCaptureRequest, toneMapping: THREE.ToneMapping): CaptureResources {
  const owned: Array<{ dispose(): void }> = [];
  try {
    const sceneTarget = createCaptureTarget(request.width, request.height, true);
    owned.push(sceneTarget);
    // Preserve values above 1.0 until the explicit tone-map pass; RGBA8 here clips highlights.
    sceneTarget.texture.type = THREE.HalfFloatType;
    const outputTarget = createCaptureTarget(request.width, request.height, false);
    owned.push(outputTarget);
    const outputQuad = createOutputQuad(sceneTarget.texture, toneMapping);
    owned.push({ dispose: () => disposeQuadMaterial(outputQuad) });
    const depthTarget = request.includeDepth
      ? createCaptureTarget(request.width, request.height, true, request.includeNormals ? 2 : 1) : null;
    if (depthTarget) owned.push(depthTarget);
    const depthMaterial = request.includeDepth ? createDepthNodeMaterial() : null;
    if (depthMaterial) owned.push(depthMaterial);
    let geometryMrt: ReturnType<typeof mrt> | null = null;
    if (request.includeNormals && depthTarget) {
      depthTarget.textures[0]!.name = "output";
      depthTarget.textures[1]!.name = "studioNormal";
      depthTarget.textures[1]!.colorSpace = THREE.NoColorSpace;
      geometryMrt = mrt({ output, studioNormal: vec4(normalView.mul(0.5).add(0.5), 1) });
    }
    return { sceneTarget, outputTarget, outputQuad, depthTarget, depthMaterial, geometryMrt };
  } catch (error) {
    for (const resource of owned.reverse()) {
      try { resource.dispose(); } catch { /* Preserve the allocation failure. */ }
    }
    throw error;
  }
}

function disposeCaptureResources(resources: CaptureResources): void {
  const owned = [resources.depthMaterial, resources.depthTarget, resources.outputTarget,
    resources.sceneTarget, { dispose: () => disposeQuadMaterial(resources.outputQuad) }];
  for (const resource of owned) {
    try { resource?.dispose(); } catch { /* Dispose all resources even after device loss. */ }
  }
}

function newCapturePool() {
  return createStudioScene3dResourcePool<CaptureResources>({
    maxBytes: 512 * 1024 * 1024,
    maxIdleBytes: 64 * 1024 * 1024,
    maxIdleEntries: 2,
    dispose: disposeCaptureResources,
  });
}
interface SharedCapturePool {
  readonly pool: ReturnType<typeof newCapturePool>;
  readonly unregister: () => void;
  users: number;
}
const capturePools = new WeakMap<WebGPURenderer, SharedCapturePool>();

function retainCapturePool(renderer: WebGPURenderer): SharedCapturePool {
  let shared = capturePools.get(renderer);
  if (!shared) {
    const pool = newCapturePool();
    const unregister = registerStudioScene3dResourceOwner(renderer, () => {
      pool.dispose();
      capturePools.delete(renderer);
    });
    shared = { pool, unregister, users: 0 };
    capturePools.set(renderer, shared);
  }
  shared.users += 1;
  return shared;
}

function retireCapturePoolIfUnused(renderer: WebGPURenderer, shared: SharedCapturePool): void {
  if (shared.users > 0 || shared.pool.snapshot().activeCount > 0) return;
  shared.pool.dispose();
  shared.unregister();
  if (capturePools.get(renderer) === shared) capturePools.delete(renderer);
}

function releaseCapturePool(renderer: WebGPURenderer, shared: SharedCapturePool): void {
  shared.users -= 1;
  // A replacement R3F View must still account for the previous View's outstanding GPU copies.
  // Keep one pool per renderer until every lease settles; otherwise remounting bypasses its budget.
  retireCapturePoolIfUnused(renderer, shared);
}

/** Includes depth attachments and aligned GPU readback staging, not just the encoded PNG size. */
function captureResourceBytes(request: StudioBg3dCaptureRequest): number {
  const pixels = request.width * request.height;
  const alignedRowBytes = Math.ceil(request.width * 4 / 256) * 256;
  return pixels * (16 + (request.includeDepth ? 8 : 0) + (request.includeNormals ? 4 : 0))
    + alignedRowBytes * request.height * (1 + Number(request.includeDepth) + Number(request.includeNormals === true));
}

/**
 * Submits the colour passes and returns the pending readback. Renderer and scene state are handed
 * back before the first await, exactly like the WebGL adapter, so a live frame cannot render into
 * the capture target while the GPU fence is still pending. The temporary targets are owned by the
 * caller's resource lease until every submitted readback settles, then reused within its budget.
 */
function submitColorCapture(input: {
  readonly renderer: WebGPURenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly request: StudioBg3dCaptureRequest;
  readonly resources: CaptureResources;
}): Promise<Uint8ClampedArray> {
  const { renderer, scene, camera, request } = input;
  const state = readRendererState(renderer);
  const capturedBackground = scene.background;
  const capturedBackgroundRotation = scene.backgroundRotation.clone();
  const { sceneTarget, outputTarget, outputQuad } = input.resources;
  let readback: Promise<unknown> | undefined;
  let failed = false;
  let failure: unknown;
  try {
    renderer.xr.enabled = false;
    renderer.autoClear = true;
    renderer.setMRT(null);
    renderer.setScissorTest(false);
    // Equirectangular backgrounds are colour-only decoration; a transparent capture must not bake
    // one into the alpha channel.
    if (request.background.alpha === 0) scene.background = null;
    renderer.setRenderTarget(sceneTarget);
    renderer.setClearColor(
      new THREE.Color(request.background.color).getHex(),
      request.background.alpha,
    );
    renderer.render(scene, camera);

    renderer.setRenderTarget(outputTarget);
    renderer.setClearColor(0x000000, 0);
    outputQuad.render(renderer);

    readback = renderer.readRenderTargetPixelsAsync(
      outputTarget,
      0,
      0,
      request.width,
      request.height,
    );
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    scene.background = capturedBackground;
    scene.backgroundRotation.copy(capturedBackgroundRotation);
    try {
      restoreRendererState(renderer, state);
    } catch (error) {
      if (!failed) { failed = true; failure = error; }
    }
  }
  // Restoration may throw after a copy was submitted. Keep the pool lease until it settles.
  if (failed && !readback) throw failure;
  return Promise.allSettled(readback ? [readback] : []).then((results) => {
    if (failed) throw failure;
    const raw = results[0];
    if (!raw) throw new Error("Missing color readback.");
    if (raw.status === "rejected") throw raw.reason;
    return normalizeStudioBg3dRgbaReadback({
      width: request.width,
      height: request.height,
      flipY: false,
      rgba: toReadbackBytes(raw.value),
    });
  });
}

interface GeometryCapture {
  readonly depth: Float32Array;
  readonly normalRgba?: Uint8ClampedArray;
}

/** Depth + optional view normals share one geometry draw, camera and exclusion snapshot. */
function submitDepthCapture(input: {
  readonly renderer: WebGPURenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly width: number;
  readonly height: number;
  readonly resources: CaptureResources;
}): Promise<GeometryCapture> {
  const { renderer, scene, camera, width, height, resources } = input;
  assertCaptureDimensions(width, height, true);
  const state = readRendererState(renderer);
  const capturedOverride = scene.overrideMaterial;
  const capturedBackground = scene.background;
  const target = resources.depthTarget;
  if (!target || !resources.depthMaterial) throw new Error("Depth capture resources were not acquired.");
  const restoreDepthExcludedObjects = hideStudioBg3dDepthExcludedObjects(scene);
  const pending: Promise<unknown>[] = [];
  let failed = false;
  let failure: unknown;
  try {
    renderer.xr.enabled = false;
    renderer.autoClear = true;
    renderer.setMRT(resources.geometryMrt);
    renderer.setScissorTest(false);
    scene.overrideMaterial = resources.depthMaterial;
    scene.background = null;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0xffffff, 1);
    renderer.render(scene, camera);
    pending.push(renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height));
    if (resources.geometryMrt) {
      pending.push(renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height, 1));
    }
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    scene.overrideMaterial = capturedOverride;
    scene.background = capturedBackground;
    try {
      restoreRendererState(renderer, state);
    } catch (error) {
      if (!failed) { failed = true; failure = error; }
    } finally {
      restoreDepthExcludedObjects();
    }
  }
  // A later copy can throw before returning a promise. Drain earlier fences before releasing MRT.
  if (failed && pending.length === 0) throw failure;
  return Promise.allSettled(pending).then((results) => {
    if (failed) throw failure;
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
    const packed = results[0];
    if (packed?.status !== "fulfilled") throw new Error("Missing depth readback.");
    const depth = decodeStudioBg3dThreeRgbaDepth({ width, height,
      rgba: normalizeStudioBg3dRgbaReadback({ width, height, flipY: false, rgba: toReadbackBytes(packed.value) }),
      flipY: false });
    const normalResult = results[1];
    if (normalResult?.status !== "fulfilled") return { depth };
    const normalRgba = normalizeStudioBg3dRgbaReadback({ width, height, flipY: false,
      rgba: toReadbackBytes(normalResult.value) });
    // r184 clears all MRT attachments together. The packed far plane owns the no-surface mask.
    for (let pixel = 0; pixel < depth.length; pixel += 1) {
      if (depth[pixel]! >= 1) normalRgba.fill(0, pixel * 4, pixel * 4 + 4);
    }
    return { depth, normalRgba };
  });
}

/**
 * Builds the WebGPU capture adapter for the live editor scene. Construction is fail-closed: a
 * renderer that is not an initialized WebGPU renderer is refused and the selected capture stays
 * unavailable instead of silently producing an empty raster or invoking another renderer.
 */
export function createStudioBg3dThreeWebGpuCaptureAdapter(
  input: CreateStudioBg3dThreeWebGpuCaptureAdapterInput,
): StudioBg3dCaptureAdapter {
  const { renderer, scene, camera } = input;
  const isWebgpuRenderer =
    (renderer as WebGPURenderer & { readonly isWebGPURenderer?: boolean } | null)
      ?.isWebGPURenderer === true;
  if (!isWebgpuRenderer || !scene?.isScene || !camera?.isCamera) {
    throw new TypeError("Three WebGPU capture requires a renderer, scene, and camera.");
  }

  const shared = retainCapturePool(renderer);
  let disposed = false;

  async function capture(request: StudioBg3dCaptureRequest): Promise<StudioBg3dCapturedRaster> {
    if (disposed) throw new Error("3D capture adapter is disposed.");
    assertStudioBg3dCaptureRequest(request);
    const snapshot = { ...request, background: { ...request.background } };
    const key = `${snapshot.width}:${snapshot.height}:${snapshot.includeDepth}:${snapshot.includeNormals === true}:${renderer.toneMapping}`;
    const lease = shared.pool.acquire(key, captureResourceBytes(snapshot),
      () => createCaptureResources(snapshot, renderer.toneMapping));
    let success = false;
    const pending: Promise<Uint8ClampedArray | GeometryCapture>[] = [];
    let submissionFailed = false;
    let submissionError: unknown;
    try {
      const restoreCaptureExcludedObjects = hideStudioBg3dCaptureExcludedObjects(scene);
      try {
        pending.push(submitColorCapture({ camera, renderer, request: snapshot, scene, resources: lease.value }));
        if (snapshot.includeDepth) {
          pending.push(submitDepthCapture({ camera, renderer, scene, width: snapshot.width,
            height: snapshot.height, resources: lease.value }));
        }
      } catch (error) {
        submissionFailed = true;
        submissionError = error;
      } finally {
        restoreCaptureExcludedObjects();
      }
      // Observe every submitted copy even when a later pass throws synchronously. A failed pass
      // must never leave an unhandled rejection or let a target be reused before its GPU fence.
      const results = await Promise.allSettled(pending);
      if (submissionFailed) throw submissionError;
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
      if (disposed || shared.pool.snapshot().closed) throw new Error("3D capture owner was disposed.");
      const rgba = results[0];
      const depth = results[1];
      if (rgba?.status !== "fulfilled" || !(rgba.value instanceof Uint8ClampedArray)) {
        throw new TypeError("3D capture did not produce RGBA pixels.");
      }
      success = true;
      return { width: snapshot.width, height: snapshot.height, rgba: rgba.value,
        ...(depth?.status === "fulfilled" ? depth.value as GeometryCapture : {}) };
    } finally {
      lease.release(!success);
      retireCapturePoolIfUnused(renderer, shared);
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    releaseCapturePool(renderer, shared);
  }

  return Object.freeze({
    backend: "three-webgpu" as const,
    engineId: "three" as const,
    engineVersion: String(THREE.REVISION).toLowerCase(),
    implementationRevision: STUDIO_BG3D_THREE_WEBGPU_CAPTURE_IMPLEMENTATION_V3,
    normalProfile: STUDIO_BG3D_CAPTURE_NORMAL_PROFILE_V1,
    graphicsApi: "webgpu" as const,
    profileId: STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
    getSourceSize: () => ({
      width: renderer.domElement.width,
      height: renderer.domElement.height,
    }),
    capture,
    dispose,
  });
}
