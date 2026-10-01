/**
 * 멀티패스 캡처·썸네일: 요청 해상도 전용 RenderTargetTexture(RGBA8, mip 없음, flat/lit는 MSAA)에 패스별 재질을
 * `setMaterialForRendering`으로 바꿔 끼워 그린 뒤 `readPixels` → export/raster-convert로 top-down straight sRGB 규약으로
 * 바꾼다(backend별 flipY/premultiplied 상수는 readback.ts). readback이 null인 레인(NullEngine)은 파츠 AABB를 투영한
 * 합성 래스터로 대체하고 provenance.synthetic=true를 표시한다. swap chain은 읽지 않는다.
 *
 * 패스: flat=밑색(clFlat) · lit=현재 재질(PBR/툰) · normal=clNormal · depth=clDepth(RGBA8 패킹 24+8bit, decodeDepth rgba-packed)
 *       · part-id/material-id=clId(R=partId&255, G=partId>>8, B=materialId, A=255).
 *
 * 일시 적용(`around`): 썸네일처럼 주 리그에 플랜을 잠깐 적용해 그릴 때, 셰이더 컴파일 대기(비동기)는 적용 **전에** 끝내고
 * "적용 → 프레이밍 → RTT 렌더 → readPixels 호출 → 복원"을 한 번의 동기 구간으로 묶는다. GPU readback 대기(비동기) 동안
 * 뷰포트 프레임이 썸네일 플랜을 그리지 않도록 하기 위해서다(깜빡임 방지). 복원은 `readPixels()` 호출 직후이므로 렌더 명령은
 * 이미 제출된 뒤다(WebGL·WebGPU 모두 제출 순서대로 실행).
 */
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";

import { CAPTURE_PROFILE_ID, estimateCaptureBytes, failVisible } from "../../contracts";
import { decodeDepth, toCapturedRaster } from "../../export/raster-convert";
import { hexToSrgb01 } from "../../shared/color";
import { DEPTH_CLEAR_RGBA01, RTT_READBACK_FLIP_Y, RTT_READBACK_PREMULTIPLIED, rasterizeSyntheticDepth, rasterizeSyntheticPass } from "../readback";
import { projectAabb } from "../synthetic-projection";

import { computeRigBounds, rigVisibleMeshes } from "./character-rig";
import { fromVector3 } from "./convert";

import type { CameraFraming, CaptureProvenance, CaptureRequest, CaptureResult, CapturedDepth, CapturedRaster, RasterPassId, RenderPassId } from "../../contracts";
import type { ReadbackLane, SyntheticBox } from "../readback";
import type { CharacterRig, RigPart } from "./character-rig";
import type { CharacterScene } from "./scene-builder";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** 캡처 readback 메모리 상한(모든 패스 합계) */
export const CAPTURE_BYTE_BUDGET = 256 * 1024 * 1024;
/** 셰이더 컴파일 대기 상한 */
export const CAPTURE_COMPILE_TIMEOUT_MS = 8_000;

export interface PassMaterialSet {
  flat(part: RigPart): ShaderMaterial;
  id(part: RigPart): ShaderMaterial;
  normal(): ShaderMaterial;
  depth(near: number, far: number): ShaderMaterial;
}

export interface CaptureDeps {
  readonly scene: Scene;
  readonly character: CharacterScene;
  readonly lane: ReadbackLane;
  readonly rig: CharacterRig;
  readonly passMaterials: PassMaterialSet;
  readonly shadow: ShadowGenerator | null;
  /** toon·hull일 때 outline 셸 포함 */
  readonly includeOutlines: boolean;
  /** 패스 셰이더 컴파일 완료를 기다릴지(GPU 레인 true, NullEngine은 컴파일하지 않으므로 false) */
  readonly waitForShaders: boolean;
  readonly provenance: Omit<CaptureProvenance, "synthetic" | "backend">;
  readonly now: number;
}

function validateRequest(deps: CaptureDeps, width: number, height: number, passes: readonly RenderPassId[]): void {
  const maxSize = deps.scene.getEngine().getCaps().maxTextureSize;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw failVisible("capture-size-invalid", `캡처 크기는 1 이상 정수여야 합니다(${width}×${height}).`, undefined, deps.now);
  }
  if (width > maxSize || height > maxSize) {
    throw failVisible("capture-size-exceeds-texture", `캡처 크기 ${width}×${height}가 엔진 최대 텍스처 ${maxSize}px를 넘습니다.`, undefined, deps.now);
  }
  const bytes = estimateCaptureBytes({ width, height, passes });
  if (bytes > CAPTURE_BYTE_BUDGET) {
    throw failVisible("capture-too-large", `캡처 readback ${Math.round(bytes / 1048576)}MiB가 예산 ${CAPTURE_BYTE_BUDGET / 1048576}MiB를 넘습니다. 해상도나 패스 수를 줄이세요.`, undefined, deps.now);
  }
}

async function ensureReady(deps: CaptureDeps, pairs: ReadonlyArray<readonly [Mesh, Material]>): Promise<void> {
  if (!deps.waitForShaders) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(failVisible("capture-shader-timeout", `캡처 셰이더 컴파일이 ${CAPTURE_COMPILE_TIMEOUT_MS}ms 안에 끝나지 않았습니다.`, undefined, deps.now)), CAPTURE_COMPILE_TIMEOUT_MS);
  });
  try {
    await Promise.race([Promise.all(pairs.map(([mesh, material]) => material.forceCompilationAsync(mesh))), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function syntheticBoxes(deps: CaptureDeps, camera: ArcRotateCamera, width: number, height: number): SyntheticBox[] {
  const view = camera.getViewMatrix(true).m;
  const projection = camera.getProjectionMatrix(true).m;
  const boxes: SyntheticBox[] = [];
  for (const part of deps.rig.parts) {
    if (!part.visible || part.forceHidden) continue;
    const srgb = hexToSrgb01(part.colorHex) ?? [0.5, 0.5, 0.5];
    const color: readonly [number, number, number] = [Math.round(srgb[0] * 255), Math.round(srgb[1] * 255), Math.round(srgb[2] * 255)];
    for (const mesh of part.meshes) {
      if (mesh.getTotalVertices() === 0) continue;
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      const projected = projectAabb(fromVector3(box.minimumWorld), fromVector3(box.maximumWorld), view, projection, width, height, camera.minZ, camera.maxZ);
      if (!projected) continue;
      boxes.push({ partId: part.partId, materialId: part.materialId, ...projected, color, normal: [0, 0, 1] });
    }
  }
  return boxes;
}

/** 이 패스가 메시에 쓰는 재질(패스 재질 또는 현재 재질) */
function passMaterialFor(deps: CaptureDeps, camera: ArcRotateCamera, pass: RenderPassId, part: RigPart | undefined, mesh: Mesh): Material | null {
  let material: Material | null = null;
  if (pass === "flat" && part) material = deps.passMaterials.flat(part);
  else if ((pass === "part-id" || pass === "material-id") && part) material = deps.passMaterials.id(part);
  else if (pass === "normal") material = deps.passMaterials.normal();
  else if (pass === "depth") material = deps.passMaterials.depth(camera.minZ, camera.maxZ);
  return material ?? mesh.material;
}

function partOfMesh(deps: CaptureDeps, mesh: Mesh): RigPart | undefined {
  return deps.rig.parts.find((candidate) => candidate.meshes.includes(mesh) || candidate.outlineMeshes.includes(mesh));
}

/** 캡처 한 패스가 만든 결과(readback이 없으면 합성 상자 스냅샷) */
interface PassRenderResult {
  readonly bytes: Uint8Array | Uint8ClampedArray | null;
  /** readback이 없을 때(NullEngine) 일시 적용 구간 안에서 만든 합성 상자 */
  readonly boxes: SyntheticBox[] | null;
}

/** 일시 적용 구간(썸네일): before는 렌더 직전, after는 readPixels 호출 직후에 동기 호출된다. */
export interface CaptureAround {
  before(): void;
  after(): void;
}

async function renderPass(deps: CaptureDeps, camera: ArcRotateCamera, pass: RenderPassId, width: number, height: number, frame: () => readonly Mesh[], around: CaptureAround | undefined): Promise<PassRenderResult> {
  const multisample = pass === "flat" || pass === "lit";
  const rtt = new RenderTargetTexture(`capture-${pass}`, { width, height }, deps.scene, {
    generateMipMaps: false,
    type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
    format: Constants.TEXTUREFORMAT_RGBA,
    samplingMode: Constants.TEXTURE_NEAREST_SAMPLINGMODE,
    generateDepthBuffer: true,
    generateStencilBuffer: false,
  });
  let meshes: readonly Mesh[] = [];
  try {
    if (multisample) rtt.samples = Math.max(1, Math.min(4, deps.scene.getEngine().getCaps().maxMSAASamples || 1));
    rtt.activeCamera = camera;
    rtt.ignoreCameraViewport = true;
    rtt.clearColor = pass === "depth" ? new Color4(...DEPTH_CLEAR_RGBA01) : new Color4(0, 0, 0, 0);

    // (1) 비동기 구간: 셰이더 컴파일 대기. 일시 적용 전 상태로 컴파일한다(플랜이 바꾸는 재질 변종은 첫 드로에서 동기 컴파일).
    const compilePairs: Array<readonly [Mesh, Material]> = [];
    for (const part of deps.rig.parts) {
      if (part.forceHidden) continue;
      for (const mesh of [...part.meshes, ...(deps.includeOutlines ? part.outlineMeshes : [])]) {
        const material = passMaterialFor(deps, camera, pass, part, mesh);
        if (material) compilePairs.push([mesh, material]);
      }
    }
    await ensureReady(deps, compilePairs);

    // (2) 동기 구간: 일시 적용 → 프레이밍·렌더 목록 → 렌더 → readPixels 호출 → 복원
    around?.before();
    let pending: ReturnType<RenderTargetTexture["readPixels"]> = null;
    let boxes: SyntheticBox[] | null = null;
    try {
      meshes = frame();
      rtt.renderList = [...meshes];
      for (const mesh of meshes) {
        const material = passMaterialFor(deps, camera, pass, partOfMesh(deps, mesh), mesh);
        if (material && material !== mesh.material) rtt.setMaterialForRendering(mesh, material);
      }
      if (pass === "lit" && deps.shadow) {
        try {
          deps.shadow.getShadowMap()?.render(false, false);
        } catch {
          // 그림자 맵 갱신 실패는 lit 캡처를 막지 않는다(이전 프레임 그림자 사용).
        }
      }
      rtt.render(false, false);
      pending = rtt.readPixels();
      if (pending === null) boxes = syntheticBoxes(deps, camera, width, height);
    } finally {
      around?.after();
    }

    // (3) 비동기 구간: GPU readback 대기(이 동안 뷰포트는 복원된 상태를 그린다)
    const buffer = pending ? await pending : null;
    if (buffer === null) return { bytes: null, boxes };
    if (buffer instanceof Uint8Array || buffer instanceof Uint8ClampedArray) return { bytes: buffer, boxes: null };
    throw failVisible("capture-readback-type", `RTT readback 타입이 RGBA8이 아닙니다(${buffer.constructor.name}).`, undefined, deps.now);
  } finally {
    for (const mesh of meshes) rtt.setMaterialForRendering(mesh, undefined);
    rtt.dispose();
  }
}

export interface CaptureFrameOptions {
  readonly width: number;
  readonly height: number;
  readonly passes: readonly RenderPassId[];
  readonly framing: CameraFraming;
  /** 일시 적용 구간(단일 패스 전용: 썸네일). 주면 passes는 정확히 1개여야 한다. */
  readonly around?: CaptureAround;
}

export interface CaptureFrameResult {
  readonly passes: Partial<Record<RasterPassId, CapturedRaster>>;
  readonly depth?: CapturedDepth;
  readonly synthetic: boolean;
}

/** 패스 집합을 한 번에 그려 규약 래스터로 돌려준다(엔진 renderPasses·renderThumbnail 공용). */
export async function captureFrame(deps: CaptureDeps, options: CaptureFrameOptions): Promise<CaptureFrameResult> {
  const { width, height } = options;
  validateRequest(deps, width, height, options.passes);
  if (options.around && options.passes.length !== 1) {
    throw failVisible("capture-around-single-pass", "일시 적용 구간은 단일 패스 캡처에서만 쓸 수 있습니다.", undefined, deps.now);
  }
  const camera = deps.character.captureCamera;
  /** 프레이밍은 렌더 직전(일시 적용 뒤)에 계산한다: 플랜의 가시성·포즈가 bounds에 반영되도록. */
  const frame = (): readonly Mesh[] => {
    deps.character.applyFraming(camera, options.framing, computeRigBounds(deps.rig), width / height);
    camera.getViewMatrix(true);
    camera.getProjectionMatrix(true);
    return rigVisibleMeshes(deps.rig, { includeOutlines: deps.includeOutlines });
  };
  const passes: Partial<Record<RasterPassId, CapturedRaster>> = {};
  let depth: CapturedDepth | undefined;
  let synthetic = false;
  let lateBoxes: SyntheticBox[] | null = null;
  const flipY = RTT_READBACK_FLIP_Y[deps.lane];
  const premultiplied = RTT_READBACK_PREMULTIPLIED[deps.lane];
  for (const pass of options.passes) {
    const rendered = await renderPass(deps, camera, pass, width, height, frame, options.around);
    if (rendered.bytes === null) {
      synthetic = true;
      // 일시 적용 구간 안에서 만든 상자가 있으면 그것을, 없으면(비동기 readback이 뒤늦게 null) 현재 상태로 만든다.
      const boxes = rendered.boxes ?? (lateBoxes ??= syntheticBoxes(deps, camera, width, height));
      if (pass === "depth") depth = rasterizeSyntheticDepth(width, height, boxes, camera.minZ, camera.maxZ);
      else passes[pass] = rasterizeSyntheticPass(pass, width, height, boxes);
      continue;
    }
    if (pass === "depth") {
      depth = decodeDepth(rendered.bytes, width, height, { near: camera.minZ, far: camera.maxZ, flipY, encoding: "rgba-packed" });
    } else {
      // ID·법선 패스는 알파 255 상수라 premultiply 영향이 없고, flat/lit만 투명 clear와 블렌딩 영향을 받는다.
      passes[pass] = toCapturedRaster(rendered.bytes, width, height, { flipY, premultiplied: premultiplied && (pass === "flat" || pass === "lit") });
    }
  }
  return depth ? { passes, depth, synthetic } : { passes, synthetic };
}

export async function capturePasses(deps: CaptureDeps, req: CaptureRequest, framing: CameraFraming): Promise<CaptureResult> {
  const frame = await captureFrame(deps, { width: req.width, height: req.height, passes: req.passes, framing });
  const backend: CaptureProvenance["backend"] = deps.lane;
  return {
    profile: CAPTURE_PROFILE_ID,
    width: req.width,
    height: req.height,
    passes: frame.passes,
    ...(frame.depth ? { depth: frame.depth } : {}),
    partIdPalette: deps.rig.partIdPalette,
    provenance: { ...deps.provenance, backend, synthetic: frame.synthetic, settleSteps: req.settleSteps },
  };
}

export async function captureThumbnail(deps: CaptureDeps, size: number, framing: CameraFraming, around?: CaptureAround): Promise<CapturedRaster> {
  const frame = await captureFrame(deps, { width: size, height: size, passes: ["lit"], framing, ...(around ? { around } : {}) });
  const raster = frame.passes.lit;
  if (!raster) throw failVisible("thumbnail-no-raster", "썸네일 lit 패스가 결과를 돌려주지 않았습니다.", undefined, deps.now);
  return raster;
}
