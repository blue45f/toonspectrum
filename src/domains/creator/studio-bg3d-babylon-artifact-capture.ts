/**
 * Babylon implementation of the renderer-neutral Studio BG3D capture boundary.
 *
 * This module is reachable only from `studio-bg3d-babylon-specialist-entry.ts`, which is itself
 * loaded by one explicit dynamic import. Keep every Babylon import inside that static closure.
 */

import { Camera } from "@babylonjs/core/Cameras/camera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Constants } from "@babylonjs/core/Engines/constants";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import {
  ImportMeshAsync,
  RegisterSceneLoaderPlugin,
} from "@babylonjs/core/Loading/sceneLoader";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import { registerBuiltInGLTFExtensions } from "@babylonjs/loaders/glTF/2.0/Extensions/dynamic";
import { RegisterGLTF2Loader } from "@babylonjs/loaders/glTF/2.0/glTFLoader.pure";
import {
  GLTFFileLoader,
  GLTFLoaderAnimationStartMode,
} from "@babylonjs/loaders/glTF/glTFFileLoader.pure";

import {
  STUDIO_BG3D_ARTIFACT_CAPTURE_KIND,
  STUDIO_BG3D_ARTIFACT_CAPTURE_PROFILE,
  STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
  STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
  STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
  type StudioBg3dArtifactCaptureResultV2,
} from "./studio-bg3d-artifact-capture-v2";
import {
  StudioBg3dBabylonSpecialistError,
  type StudioBg3dBabylonSpecialistExecutionContext,
  type StudioBg3dBabylonSpecialistExecutor,
} from "./studio-bg3d-babylon-specialist-runtime";
import { resolveStudioBg3dCameraNearClip, resolveStudioBg3dCameraUpVector } from
  "./studio-bg3d-camera-orientation";
import { parseStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

import type {
  StudioBg3dRuntimeAdapterJob,
  StudioBg3dSpecialistResult,
} from "./studio-bg3d-runtime-adapter";
import type {
  StudioBg3dMaterialOverride,
  StudioBg3dModelNode,
  StudioBg3dPrimitiveKind,
  StudioBg3dSceneDocument,
  StudioBg3dSceneNode,
} from "./studio-bg3d-scene-document";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Node } from "@babylonjs/core/node";
import type { DepthRenderer } from "@babylonjs/core/Rendering/depthRenderer";
import type { Scene } from "@babylonjs/core/scene";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const MAX_GLB_JSON_BYTES = 4 * 1024 * 1024;
const MAX_CAPTURE_WAIT_MS = 60_000;
const CAMERA_FAR_CLIP = 200;
const MODEL_AUTO_FIT_SIZE = 2;
const FLOAT_TOLERANCE = 1e-5;

const UNSUPPORTED_DECODER_EXTENSIONS = new Set([
  "EXT_meshopt_compression",
  "KHR_draco_mesh_compression",
  "KHR_texture_basisu",
]);
const BUDGET_STABLE_CAPTURE_EXTENSIONS = new Set([
  "KHR_lights_punctual",
  "KHR_materials_clearcoat",
  "KHR_materials_emissive_strength",
  "KHR_materials_ior",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_unlit",
  "KHR_materials_volume",
]);

/**
 * Registration is intentionally explicit. The specialist accepts only GLB and never installs the
 * OBJ/STL/SPLAT loaders or Babylon's catch-all loader bundle.
 */
RegisterSceneLoaderPlugin(new GLTFFileLoader({
  animationStartMode: GLTFLoaderAnimationStartMode.NONE,
  compileMaterials: true,
  compileShadowGenerators: false,
}));
RegisterGLTF2Loader();
registerBuiltInGLTFExtensions();

export type StudioBg3dBabylonCaptureErrorCode =
  | "aborted"
  | "asset-mismatch"
  | "capture-failed"
  | "invalid-snapshot"
  | "renderer-unavailable"
  | "resource-budget-exceeded"
  | "timeout"
  | "unsafe-glb"
  | "unsupported-artifact"
  | "unsupported-scene-feature";

export class StudioBg3dBabylonCaptureError extends Error {
  constructor(
    readonly code: StudioBg3dBabylonCaptureErrorCode,
    cause?: unknown,
  ) {
    super(`Studio Babylon capture failed: ${code}`, cause === undefined ? undefined : { cause });
    this.name = "StudioBg3dBabylonCaptureError";
  }
}

interface StudioBg3dBabylonCaptureAsset {
  readonly attachmentId: string;
  readonly bytes: Uint8Array;
  readonly glbJson: Record<string, unknown>;
}

export interface StudioBg3dBabylonCapturePlan {
  readonly assets: readonly StudioBg3dBabylonCaptureAsset[];
  readonly backend: StudioBg3dBabylonSpecialistExecutionContext["backend"];
  readonly document: StudioBg3dSceneDocument;
  readonly height: number;
  readonly includeDepth: boolean;
  readonly width: number;
}

export interface StudioBg3dBabylonCaptureFrame {
  /** Straight-alpha sRGB RGBA8 in top-down row order. */
  readonly rgba: Uint8Array;
  /** Linear normalized view depth in top-down row order. */
  readonly depth?: Float32Array;
}

export type StudioBg3dBabylonCaptureRenderer = (
  context: StudioBg3dBabylonSpecialistExecutionContext,
  plan: StudioBg3dBabylonCapturePlan,
) => Promise<StudioBg3dBabylonCaptureFrame>;

interface RequestedCapture {
  readonly format: "artifact-v2" | "capture";
  readonly height: number;
  readonly includeBeauty: boolean;
  readonly includeDepth: boolean;
  readonly width: number;
}

function captureError(
  code: StudioBg3dBabylonCaptureErrorCode,
  cause?: unknown,
): StudioBg3dBabylonCaptureError {
  return new StudioBg3dBabylonCaptureError(code, cause);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw captureError("aborted");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readGlbJson(bytes: Uint8Array): Record<string, unknown> {
  if (
    bytes.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES ||
    bytes.byteOffset !== 0 ||
    bytes.buffer.byteLength !== bytes.byteLength
  ) {
    throw captureError("unsafe-glb");
  }
  const view = new DataView(bytes.buffer);
  if (
    view.getUint32(0, true) !== GLB_MAGIC ||
    view.getUint32(4, true) !== GLB_VERSION ||
    view.getUint32(8, true) !== bytes.byteLength
  ) {
    throw captureError("unsafe-glb");
  }
  const jsonByteLength = view.getUint32(GLB_HEADER_BYTES, true);
  const chunkType = view.getUint32(GLB_HEADER_BYTES + 4, true);
  if (
    chunkType !== GLB_JSON_CHUNK ||
    jsonByteLength < 2 ||
    jsonByteLength > MAX_GLB_JSON_BYTES ||
    GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + jsonByteLength > bytes.byteLength
  ) {
    throw captureError("unsafe-glb");
  }
  let decoded: unknown;
  try {
    const decodedJson = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes.subarray(
        GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES,
        GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + jsonByteLength,
      ));
    let jsonEnd = decodedJson.length;
    while (jsonEnd > 0 && decodedJson.charCodeAt(jsonEnd - 1) === 0) jsonEnd -= 1;
    const json = decodedJson.slice(0, jsonEnd).trimEnd();
    decoded = JSON.parse(json) as unknown;
  } catch (error) {
    throw captureError("unsafe-glb", error);
  }
  if (!isPlainRecord(decoded)) throw captureError("unsafe-glb");
  return decoded;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function containsNestedUri(value: unknown): boolean {
  const pending: unknown[] = [value];
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    visited += 1;
    if (visited > 200_000) throw captureError("resource-budget-exceeded");
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!isPlainRecord(current)) continue;
    for (const [key, nested] of Object.entries(current)) {
      if (key === "uri") return true;
      if (typeof nested === "object" && nested !== null) pending.push(nested);
    }
  }
  return false;
}

function assertOfflineCoreGlb(bytes: Uint8Array): Record<string, unknown> {
  const root = readGlbJson(bytes);
  const extensions = new Set([
    ...stringArray(root.extensionsUsed),
    ...stringArray(root.extensionsRequired),
  ]);
  if ([...extensions].some((extension) => UNSUPPORTED_DECODER_EXTENSIONS.has(extension))) {
    // Babylon decoder URLs/configuration are deliberately not allowed to escape the verified
    // snapshot boundary. Decoder-backed assets will be enabled only with locally attested bytes.
    throw captureError("unsupported-scene-feature");
  }
  if ([...extensions].some((extension) => !BUDGET_STABLE_CAPTURE_EXTENSIONS.has(extension))) {
    // Expansion/instancing/vendor extensions can make core-JSON budgets undercount the decoded
    // scene. Admit them only after Babylon post-parse metrics are part of the trusted receipt.
    throw captureError("unsupported-scene-feature");
  }
  if (containsNestedUri(root)) {
    // A verified GLB capture must be self-contained. This prevents an imported document from
    // initiating network/blob/file/data fetches from core fields or an extension payload.
    throw captureError("unsafe-glb");
  }
  if (recordArray(root.images).length > 0 || recordArray(root.textures).length > 0) {
    // Texture dimensions and decoded mip allocation are not represented in the current runtime
    // snapshot. Fail closed until those post-parse metrics are carried across the trust boundary.
    throw captureError("unsupported-scene-feature");
  }
  return root;
}

interface GlbBudgetFootprint {
  readonly accessorElements: number;
  readonly animationChannels: number;
  readonly animationKeyframes: number;
  readonly animationValues: number;
  readonly animations: number;
  readonly decodedGeometryBytes: number;
  readonly drawCalls: number;
  readonly joints: number;
  readonly lights: number;
  readonly materials: number;
  readonly morphTargets: number;
  readonly nodes: number;
  readonly skins: number;
  readonly textures: number;
  readonly triangles: number;
}

const GLTF_COMPONENT_BYTES: Readonly<Record<number, number>> = Object.freeze({
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
});

const GLTF_TYPE_COMPONENTS: Readonly<Record<string, number>> = Object.freeze({
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
});

function recordArray(value: unknown): readonly Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isPlainRecord)) {
    throw captureError("unsafe-glb");
  }
  return value;
}

function safeNonNegativeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw captureError("unsafe-glb");
  }
  return value;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw captureError("resource-budget-exceeded");
  }
  return result;
}

function safeMultiply(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw captureError("resource-budget-exceeded");
  }
  return result;
}

function accessorAt(
  accessors: readonly Record<string, unknown>[],
  index: unknown,
): Record<string, unknown> | null {
  return typeof index === "number" && Number.isSafeInteger(index) && index >= 0
    ? accessors[index] ?? null
    : null;
}

function accessorElementCount(
  accessors: readonly Record<string, unknown>[],
  index: unknown,
): number {
  const accessor = accessorAt(accessors, index);
  return accessor ? safeNonNegativeCount(accessor.count) : 0;
}

function primitiveTriangleCount(
  primitive: Record<string, unknown>,
  accessors: readonly Record<string, unknown>[],
): number {
  const attributes = isPlainRecord(primitive.attributes) ? primitive.attributes : {};
  const elementCount = "indices" in primitive
    ? accessorElementCount(accessors, primitive.indices)
    : accessorElementCount(accessors, attributes.POSITION);
  const mode = primitive.mode === undefined ? 4 : safeNonNegativeCount(primitive.mode);
  if (mode === 4) return Math.floor(elementCount / 3);
  if (mode === 5 || mode === 6) return Math.max(0, elementCount - 2);
  return 0;
}

function glbBudgetFootprint(root: Record<string, unknown>): GlbBudgetFootprint {
  const accessors = recordArray(root.accessors);
  let accessorElements = 0;
  let decodedGeometryBytes = 0;
  for (const accessor of accessors) {
    const count = safeNonNegativeCount(accessor.count);
    const componentBytes = typeof accessor.componentType === "number"
      ? GLTF_COMPONENT_BYTES[accessor.componentType]
      : undefined;
    const typeComponents = typeof accessor.type === "string"
      ? GLTF_TYPE_COMPONENTS[accessor.type]
      : undefined;
    if (!componentBytes || !typeComponents) throw captureError("unsafe-glb");
    accessorElements = safeAdd(accessorElements, count);
    decodedGeometryBytes = safeAdd(
      decodedGeometryBytes,
      safeMultiply(count, safeMultiply(componentBytes, typeComponents)),
    );
  }

  let triangles = 0;
  let drawCalls = 0;
  let morphTargets = 0;
  for (const mesh of recordArray(root.meshes)) {
    for (const primitive of recordArray(mesh.primitives)) {
      triangles = safeAdd(triangles, primitiveTriangleCount(primitive, accessors));
      drawCalls = safeAdd(drawCalls, 1);
      morphTargets = safeAdd(morphTargets, recordArray(primitive.targets).length);
    }
  }

  let animationChannels = 0;
  let animationKeyframes = 0;
  let animationValues = 0;
  const animations = recordArray(root.animations);
  for (const animation of animations) {
    const samplers = recordArray(animation.samplers);
    animationChannels = safeAdd(animationChannels, recordArray(animation.channels).length);
    for (const sampler of samplers) {
      animationKeyframes = safeAdd(
        animationKeyframes,
        accessorElementCount(accessors, sampler.input),
      );
      const output = accessorAt(accessors, sampler.output);
      if (!output) continue;
      const outputCount = safeNonNegativeCount(output.count);
      const components = typeof output.type === "string"
        ? GLTF_TYPE_COMPONENTS[output.type]
        : undefined;
      if (!components) throw captureError("unsafe-glb");
      animationValues = safeAdd(animationValues, safeMultiply(outputCount, components));
    }
  }

  let joints = 0;
  const skins = recordArray(root.skins);
  for (const skin of skins) {
    if (!Array.isArray(skin.joints)) throw captureError("unsafe-glb");
    joints = safeAdd(joints, skin.joints.length);
  }
  const punctualLights = isPlainRecord(root.extensions) &&
    isPlainRecord(root.extensions.KHR_lights_punctual)
    ? recordArray(root.extensions.KHR_lights_punctual.lights).length
    : 0;

  return Object.freeze({
    accessorElements,
    animationChannels,
    animationKeyframes,
    animationValues,
    animations: animations.length,
    decodedGeometryBytes,
    drawCalls,
    joints,
    lights: punctualLights,
    materials: recordArray(root.materials).length,
    morphTargets,
    nodes: recordArray(root.nodes).length,
    skins: skins.length,
    textures: recordArray(root.textures).length,
    triangles,
  });
}

function assertPreParseBudgets(
  document: StudioBg3dSceneDocument,
  assets: readonly StudioBg3dBabylonCaptureAsset[],
): void {
  const assetById = new Map(assets.map((asset) => [asset.attachmentId, asset]));
  const totals: Record<keyof GlbBudgetFootprint, number> = {
    accessorElements: 0,
    animationChannels: 0,
    animationKeyframes: 0,
    animationValues: 0,
    animations: 0,
    decodedGeometryBytes: 0,
    drawCalls: 0,
    joints: 0,
    lights: 0,
    materials: 0,
    morphTargets: 0,
    nodes: 0,
    skins: 0,
    textures: 0,
    triangles: 0,
  };
  const footprintByAsset = new Map<string, GlbBudgetFootprint>();
  for (const node of document.nodes) {
    if (node.kind !== "model") continue;
    const asset = assetById.get(node.attachmentId);
    if (!asset) throw captureError("asset-mismatch");
    let footprint = footprintByAsset.get(asset.attachmentId);
    if (!footprint) {
      footprint = glbBudgetFootprint(asset.glbJson);
      footprintByAsset.set(asset.attachmentId, footprint);
    }
    for (const key of Object.keys(totals) as (keyof GlbBudgetFootprint)[]) {
      totals[key] = safeAdd(totals[key], footprint[key]);
    }
  }
  const complexity = document.budgets.complexity;
  const textures = document.budgets.textures;
  if (
    totals.nodes > complexity.maxNodes ||
    totals.triangles > complexity.maxTriangles ||
    totals.drawCalls > complexity.maxDrawCalls ||
    totals.materials > complexity.maxMaterials ||
    totals.lights > complexity.maxLights ||
    totals.animations > complexity.maxAnimations ||
    totals.animationChannels > complexity.maxAnimationChannels ||
    totals.animationKeyframes > complexity.maxAnimationKeyframes ||
    totals.animationValues > complexity.maxAnimationValues ||
    totals.skins > complexity.maxSkins ||
    totals.joints > complexity.maxJoints ||
    totals.morphTargets > complexity.maxMorphTargets ||
    totals.accessorElements > complexity.maxAccessorElements ||
    totals.decodedGeometryBytes > complexity.maxDecodedGeometryBytes ||
    totals.textures > textures.maxTextures
  ) {
    throw captureError("resource-budget-exceeded");
  }
}

function hasUnsupportedRigState(node: StudioBg3dModelNode): boolean {
  const animation = node.animation;
  if (
    animation &&
    (
      animation.playing ||
      animation.timeSeconds !== 0 ||
      animation.timeScale !== 1 ||
      animation.weight !== 1 ||
      animation.loop !== "repeat" ||
      animation.clipIndex !== 0
    )
  ) {
    return true;
  }
  return Boolean(
    (node.pose?.enabled && node.pose.weight > 0 && node.pose.joints.length > 0) ||
    (node.morph?.enabled && node.morph.weight > 0 && node.morph.targets.length > 0) ||
    (
      node.constraints?.enabled &&
      (node.constraints.aims.length > 0 || node.constraints.twoBoneIks.length > 0)
    ),
  );
}

function assertSupportedDocument(document: StudioBg3dSceneDocument): void {
  const lensShift = document.camera.lensShift;
  if (
    document.camera.projection === "orthographic" ||
    (lensShift && (lensShift[0] !== 0 || lensShift[1] !== 0)) ||
    (document.background.mode === "sky-preset" && document.background.skyPresetId !== "blank") ||
    document.nodes.some((node) => node.kind === "model" && hasUnsupportedRigState(node))
  ) {
    // Fail closed instead of emitting a plausible-looking raster that disagrees with Three's
    // canonical camera, procedural panorama, animation, morph, or rig result.
    throw captureError("unsupported-scene-feature");
  }
}

function admitCaptureAssets(
  job: StudioBg3dRuntimeAdapterJob,
  document: StudioBg3dSceneDocument,
): readonly StudioBg3dBabylonCaptureAsset[] {
  if (job.snapshot.assets.length !== document.attachments.length) {
    throw captureError("asset-mismatch");
  }
  const attachmentById = new Map(document.attachments.map((attachment) => [
    attachment.id,
    attachment,
  ]));
  const admitted = new Map<string, StudioBg3dBabylonCaptureAsset>();
  for (const asset of job.snapshot.assets) {
    const attachment = attachmentById.get(asset.attachmentId);
    if (
      !attachment ||
      admitted.has(asset.attachmentId) ||
      asset.hash !== attachment.hash ||
      asset.byteSize !== attachment.byteSize
    ) {
      throw captureError("asset-mismatch");
    }
    const bytes = asset.readVerifiedBytes();
    if (
      !(bytes instanceof Uint8Array) ||
      Object.getPrototypeOf(bytes) !== Uint8Array.prototype ||
      bytes.byteLength !== asset.byteSize
    ) {
      throw captureError("asset-mismatch");
    }
    const ownedBytes = Uint8Array.from(bytes);
    const glbJson = assertOfflineCoreGlb(ownedBytes);
    admitted.set(asset.attachmentId, Object.freeze({
      attachmentId: asset.attachmentId,
      bytes: ownedBytes,
      glbJson,
    }));
  }
  if (
    admitted.size !== attachmentById.size ||
    document.nodes.some((node) =>
      node.kind === "model" && !admitted.has(node.attachmentId)
    )
  ) {
    throw captureError("asset-mismatch");
  }

  const repeatedModelBytes = document.nodes.reduce((total, node) => {
    if (node.kind !== "model") return total;
    return total + (attachmentById.get(node.attachmentId)?.byteSize ?? Number.POSITIVE_INFINITY);
  }, 0);
  if (
    !Number.isSafeInteger(repeatedModelBytes) ||
    repeatedModelBytes > document.budgets.complexity.maxModelBytes
  ) {
    // This first production path imports one isolated model graph per placed instance to keep
    // skins/materials deterministic. Bound the decoded pressure conservatively before parsing.
    throw captureError("resource-budget-exceeded");
  }
  return Object.freeze([...admitted.values()]);
}

function resolveCaptureRequest(
  job: StudioBg3dRuntimeAdapterJob,
): RequestedCapture | null {
  const request = job.request;
  if (request.kind === "capture") {
    return {
      format: "capture",
      width: request.width,
      height: request.height,
      includeBeauty: true,
      includeDepth: true,
    };
  }
  if (request.kind === "webtoon-fx-capture") {
    if (request.effects.length > 0) throw captureError("unsupported-scene-feature");
    return {
      format: "capture",
      width: request.width,
      height: request.height,
      includeBeauty: true,
      includeDepth: request.includeDepth,
    };
  }
  if (request.kind !== "artifact-capture-v2") return null;
  const kinds = request.artifacts.map((artifact) => artifact.kind);
  if (kinds.some((kind) => kind !== "beauty" && kind !== "depth")) {
    throw captureError("unsupported-artifact");
  }
  return {
    format: "artifact-v2",
    width: request.width,
    height: request.height,
    includeBeauty: kinds.includes("beauty"),
    includeDepth: kinds.includes("depth"),
  };
}

function validateFrame(
  frame: StudioBg3dBabylonCaptureFrame,
  request: RequestedCapture,
): StudioBg3dBabylonCaptureFrame {
  const pixels = request.width * request.height;
  if (
    !frame ||
    !(frame.rgba instanceof Uint8Array) ||
    frame.rgba.byteLength !== pixels * 4 ||
    (request.includeDepth &&
      (!(frame.depth instanceof Float32Array) || frame.depth.length !== pixels)) ||
    frame.depth?.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    throw captureError("capture-failed");
  }
  return {
    rgba: Uint8Array.from(frame.rgba),
    ...(frame.depth ? { depth: Float32Array.from(frame.depth) } : {}),
  };
}

function toArtifactResult(
  job: StudioBg3dRuntimeAdapterJob,
  request: RequestedCapture,
  frame: StudioBg3dBabylonCaptureFrame,
): StudioBg3dArtifactCaptureResultV2 {
  if (job.request.kind !== "artifact-capture-v2") {
    throw captureError("capture-failed");
  }
  const artifacts = job.request.artifacts.map((artifact) => {
    if (artifact.kind === "beauty") {
      return Object.freeze({
        kind: "beauty" as const,
        width: request.width,
        height: request.height,
        profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
        data: Uint8Array.from(frame.rgba),
      });
    }
    if (!frame.depth) throw captureError("capture-failed");
    return Object.freeze({
      kind: "depth" as const,
      width: request.width,
      height: request.height,
      profile: STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
      data: Float32Array.from(frame.depth),
    });
  });
  return Object.freeze({
    kind: STUDIO_BG3D_ARTIFACT_CAPTURE_KIND,
    version: STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
    profile: STUDIO_BG3D_ARTIFACT_CAPTURE_PROFILE,
    width: request.width,
    height: request.height,
    artifacts: Object.freeze(artifacts),
  });
}

function metricsResult(
  context: StudioBg3dBabylonSpecialistExecutionContext,
): StudioBg3dSpecialistResult {
  return {
    kind: "metrics",
    values: {
      backend: context.backend,
      engine: "babylon",
      epoch: context.epoch,
      initialized: true,
      capture: "beauty-depth-v1",
    },
  };
}

function createCapturePlan(
  context: StudioBg3dBabylonSpecialistExecutionContext,
  request: RequestedCapture,
): StudioBg3dBabylonCapturePlan {
  const document = parseStudioBg3dSceneDocument(context.job.snapshot.canonicalDocumentJson);
  if (!document) throw captureError("invalid-snapshot");
  assertSupportedDocument(document);
  const assets = admitCaptureAssets(context.job, document);
  assertPreParseBudgets(document, assets);
  return Object.freeze({
    assets,
    backend: context.backend,
    document,
    height: request.height,
    includeDepth: request.includeDepth,
    width: request.width,
  });
}

function withAbortAndDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      clearTimeout(timeout);
      callback();
    };
    const onAbort = () => finish(() => reject(captureError("aborted")));
    const timeout = setTimeout(
      () => finish(() => reject(captureError("timeout"))),
      MAX_CAPTURE_WAIT_MS,
    );
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function rgbaRowsTopDown(
  source: ArrayBufferView,
  width: number,
  height: number,
  flipY: boolean,
  swapRedBlue: boolean,
  unpremultiplyAlpha: boolean,
): Uint8Array {
  if (!(source instanceof Uint8Array) || source.byteLength !== width * height * 4) {
    throw captureError("capture-failed");
  }
  const output = new Uint8Array(source.byteLength);
  for (let y = 0; y < height; y += 1) {
    const sourceY = flipY ? height - 1 - y : y;
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (sourceY * width + x) * 4;
      const targetOffset = (y * width + x) * 4;
      let red = source[sourceOffset + (swapRedBlue ? 2 : 0)];
      const green = source[sourceOffset + 1];
      let blue = source[sourceOffset + (swapRedBlue ? 0 : 2)];
      const alpha = source[sourceOffset + 3];
      if (unpremultiplyAlpha) {
        if (alpha === 0) {
          red = 0;
          blue = 0;
          output[targetOffset + 1] = 0;
        } else if (alpha < 255) {
          red = Math.min(255, Math.round((red * 255) / alpha));
          blue = Math.min(255, Math.round((blue * 255) / alpha));
          output[targetOffset + 1] = Math.min(255, Math.round((green * 255) / alpha));
        } else {
          output[targetOffset + 1] = green;
        }
      } else {
        output[targetOffset + 1] = green;
      }
      output[targetOffset] = red;
      output[targetOffset + 2] = blue;
      output[targetOffset + 3] = alpha;
    }
  }
  return output;
}

function depthRowsTopDown(
  source: ArrayBufferView,
  width: number,
  height: number,
  flipY: boolean,
): Float32Array {
  const pixels = width * height;
  if (
    !(source instanceof Float32Array) ||
    (source.length !== pixels && source.length !== pixels * 4)
  ) {
    throw captureError("capture-failed");
  }
  const channels = source.length === pixels ? 1 : 4;
  const output = new Float32Array(pixels);
  for (let y = 0; y < height; y += 1) {
    const sourceY = flipY ? height - 1 - y : y;
    for (let x = 0; x < width; x += 1) {
      const sample = source[(sourceY * width + x) * channels];
      if (
        typeof sample !== "number" ||
        !Number.isFinite(sample) ||
        sample < -FLOAT_TOLERANCE ||
        sample > 1 + FLOAT_TOLERANCE
      ) {
        throw captureError("capture-failed");
      }
      output[y * width + x] = Math.min(1, Math.max(0, sample));
    }
  }
  return output;
}

function webGpuReadbackUsesBgra(
  engine: AbstractEngine,
  backend: StudioBg3dBabylonCapturePlan["backend"],
): boolean {
  const inspected = engine as AbstractEngine & {
    readonly _colorFormat?: unknown;
    readonly isWebGPU?: unknown;
    readonly webGLVersion?: unknown;
  };
  if (backend === "webgl2") {
    if (inspected.isWebGPU === true || inspected.webGLVersion !== 2) {
      throw captureError("renderer-unavailable");
    }
    return false;
  }
  if (inspected.isWebGPU !== true || typeof inspected._colorFormat !== "string") {
    throw captureError("renderer-unavailable");
  }
  if (inspected._colorFormat.startsWith("bgra8")) return true;
  if (inspected._colorFormat.startsWith("rgba8")) return false;
  throw captureError("renderer-unavailable");
}

function quaternionFromEulerXyz(rotation: readonly [number, number, number]): Quaternion {
  const [x, y, z] = rotation;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return new Quaternion(
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  );
}

function createFlatRing(name: string, scene: Scene): Mesh {
  const segments = 32;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    for (const radius of [0.2, 0.5]) {
      positions.push(cosine * radius, sine * radius, 0);
      normals.push(0, 0, 1);
      uvs.push(0.5 + cosine * radius, 0.5 + sine * radius);
    }
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const inner = segment * 2;
    const outer = inner + 1;
    indices.push(inner, outer, inner + 2, outer, outer + 2, inner + 2);
  }
  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, false);
  return mesh;
}

function createPrimitiveMesh(
  kind: StudioBg3dPrimitiveKind,
  name: string,
  scene: Scene,
): Mesh {
  switch (kind) {
    case "box":
      return MeshBuilder.CreateBox(name, { size: 1 }, scene);
    case "cylinder":
      return MeshBuilder.CreateCylinder(name, {
        diameter: 0.6,
        height: 1,
        tessellation: 16,
      }, scene);
    case "plane":
      return MeshBuilder.CreatePlane(name, { size: 1 }, scene);
    case "sphere":
      return MeshBuilder.CreateSphere(name, { diameter: 1, segments: 24 }, scene);
    case "hemisphere":
      return MeshBuilder.CreateSphere(name, {
        diameter: 1,
        segments: 24,
        slice: 0.5,
      }, scene);
    case "cone":
      return MeshBuilder.CreateCylinder(name, {
        diameterTop: 0,
        diameterBottom: 0.8,
        height: 1,
        tessellation: 24,
      }, scene);
    case "pyramid":
      return MeshBuilder.CreateCylinder(name, {
        diameterTop: 0,
        diameterBottom: 1,
        height: 1,
        tessellation: 4,
      }, scene);
    case "triangularPrism":
      return MeshBuilder.CreateCylinder(name, {
        diameter: 1,
        height: 1,
        tessellation: 3,
      }, scene);
    case "hexPrism":
      return MeshBuilder.CreateCylinder(name, {
        diameter: 1,
        height: 1,
        tessellation: 6,
      }, scene);
    case "torus":
      return MeshBuilder.CreateTorus(name, {
        diameter: 0.8,
        thickness: 0.3,
        tessellation: 24,
      }, scene);
    case "tube":
      return MeshBuilder.CreateCylinder(name, {
        diameter: 0.8,
        height: 1,
        tessellation: 24,
        cap: Mesh.NO_CAP,
      }, scene);
    case "ring":
      return createFlatRing(name, scene);
    case "capsule":
      return MeshBuilder.CreateCapsule(name, {
        radius: 0.3,
        height: 1.3,
        tessellation: 16,
        capSubdivisions: 8,
      }, scene);
  }
}

function applyNodeTransform(root: TransformNode, node: StudioBg3dSceneNode): void {
  root.position.copyFromFloats(...node.transform.position);
  root.rotationQuaternion = quaternionFromEulerXyz(node.transform.rotation);
  root.scaling.copyFromFloats(...node.transform.scale);
  root.setEnabled(node.visible);
}

function applyMaterialOverride(
  material: Material,
  override: StudioBg3dMaterialOverride,
): void {
  const target = Color3.FromHexString(override.color);
  const emissive = Color3.FromHexString(override.emissiveColor);
  if (material instanceof PBRMaterial) {
    if (override.colorMode === "replace") {
      material.albedoColor = Color3.Lerp(
        material.albedoColor,
        target,
        override.colorStrength,
      );
    } else if (override.colorMode === "multiply") {
      const multiplied = material.albedoColor.multiply(target);
      material.albedoColor = Color3.Lerp(
        material.albedoColor,
        multiplied,
        override.colorStrength,
      );
    }
    if (override.roughness !== null) material.roughness = override.roughness;
    if (override.metalness !== null) material.metallic = override.metalness;
    material.emissiveColor = emissive;
    if (override.emissiveIntensity !== null) {
      material.emissiveIntensity = override.emissiveIntensity;
    }
  } else if (material instanceof StandardMaterial) {
    if (override.colorMode === "replace") {
      material.diffuseColor = Color3.Lerp(
        material.diffuseColor,
        target,
        override.colorStrength,
      );
    } else if (override.colorMode === "multiply") {
      const multiplied = material.diffuseColor.multiply(target);
      material.diffuseColor = Color3.Lerp(
        material.diffuseColor,
        multiplied,
        override.colorStrength,
      );
    }
    material.emissiveColor = emissive.scale(override.emissiveIntensity ?? 1);
  }
  material.alpha *= override.opacityMultiplier;
  material.wireframe = override.wireframe;
  material.backFaceCulling = !override.doubleSided;
}

function createNodeRoots(
  document: StudioBg3dSceneDocument,
  scene: Scene,
): ReadonlyMap<string, TransformNode> {
  const roots = new Map<string, TransformNode>();
  for (const node of document.nodes) {
    const root = new TransformNode(`studio-node:${node.id}`, scene);
    applyNodeTransform(root, node);
    roots.set(node.id, root);
  }
  for (const node of document.nodes) {
    if (!node.parentId) continue;
    const root = roots.get(node.id);
    const parent = roots.get(node.parentId);
    if (!root || !parent) throw captureError("invalid-snapshot");
    root.parent = parent;
  }
  return roots;
}

function meshBounds(meshes: readonly AbstractMesh[]): {
  readonly maximum: Vector3;
  readonly minimum: Vector3;
} | null {
  const minimum = new Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  const maximum = new Vector3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  );
  let found = false;
  for (const mesh of meshes) {
    if (mesh.getTotalVertices() < 1) continue;
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    minimum.minimizeInPlace(bounds.minimumWorld);
    maximum.maximizeInPlace(bounds.maximumWorld);
    found = true;
  }
  return found ? { minimum, maximum } : null;
}

function modelAutoFitScale(meshes: readonly AbstractMesh[]): number {
  const bounds = meshBounds(meshes);
  if (!bounds) return 1;
  const size = bounds.maximum.subtract(bounds.minimum);
  const maximumDimension = Math.max(Math.abs(size.x), Math.abs(size.y), Math.abs(size.z));
  return Number.isFinite(maximumDimension) && maximumDimension > 0
    ? MODEL_AUTO_FIT_SIZE / maximumDimension
    : 1;
}

async function populateScene(
  context: StudioBg3dBabylonSpecialistExecutionContext,
  plan: StudioBg3dBabylonCapturePlan,
  scene: Scene,
): Promise<{
  readonly meshes: readonly AbstractMesh[];
  readonly shadowCasters: readonly AbstractMesh[];
}> {
  const rootById = createNodeRoots(plan.document, scene);
  const assetByAttachmentId = new Map(
    plan.assets.map((asset) => [asset.attachmentId, asset]),
  );
  const renderMeshes: AbstractMesh[] = [];
  const shadowCasters: AbstractMesh[] = [];

  for (const node of plan.document.nodes) {
    throwIfAborted(context.signal);
    const root = rootById.get(node.id);
    if (!root) throw captureError("invalid-snapshot");
    if (node.kind === "primitive") {
      const mesh = createPrimitiveMesh(node.primitiveKind, `studio-primitive:${node.id}`, scene);
      mesh.parent = root;
      const material = new StandardMaterial(`studio-primitive-material:${node.id}`, scene);
      material.diffuseColor = Color3.FromHexString(node.color);
      mesh.material = material;
      mesh.receiveShadows = node.receivesShadow;
      renderMeshes.push(mesh);
      if (node.castsShadow) shadowCasters.push(mesh);
      continue;
    }

    const asset = assetByAttachmentId.get(node.attachmentId);
    if (!asset) throw captureError("asset-mismatch");
    const imported = await withAbortAndDeadline(
      ImportMeshAsync(asset.bytes, scene, {
        meshNames: null,
        name: `${asset.attachmentId}.glb`,
        pluginExtension: ".glb",
        rootUrl: "",
      }),
      context.signal,
    );
    throwIfAborted(context.signal);
    for (const group of imported.animationGroups) {
      group.stop();
      group.reset();
    }
    const importedNodes = new Set<Node>([
      ...imported.meshes,
      ...imported.transformNodes,
    ]);
    const contentRoot = new TransformNode(`studio-model-content:${node.id}`, scene);
    for (const importedNode of importedNodes) {
      if (!importedNode.parent || !importedNodes.has(importedNode.parent)) {
        importedNode.parent = contentRoot;
      }
    }
    // Measure the decoded asset before the persisted node hierarchy contributes translation,
    // rotation, or user scale. This matches the Three viewport's source-root auto-fit step.
    contentRoot.scaling.setAll(modelAutoFitScale(imported.meshes));
    contentRoot.parent = root;
    const overriddenMaterials = new Set<Material>();
    for (const mesh of imported.meshes) {
      if (mesh.getTotalVertices() < 1) continue;
      mesh.receiveShadows = node.receivesShadow;
      if (
        mesh.material &&
        node.materialOverride &&
        !overriddenMaterials.has(mesh.material)
      ) {
        applyMaterialOverride(mesh.material, node.materialOverride);
        overriddenMaterials.add(mesh.material);
      }
      renderMeshes.push(mesh);
      if (node.castsShadow) shadowCasters.push(mesh);
    }
  }
  return Object.freeze({
    meshes: Object.freeze(renderMeshes),
    shadowCasters: Object.freeze(shadowCasters),
  });
}

function setupCamera(
  document: StudioBg3dSceneDocument,
  width: number,
  height: number,
  scene: Scene,
): FreeCamera {
  const cameraSettings = document.camera;
  const camera = new FreeCamera(
    "studio-capture-camera",
    new Vector3(...cameraSettings.position),
    scene,
  );
  camera.minZ = resolveStudioBg3dCameraNearClip(cameraSettings.nearClip);
  camera.maxZ = CAMERA_FAR_CLIP;
  const zoom = cameraSettings.zoom ?? 1;
  camera.fov = 2 * Math.atan(Math.tan((cameraSettings.fovDegrees * Math.PI) / 360) / zoom);
  camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
  const up = resolveStudioBg3dCameraUpVector(cameraSettings);
  camera.upVector.copyFromFloats(...up);
  camera.setTarget(new Vector3(...cameraSettings.target));
  camera.viewport.width = 1;
  camera.viewport.height = 1;
  camera.viewport.x = 0;
  camera.viewport.y = 0;
  // Force projection creation at the requested aspect before shader compilation/readback.
  void width;
  void height;
  scene.activeCamera = camera;
  return camera;
}

function setupScenePresentation(
  document: StudioBg3dSceneDocument,
  scene: Scene,
): void {
  scene.useRightHandedSystem = true;
  scene.autoClear = true;
  scene.autoClearDepthAndStencil = true;
  const transparent =
    document.output.transparentBackground || document.background.mode === "transparent";
  const clearColor = document.background.mode === "color"
    ? document.background.color
    : document.background.skyPresetId === "blank"
      ? "#ffffff"
      : document.background.color;
  const parsedClearColor = transparent
    ? Color3.Black()
    : Color3.FromHexString(clearColor);
  scene.clearColor = new Color4(
    parsedClearColor.r,
    parsedClearColor.g,
    parsedClearColor.b,
    transparent ? 0 : 1,
  );

  const image = scene.imageProcessingConfiguration;
  image.exposure = document.render.exposure;
  image.toneMappingEnabled = document.render.toneMapping !== "none";
  image.toneMappingType = document.render.toneMapping === "aces"
    ? ImageProcessingConfiguration.TONEMAPPING_ACES
    : ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  image.applyByPostProcess = false;

  if (document.background.fogEnabled) {
    // Babylon's stable public FOGMODE_LINEAR enum value.
    scene.fogMode = 3;
    scene.fogStart = document.background.fogNear ?? 10;
    scene.fogEnd = document.background.fogFar ?? 50;
    scene.fogColor = Color3.FromHexString(document.background.fogColor ?? clearColor);
  }
}

function setupLightingAndShadows(
  document: StudioBg3dSceneDocument,
  scene: Scene,
  shadowCasters: readonly AbstractMesh[],
): void {
  const ambient = new HemisphericLight(
    "studio-ambient",
    Vector3.Up(),
    scene,
  );
  ambient.diffuse = Color3.FromHexString(document.lighting.ambientColor);
  // Equal sky/ground colors make the hemispheric term a uniform ambient contribution.
  ambient.groundColor = ambient.diffuse.clone();
  ambient.specular = Color3.Black();
  ambient.intensity = document.lighting.ambientIntensity;

  for (const [name, settings] of [
    ["key", document.lighting.key],
    ["fill", document.lighting.fill],
  ] as const) {
    // Document direction points from subject toward the light; Babylon stores light-ray direction.
    const light = new DirectionalLight(
      `studio-${name}`,
      new Vector3(
        -settings.direction[0],
        -settings.direction[1],
        -settings.direction[2],
      ),
      scene,
    );
    light.diffuse = Color3.FromHexString(settings.color);
    light.intensity = settings.intensity;
    if (
      document.render.shadows &&
      settings.castsShadow &&
      shadowCasters.length > 0
    ) {
      const generator = new ShadowGenerator(
        Math.min(2048, document.quality.desktop.shadowMapSize),
        light,
        true,
      );
      generator.usePercentageCloserFiltering = true;
      generator.bias = 0.0005;
      generator.normalBias = 0.02;
      for (const mesh of shadowCasters) generator.addShadowCaster(mesh, false);
    }
  }
}

async function renderStudioBg3dBabylonCapture(
  context: StudioBg3dBabylonSpecialistExecutionContext,
  plan: StudioBg3dBabylonCapturePlan,
): Promise<StudioBg3dBabylonCaptureFrame> {
  const engine = context.engine as AbstractEngine;
  const scene = context.scene as Scene;
  if (
    typeof engine.setSize !== "function" ||
    typeof engine.readPixels !== "function" ||
    typeof scene.render !== "function" ||
    typeof scene.whenReadyAsync !== "function"
  ) {
    throw captureError("renderer-unavailable");
  }
  const transparent =
    plan.document.output.transparentBackground ||
    plan.document.background.mode === "transparent";
  if (transparent && plan.backend === "webgpu") {
    // Babylon configures a non-premultiplied WebGPU canvas as `alphaMode: opaque`; until capture
    // uses a dedicated RGBA render target, returning alpha from the swap chain would be misleading.
    throw captureError("unsupported-scene-feature");
  }
  const swapRedBlue = webGpuReadbackUsesBgra(engine, plan.backend);
  throwIfAborted(context.signal);
  engine.setHardwareScalingLevel(1);
  engine.setSize(plan.width, plan.height, true);
  if (
    engine.getRenderWidth(true) !== plan.width ||
    engine.getRenderHeight(true) !== plan.height
  ) {
    throw captureError("renderer-unavailable");
  }
  setupScenePresentation(plan.document, scene);
  const camera = setupCamera(plan.document, plan.width, plan.height, scene);
  const populated = await populateScene(context, plan, scene);
  setupLightingAndShadows(
    plan.document,
    scene,
    populated.shadowCasters,
  );

  const hasDepthGeometry = populated.meshes.some((mesh) =>
    mesh.getTotalVertices() > 0 && mesh.isEnabled() && mesh.isVisible
  );
  let depthRenderer: DepthRenderer | null = null;
  try {
    if (plan.includeDepth && hasDepthGeometry) {
      depthRenderer = scene.enableDepthRenderer(
        camera,
        false,
        true,
        Constants.TEXTURE_NEAREST_SAMPLINGMODE,
        false,
      );
      if (depthRenderer.isPacked) throw captureError("renderer-unavailable");
      depthRenderer.clearColor = new Color4(1, 1, 1, 1);
      depthRenderer.forceDepthWriteTransparentMeshes = true;
      depthRenderer.useOnlyInActiveCamera = true;
      depthRenderer.getDepthMap().renderList = [...populated.meshes];
    }

    await withAbortAndDeadline(scene.whenReadyAsync(true), context.signal);
    throwIfAborted(context.signal);
    // One warm-up resolves material/RTT compilation; the second frame is the canonical readback.
    scene.render(true, true);
    scene.render(true, true);
    const flipY = plan.backend === "webgl2";
    const rgbaPromise = withAbortAndDeadline(
      engine.readPixels(0, 0, plan.width, plan.height, true, true),
      context.signal,
    ).then((pixels) => rgbaRowsTopDown(
      pixels,
      plan.width,
      plan.height,
      flipY,
      swapRedBlue,
      transparent,
    ));
    const depthPromise = depthRenderer
      ? withAbortAndDeadline(
        depthRenderer.getDepthMap().readPixels(
          0,
          0,
          null,
          true,
          false,
          0,
          0,
          plan.width,
          plan.height,
        ) ?? Promise.reject(captureError("renderer-unavailable")),
        context.signal,
      ).then((pixels) => depthRowsTopDown(pixels, plan.width, plan.height, flipY))
      : Promise.resolve(
        plan.includeDepth
          ? new Float32Array(plan.width * plan.height).fill(1)
          : undefined,
      );
    const [rgba, depth] = await Promise.all([rgbaPromise, depthPromise]);
    return {
      rgba,
      ...(depth ? { depth } : {}),
    };
  } catch (error) {
    if (
      error instanceof StudioBg3dBabylonCaptureError ||
      error instanceof StudioBg3dBabylonSpecialistError
    ) {
      throw error;
    }
    throw captureError("capture-failed", error);
  } finally {
    depthRenderer?.dispose();
  }
}

export function createStudioBg3dBabylonCaptureExecutor(
  render: StudioBg3dBabylonCaptureRenderer = renderStudioBg3dBabylonCapture,
): StudioBg3dBabylonSpecialistExecutor {
  return async (context): Promise<StudioBg3dSpecialistResult> => {
    throwIfAborted(context.signal);
    if (context.job.request.kind === "runtime-metrics") {
      return metricsResult(context);
    }
    const requested = resolveCaptureRequest(context.job);
    if (!requested) {
      throw new StudioBg3dBabylonSpecialistError("unsupported-request");
    }
    const plan = createCapturePlan(context, requested);
    const frame = validateFrame(await render(context, plan), requested);
    throwIfAborted(context.signal);
    if (requested.format === "artifact-v2") {
      return toArtifactResult(context.job, requested, frame);
    }
    return {
      kind: "capture",
      width: requested.width,
      height: requested.height,
      rgba: frame.rgba,
      ...(requested.includeDepth && frame.depth
        ? { depthFloat32: frame.depth }
        : {}),
    };
  };
}

export const executeStudioBg3dBabylonCapture =
  createStudioBg3dBabylonCaptureExecutor();
