/**
 * Renderer-independent validation boundary for user supplied GLB files.
 *
 * Keep this module free of Three.js/Babylon.js imports. A caller must validate the original bytes
 * here before creating an object URL, invoking a renderer loader, or resolving any glTF resource.
 */

export const STUDIO_BG3D_GLB_MAX_BYTES = 100 * 1024 * 1024;
export const STUDIO_BG3D_GLB_MAX_JSON_BYTES = 4 * 1024 * 1024;
export const STUDIO_BG3D_GLB_MIME_TYPE = "model/gltf-binary" as const;

const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const SHA256_PATTERN = /^(?:sha256:)?([a-f0-9]{64})$/iu;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const KTX2_SIGNATURE = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export type StudioBg3dGlbProfile = "mobile" | "desktop";

export interface StudioBg3dGlbDeclaredMetadata {
  /** Exact byte length recorded when the attachment was created. */
  readonly byteSize: number;
  /** A raw 64-character digest or `sha256:`-prefixed digest. */
  readonly sha256: string;
  /** If supplied, only the GLB media type is accepted. */
  readonly mimeType?: string;
}

export interface StudioBg3dGlbCumulativeByteBudget {
  /** Bytes already admitted into the project before this attachment. */
  readonly usedBytes: number;
  /** Caller-selected project/session ceiling. */
  readonly maximumBytes: number;
}

export interface StudioBg3dGlbComplexityBudget {
  readonly maxModelBytes: number;
  readonly maxNodes: number;
  readonly maxTriangles: number;
  readonly maxDrawCalls: number;
  readonly maxMaterials: number;
  readonly maxLights: number;
}

export interface StudioBg3dGlbTextureBudget {
  readonly maxTextures: number;
  /** Sum of embedded compressed image buffer-view bytes. */
  readonly maxTotalBytes: number;
  /** Maximum width or height discovered in each supported embedded image. */
  readonly maxDimension: number;
}

export interface StudioBg3dGlbValidationBudget {
  readonly complexity: StudioBg3dGlbComplexityBudget;
  readonly textures: StudioBg3dGlbTextureBudget;
}

export interface StudioBg3dGlbBudgetProfiles {
  readonly mobile: StudioBg3dGlbValidationBudget;
  readonly desktop: StudioBg3dGlbValidationBudget;
}

/**
 * Conservative product defaults. Callers may supply stricter profiles for a document or device.
 */
export const DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES: StudioBg3dGlbBudgetProfiles =
  Object.freeze({
    mobile: Object.freeze({
      complexity: Object.freeze({
        maxModelBytes: 64 * 1024 * 1024,
        maxNodes: 256,
        maxTriangles: 500_000,
        maxDrawCalls: 256,
        maxMaterials: 128,
        maxLights: 4,
      }),
      textures: Object.freeze({
        maxTextures: 64,
        maxTotalBytes: 64 * 1024 * 1024,
        maxDimension: 4096,
      }),
    }),
    desktop: Object.freeze({
      complexity: Object.freeze({
        maxModelBytes: STUDIO_BG3D_GLB_MAX_BYTES,
        maxNodes: 1024,
        maxTriangles: 2_000_000,
        maxDrawCalls: 1024,
        maxMaterials: 512,
        maxLights: 16,
      }),
      textures: Object.freeze({
        maxTextures: 256,
        maxTotalBytes: STUDIO_BG3D_GLB_MAX_BYTES,
        maxDimension: 8192,
      }),
    }),
  });

export type StudioBg3dGlbDigest = (
  bytes: Uint8Array,
) => Promise<ArrayBuffer | Uint8Array | string>;

export interface StudioBg3dGlbValidationOptions {
  readonly declared: StudioBg3dGlbDeclaredMetadata;
  readonly cumulative: StudioBg3dGlbCumulativeByteBudget;
  readonly profile: StudioBg3dGlbProfile;
  readonly budgets: StudioBg3dGlbBudgetProfiles;
  /** Dependency injection for restricted runtimes and deterministic tests. */
  readonly digest?: StudioBg3dGlbDigest;
  /** Always clamped to the module's 4 MiB hard JSON ceiling. */
  readonly maxJsonBytes?: number;
  /** Required extensions not in this allowlist are rejected before a renderer sees the file. */
  readonly supportedRequiredExtensions?: readonly string[];
}

export interface StudioBg3dGlbMetrics {
  readonly byteSize: number;
  readonly jsonByteSize: number;
  readonly binByteSize: number;
  readonly nodes: number;
  readonly meshes: number;
  /** Primitives declared once in the mesh table, before node instancing. */
  readonly meshPrimitives: number;
  /** Primitive count after ordinary and EXT_mesh_gpu_instancing node instances. */
  readonly drawCalls: number;
  /** Indexed/non-indexed triangle count after node instances. */
  readonly triangles: number;
  readonly materials: number;
  readonly textures: number;
  readonly images: number;
  readonly imageBytes: number;
  /** Conservative RGBA8 allocation estimate for images whose dimensions can be read safely. */
  readonly estimatedDecodedImageBytes: number;
  readonly maxImageDimension: number;
  readonly undeterminedImageDimensions: number;
  readonly lights: number;
}

export type StudioBg3dGlbFailureCode =
  | "invalid-input"
  | "invalid-options"
  | "invalid-declared-metadata"
  | "mime-type-mismatch"
  | "byte-size-mismatch"
  | "file-too-large"
  | "model-byte-budget-exceeded"
  | "cumulative-byte-budget-exceeded"
  | "digest-unavailable"
  | "digest-failed"
  | "hash-mismatch"
  | "truncated-header"
  | "invalid-magic"
  | "unsupported-version"
  | "declared-length-mismatch"
  | "missing-json-chunk"
  | "json-chunk-too-large"
  | "invalid-chunk-alignment"
  | "invalid-chunk-bounds"
  | "duplicate-json-chunk"
  | "duplicate-bin-chunk"
  | "unsupported-chunk-type"
  | "invalid-json-encoding"
  | "invalid-json"
  | "invalid-gltf-root"
  | "unsupported-required-extension"
  | "external-resource-uri"
  | "missing-bin-chunk"
  | "invalid-buffer"
  | "invalid-buffer-view"
  | "invalid-accessor"
  | "invalid-mesh"
  | "invalid-node"
  | "invalid-image"
  | "arithmetic-overflow"
  | "node-budget-exceeded"
  | "triangle-budget-exceeded"
  | "draw-call-budget-exceeded"
  | "material-budget-exceeded"
  | "light-budget-exceeded"
  | "texture-count-budget-exceeded"
  | "texture-byte-budget-exceeded"
  | "texture-dimension-budget-exceeded";

export interface StudioBg3dGlbValidationFailure {
  readonly ok: false;
  readonly code: StudioBg3dGlbFailureCode;
  /** Stable, sanitized Korean UI copy. Never contains file-controlled strings. */
  readonly message: string;
}

export interface StudioBg3dGlbValidationSuccess {
  readonly ok: true;
  readonly code: "valid";
  readonly message: string;
  readonly profile: StudioBg3dGlbProfile;
  readonly verifiedSha256: `sha256:${string}`;
  /**
   * Validator-owned snapshot that passed every check. Renderers must parse only this value, never
   * the caller's original ArrayBuffer/Uint8Array, which may be mutated after this promise resolves.
   */
  readonly verifiedBytes: Uint8Array;
  readonly cumulativeBytesAfter: number;
  readonly metrics: StudioBg3dGlbMetrics;
}

export type StudioBg3dGlbValidationResult =
  | StudioBg3dGlbValidationFailure
  | StudioBg3dGlbValidationSuccess;

const FAILURE_MESSAGES: Readonly<Record<StudioBg3dGlbFailureCode, string>> = Object.freeze({
  "invalid-input": "3D 모델 파일의 이진 데이터를 읽을 수 없습니다. 파일을 다시 선택해 주세요.",
  "invalid-options": "3D 모델 안전 검사 설정이 올바르지 않습니다. 작업공간을 새로고침해 주세요.",
  "invalid-declared-metadata": "3D 모델의 크기 또는 무결성 정보를 확인할 수 없습니다. 파일을 다시 등록해 주세요.",
  "mime-type-mismatch": "지원되는 GLB 형식의 3D 모델만 불러올 수 있습니다.",
  "byte-size-mismatch": "3D 모델의 기록된 크기와 실제 파일 크기가 다릅니다. 원본 파일을 다시 등록해 주세요.",
  "file-too-large": "3D 모델은 파일 하나당 최대 100MiB까지 불러올 수 있습니다. 모델을 최적화해 주세요.",
  "model-byte-budget-exceeded": "이 기기의 3D 모델 용량 기준을 초과했습니다. 더 작은 모델을 사용해 주세요.",
  "cumulative-byte-budget-exceeded": "프로젝트의 3D 모델 누적 용량 기준을 초과했습니다. 사용하지 않는 모델을 정리해 주세요.",
  "digest-unavailable": "이 환경에서는 3D 모델 무결성 검사를 사용할 수 없습니다. 최신 브라우저에서 다시 시도해 주세요.",
  "digest-failed": "3D 모델 무결성 검사를 완료하지 못했습니다. 파일을 다시 선택해 주세요.",
  "hash-mismatch": "3D 모델이 등록 이후 변경되었거나 손상되었습니다. 신뢰할 수 있는 원본을 다시 등록해 주세요.",
  "truncated-header": "3D 모델 파일이 완전하지 않습니다. 원본 GLB 파일을 다시 받아 주세요.",
  "invalid-magic": "이 파일은 유효한 GLB 모델이 아닙니다. GLB 2.0 형식으로 내보내 주세요.",
  "unsupported-version": "GLB 2.0 모델만 지원합니다. 모델을 GLB 2.0으로 다시 내보내 주세요.",
  "declared-length-mismatch": "3D 모델 컨테이너 길이가 실제 파일과 맞지 않습니다. 원본 파일을 다시 내보내 주세요.",
  "missing-json-chunk": "3D 모델에 필수 장면 정보가 없습니다. GLB 파일을 다시 내보내 주세요.",
  "json-chunk-too-large": "3D 모델의 장면 정보가 안전 처리 한도를 초과했습니다. 모델을 단순화해 주세요.",
  "invalid-chunk-alignment": "3D 모델 내부 블록 정렬이 올바르지 않습니다. GLB 파일을 다시 내보내 주세요.",
  "invalid-chunk-bounds": "3D 모델 내부 블록이 잘렸거나 손상되었습니다. 원본 파일을 다시 받아 주세요.",
  "duplicate-json-chunk": "3D 모델에 장면 정보 블록이 중복되어 있습니다. GLB 파일을 다시 내보내 주세요.",
  "duplicate-bin-chunk": "3D 모델에 이진 리소스 블록이 중복되어 있습니다. GLB 파일을 다시 내보내 주세요.",
  "unsupported-chunk-type": "지원하지 않는 내부 블록이 포함된 GLB 모델입니다. 표준 GLB 2.0으로 다시 내보내 주세요.",
  "invalid-json-encoding": "3D 모델 장면 정보의 문자 인코딩이 올바르지 않습니다. GLB 파일을 다시 내보내 주세요.",
  "invalid-json": "3D 모델 장면 정보를 해석할 수 없습니다. GLB 파일을 다시 내보내 주세요.",
  "invalid-gltf-root": "3D 모델의 glTF 2.0 장면 구조가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "unsupported-required-extension": "현재 안전하게 처리할 수 없는 필수 3D 확장이 포함되어 있습니다. 호환 옵션으로 다시 내보내 주세요.",
  "external-resource-uri": "외부 파일이나 네트워크 리소스를 참조하는 모델은 불러올 수 없습니다. 모든 리소스를 GLB 안에 포함해 주세요.",
  "missing-bin-chunk": "3D 모델에 필요한 내장 리소스가 없습니다. 텍스처와 메시를 GLB 안에 포함해 주세요.",
  "invalid-buffer": "3D 모델의 내장 이진 리소스 정보가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "invalid-buffer-view": "3D 모델의 내장 리소스 범위가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "invalid-accessor": "3D 모델의 기하 데이터 개수 정보를 확인할 수 없습니다. 파일을 다시 내보내 주세요.",
  "invalid-mesh": "3D 모델의 메시 구조가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "invalid-node": "3D 모델의 장면 노드 구조가 올바르지 않습니다. 파일을 다시 내보내 주세요.",
  "invalid-image": "3D 모델의 내장 이미지 구조가 올바르지 않습니다. 지원 형식으로 다시 내보내 주세요.",
  "arithmetic-overflow": "3D 모델의 복잡도를 안전하게 계산할 수 없습니다. 모델을 단순화해 주세요.",
  "node-budget-exceeded": "이 기기의 장면 노드 수 기준을 초과했습니다. 모델 계층을 단순화해 주세요.",
  "triangle-budget-exceeded": "이 기기의 삼각형 수 기준을 초과했습니다. 메시를 경량화해 주세요.",
  "draw-call-budget-exceeded": "이 기기의 드로콜 기준을 초과했습니다. 메시와 재질을 병합해 주세요.",
  "material-budget-exceeded": "이 기기의 재질 수 기준을 초과했습니다. 재질을 정리하거나 병합해 주세요.",
  "light-budget-exceeded": "이 기기의 조명 수 기준을 초과했습니다. 조명 수를 줄여 주세요.",
  "texture-count-budget-exceeded": "이 기기의 텍스처 개수 기준을 초과했습니다. 텍스처를 정리해 주세요.",
  "texture-byte-budget-exceeded": "이 기기의 내장 텍스처 용량 기준을 초과했습니다. 텍스처를 압축해 주세요.",
  "texture-dimension-budget-exceeded": "이 기기의 텍스처 해상도 기준을 초과했습니다. 텍스처 크기를 낮춰 주세요.",
});

interface GlbChunk {
  readonly offset: number;
  readonly byteLength: number;
}

interface ParsedContainer {
  readonly root: Record<string, unknown>;
  readonly jsonByteSize: number;
  readonly bin: GlbChunk | null;
}

interface BufferViewRange {
  readonly offset: number;
  readonly byteLength: number;
}

interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

interface CountResult {
  readonly metrics?: Omit<StudioBg3dGlbMetrics, "byteSize" | "jsonByteSize" | "binByteSize">;
  readonly failure?: StudioBg3dGlbValidationFailure;
}

function failure(code: StudioBg3dGlbFailureCode): StudioBg3dGlbValidationFailure {
  return Object.freeze({ ok: false, code, message: FAILURE_MESSAGES[code] });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

function readArray(root: Record<string, unknown>, key: string): readonly unknown[] | null {
  const value = root[key];
  return value === undefined ? [] : Array.isArray(value) ? value : null;
}

function safeAdd(left: number, right: number): number | null {
  return Number.isSafeInteger(left) && Number.isSafeInteger(right) && left <= Number.MAX_SAFE_INTEGER - right
    ? left + right
    : null;
}

function safeMultiply(left: number, right: number): number | null {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return null;
  if (left === 0 || right === 0) return 0;
  return left <= Math.floor(Number.MAX_SAFE_INTEGER / right) ? left * right : null;
}

function normalizedDeclaredHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = SHA256_PATTERN.exec(value);
  return match?.[1]?.toLowerCase() ?? null;
}

function bytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function browserSha256(bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("digest-unavailable");
  return subtle.digest("SHA-256", bytes);
}

async function calculateDigest(
  bytes: Uint8Array<ArrayBuffer>,
  injected: StudioBg3dGlbDigest | undefined,
): Promise<{ digest?: string; unavailable?: true }> {
  try {
    const result = await (injected ?? browserSha256)(bytes);
    if (typeof result === "string") {
      const normalized = normalizedDeclaredHash(result);
      return normalized ? { digest: normalized } : {};
    }
    const digestBytes = result instanceof ArrayBuffer ? new Uint8Array(result) : result;
    return digestBytes instanceof Uint8Array && digestBytes.byteLength === 32
      ? { digest: bytesToHex(digestBytes) }
      : {};
  } catch (error) {
    return error instanceof Error && error.message === "digest-unavailable"
      ? { unavailable: true }
      : {};
  }
}

function validBudget(budget: StudioBg3dGlbValidationBudget): boolean {
  return (
    isRecord(budget) &&
    isRecord(budget.complexity) &&
    isRecord(budget.textures) &&
    isSafePositiveInteger(budget.complexity.maxModelBytes) &&
    isSafePositiveInteger(budget.complexity.maxNodes) &&
    isSafePositiveInteger(budget.complexity.maxTriangles) &&
    isSafePositiveInteger(budget.complexity.maxDrawCalls) &&
    isSafePositiveInteger(budget.complexity.maxMaterials) &&
    isSafePositiveInteger(budget.complexity.maxLights) &&
    isSafePositiveInteger(budget.textures.maxTextures) &&
    isSafePositiveInteger(budget.textures.maxTotalBytes) &&
    isSafePositiveInteger(budget.textures.maxDimension)
  );
}

function parseContainer(bytes: Uint8Array, maxJsonBytes: number): ParsedContainer | StudioBg3dGlbValidationFailure {
  if (bytes.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) return failure("truncated-header");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return failure("invalid-magic");
  if (view.getUint32(4, true) !== GLB_VERSION) return failure("unsupported-version");
  if (view.getUint32(8, true) !== bytes.byteLength) return failure("declared-length-mismatch");

  let offset = GLB_HEADER_BYTES;
  let index = 0;
  let json: GlbChunk | null = null;
  let bin: GlbChunk | null = null;
  while (offset < bytes.byteLength) {
    if (offset % 4 !== 0) return failure("invalid-chunk-alignment");
    if (bytes.byteLength - offset < GLB_CHUNK_HEADER_BYTES) return failure("invalid-chunk-bounds");
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    if (chunkLength % 4 !== 0) return failure("invalid-chunk-alignment");
    const contentOffset = offset + GLB_CHUNK_HEADER_BYTES;
    if (chunkLength > bytes.byteLength - contentOffset) return failure("invalid-chunk-bounds");
    const chunk = { offset: contentOffset, byteLength: chunkLength };

    if (index === 0 && chunkType !== GLB_JSON_CHUNK) return failure("missing-json-chunk");
    if (chunkType === GLB_JSON_CHUNK) {
      if (json) return failure("duplicate-json-chunk");
      if (chunkLength > maxJsonBytes) return failure("json-chunk-too-large");
      json = chunk;
    } else if (chunkType === GLB_BIN_CHUNK) {
      if (bin) return failure("duplicate-bin-chunk");
      bin = chunk;
    } else {
      return failure("unsupported-chunk-type");
    }
    offset = contentOffset + chunkLength;
    index += 1;
  }

  if (!json) return failure("missing-json-chunk");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(json.offset, json.offset + json.byteLength),
    );
  } catch {
    return failure("invalid-json-encoding");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return failure("invalid-json");
  }
  if (!isRecord(parsed)) return failure("invalid-gltf-root");
  const asset = parsed.asset;
  if (!isRecord(asset) || asset.version !== "2.0") {
    return failure("invalid-gltf-root");
  }
  return { root: parsed, jsonByteSize: json.byteLength, bin };
}

function hasExternalResourceUri(root: Record<string, unknown>): boolean | null {
  for (const key of ["buffers", "images"] as const) {
    const resources = readArray(root, key);
    if (!resources) return null;
    for (const resource of resources) {
      if (!isRecord(resource)) return null;
      if (Object.hasOwn(resource, "uri")) return true;
    }
  }
  return false;
}

function validateRequiredExtensions(
  root: Record<string, unknown>,
  supported: readonly string[],
): StudioBg3dGlbValidationFailure | null {
  const required = root.extensionsRequired;
  if (required === undefined) return null;
  if (!Array.isArray(required) || required.some((value) => typeof value !== "string")) {
    return failure("invalid-gltf-root");
  }
  const allowed = new Set(supported);
  return required.some((extension) => !allowed.has(extension as string))
    ? failure("unsupported-required-extension")
    : null;
}

function parseBufferViews(
  root: Record<string, unknown>,
  bin: GlbChunk | null,
): readonly BufferViewRange[] | StudioBg3dGlbValidationFailure {
  const buffers = readArray(root, "buffers");
  const rawViews = readArray(root, "bufferViews");
  if (!buffers || !rawViews) return failure("invalid-gltf-root");
  if (buffers.length > 1) return failure("invalid-buffer");
  if (buffers.length === 0) {
    if (rawViews.length > 0 || bin) return failure("invalid-buffer");
    return [];
  }

  const buffer = buffers[0];
  if (!isRecord(buffer) || Object.hasOwn(buffer, "uri") || !isSafeNonNegativeInteger(buffer.byteLength)) {
    return Object.hasOwn(isRecord(buffer) ? buffer : {}, "uri")
      ? failure("external-resource-uri")
      : failure("invalid-buffer");
  }
  if (!bin && buffer.byteLength > 0) return failure("missing-bin-chunk");
  if (!bin) return rawViews.length === 0 ? [] : failure("missing-bin-chunk");
  if (bin.byteLength < buffer.byteLength || bin.byteLength > buffer.byteLength + 3) {
    return failure("invalid-buffer");
  }

  const views: BufferViewRange[] = [];
  for (const rawView of rawViews) {
    if (!isRecord(rawView)) return failure("invalid-buffer-view");
    const bufferIndex = rawView.buffer;
    const byteOffset = rawView.byteOffset ?? 0;
    const byteLength = rawView.byteLength;
    if (
      bufferIndex !== 0 ||
      !isSafeNonNegativeInteger(byteOffset) ||
      !isSafePositiveInteger(byteLength) ||
      byteOffset > buffer.byteLength ||
      byteLength > buffer.byteLength - byteOffset ||
      byteLength > bin.byteLength - byteOffset
    ) {
      return failure("invalid-buffer-view");
    }
    views.push(Object.freeze({ offset: bin.offset + byteOffset, byteLength }));
  }
  return Object.freeze(views);
}

function matchesSignature(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.byteLength >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

function pngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.byteLength < 24 || !matchesSignature(bytes, PNG_SIGNATURE)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return width > 0 && height > 0 ? { width, height } : null;
}

function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 1 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) return null;
    const marker = bytes[offset] ?? 0;
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.byteLength) return null;
    const segmentLength = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || segmentLength > bytes.byteLength - offset) return null;
    if (sofMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      const height = ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0);
      const width = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (
    bytes.byteLength < 30 ||
    String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.subarray(8, 12)) !== "WEBP"
  ) {
    return null;
  }
  const kind = String.fromCharCode(...bytes.subarray(12, 16));
  if (kind === "VP8X") {
    const width = 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16);
    const height = 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16);
    return { width, height };
  }
  if (kind === "VP8L" && bytes[20] === 0x2f) {
    const width = 1 + (((bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8)) & 0x3fff);
    const height = 1 + ((((bytes[22] ?? 0) >> 6) | ((bytes[23] ?? 0) << 2) | ((bytes[24] ?? 0) << 10)) & 0x3fff);
    return { width, height };
  }
  if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const width = ((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff;
    const height = ((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

function ktx2Dimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.byteLength < 28 || !matchesSignature(bytes, KTX2_SIGNATURE)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(20, true);
  const height = view.getUint32(24, true);
  return width > 0 && height > 0 ? { width, height } : null;
}

function imageDimensions(mimeType: string, bytes: Uint8Array): ImageDimensions | null {
  switch (mimeType) {
    case "image/png":
      return pngDimensions(bytes);
    case "image/jpeg":
      return jpegDimensions(bytes);
    case "image/webp":
      return webpDimensions(bytes);
    case "image/ktx2":
      return ktx2Dimensions(bytes);
    default:
      return null;
  }
}

function accessorCount(accessors: readonly unknown[], index: unknown): number | null {
  if (!isSafeNonNegativeInteger(index) || index >= accessors.length) return null;
  const accessor = accessors[index];
  return isRecord(accessor) && isSafePositiveInteger(accessor.count) ? accessor.count : null;
}

function primitiveVertexCount(primitive: Record<string, unknown>, accessors: readonly unknown[]): number | null {
  if (primitive.indices !== undefined) return accessorCount(accessors, primitive.indices);
  const attributes = primitive.attributes;
  return isRecord(attributes) ? accessorCount(accessors, attributes.POSITION) : null;
}

function triangleCount(vertexCount: number, mode: number): number {
  if (mode === 4) return Math.floor(vertexCount / 3);
  if (mode === 5 || mode === 6) return Math.max(0, vertexCount - 2);
  return 0;
}

function gpuInstanceCount(node: Record<string, unknown>, accessors: readonly unknown[]): number | null {
  const extensions = node.extensions;
  if (extensions === undefined) return 1;
  if (!isRecord(extensions)) return null;
  const instancing = extensions.EXT_mesh_gpu_instancing;
  if (instancing === undefined) return 1;
  if (!isRecord(instancing) || !isRecord(instancing.attributes)) return null;
  const indices = Object.values(instancing.attributes);
  if (indices.length === 0) return null;
  let maximum = 0;
  for (const index of indices) {
    const count = accessorCount(accessors, index);
    if (count === null) return null;
    maximum = Math.max(maximum, count);
  }
  return maximum;
}

function collectMetrics(
  bytes: Uint8Array,
  root: Record<string, unknown>,
  bin: GlbChunk | null,
): CountResult {
  const views = parseBufferViews(root, bin);
  if ("ok" in views) return { failure: views };

  const nodes = readArray(root, "nodes");
  const meshes = readArray(root, "meshes");
  const accessors = readArray(root, "accessors");
  const materials = readArray(root, "materials");
  const textures = readArray(root, "textures");
  const images = readArray(root, "images");
  if (!nodes || !meshes || !accessors || !materials || !textures || !images) {
    return { failure: failure("invalid-gltf-root") };
  }

  const meshInstances = new Array<number>(meshes.length).fill(0);
  for (const node of nodes) {
    if (!isRecord(node)) return { failure: failure("invalid-node") };
    if (node.mesh === undefined) continue;
    if (!isSafeNonNegativeInteger(node.mesh) || node.mesh >= meshes.length) {
      return { failure: failure("invalid-node") };
    }
    const instances = gpuInstanceCount(node, accessors);
    if (instances === null) return { failure: failure("invalid-node") };
    const total = safeAdd(meshInstances[node.mesh] ?? 0, instances);
    if (total === null) return { failure: failure("arithmetic-overflow") };
    meshInstances[node.mesh] = total;
  }

  let meshPrimitives = 0;
  let drawCalls = 0;
  let triangles = 0;
  let usesDefaultMaterial = false;
  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) {
    const mesh = meshes[meshIndex];
    if (!isRecord(mesh) || !Array.isArray(mesh.primitives) || mesh.primitives.length === 0) {
      return { failure: failure("invalid-mesh") };
    }
    const instanceCount = Math.max(1, meshInstances[meshIndex] ?? 0);
    for (const rawPrimitive of mesh.primitives) {
      if (!isRecord(rawPrimitive)) return { failure: failure("invalid-mesh") };
      const mode = rawPrimitive.mode ?? 4;
      if (!isSafeNonNegativeInteger(mode) || mode > 6) return { failure: failure("invalid-mesh") };
      const vertices = primitiveVertexCount(rawPrimitive, accessors);
      if (vertices === null) return { failure: failure("invalid-accessor") };
      if (rawPrimitive.material === undefined) usesDefaultMaterial = true;
      else if (!isSafeNonNegativeInteger(rawPrimitive.material) || rawPrimitive.material >= materials.length) {
        return { failure: failure("invalid-mesh") };
      }
      const nextPrimitives = safeAdd(meshPrimitives, 1);
      const nextDrawCalls = safeAdd(drawCalls, instanceCount);
      const instantiatedTriangles = safeMultiply(triangleCount(vertices, mode), instanceCount);
      const nextTriangles = instantiatedTriangles === null ? null : safeAdd(triangles, instantiatedTriangles);
      if (nextPrimitives === null || nextDrawCalls === null || nextTriangles === null) {
        return { failure: failure("arithmetic-overflow") };
      }
      meshPrimitives = nextPrimitives;
      drawCalls = nextDrawCalls;
      triangles = nextTriangles;
    }
  }

  for (const material of materials) if (!isRecord(material)) return { failure: failure("invalid-gltf-root") };
  for (const texture of textures) if (!isRecord(texture)) return { failure: failure("invalid-gltf-root") };

  let imageBytes = 0;
  let estimatedDecodedImageBytes = 0;
  let maxImageDimension = 0;
  let undeterminedImageDimensions = 0;
  for (const image of images) {
    if (!isRecord(image) || Object.hasOwn(image, "uri")) {
      return { failure: failure(Object.hasOwn(isRecord(image) ? image : {}, "uri") ? "external-resource-uri" : "invalid-image") };
    }
    if (!isSafeNonNegativeInteger(image.bufferView) || image.bufferView >= views.length) {
      return { failure: failure("invalid-image") };
    }
    const mimeType = image.mimeType;
    if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp" && mimeType !== "image/ktx2") {
      return { failure: failure("invalid-image") };
    }
    const range = views[image.bufferView];
    if (!range) return { failure: failure("invalid-image") };
    const nextImageBytes = safeAdd(imageBytes, range.byteLength);
    if (nextImageBytes === null) return { failure: failure("arithmetic-overflow") };
    imageBytes = nextImageBytes;
    const dimensions = imageDimensions(mimeType, bytes.subarray(range.offset, range.offset + range.byteLength));
    if (dimensions) {
      maxImageDimension = Math.max(maxImageDimension, dimensions.width, dimensions.height);
      const pixels = safeMultiply(dimensions.width, dimensions.height);
      const decodedBytes = pixels === null ? null : safeMultiply(pixels, 4);
      const nextDecodedBytes = decodedBytes === null
        ? null
        : safeAdd(estimatedDecodedImageBytes, decodedBytes);
      if (nextDecodedBytes === null) return { failure: failure("arithmetic-overflow") };
      estimatedDecodedImageBytes = nextDecodedBytes;
    } else undeterminedImageDimensions += 1;
  }

  let lights = 0;
  const rootExtensions = root.extensions;
  if (rootExtensions !== undefined) {
    if (!isRecord(rootExtensions)) return { failure: failure("invalid-gltf-root") };
    const punctual = rootExtensions.KHR_lights_punctual;
    if (punctual !== undefined) {
      if (!isRecord(punctual) || !Array.isArray(punctual.lights) || punctual.lights.some((light) => !isRecord(light))) {
        return { failure: failure("invalid-gltf-root") };
      }
      lights = punctual.lights.length;
    }
  }

  const materialCount = materials.length + (usesDefaultMaterial ? 1 : 0);
  if (!Number.isSafeInteger(materialCount)) return { failure: failure("arithmetic-overflow") };
  return {
    metrics: Object.freeze({
      nodes: nodes.length,
      meshes: meshes.length,
      meshPrimitives,
      drawCalls,
      triangles,
      materials: materialCount,
      textures: textures.length,
      images: images.length,
      imageBytes,
      estimatedDecodedImageBytes,
      maxImageDimension,
      undeterminedImageDimensions,
      lights,
    }),
  };
}

function enforceBudgets(
  metrics: StudioBg3dGlbMetrics,
  budget: StudioBg3dGlbValidationBudget,
): StudioBg3dGlbValidationFailure | null {
  if (metrics.nodes > budget.complexity.maxNodes) return failure("node-budget-exceeded");
  if (metrics.triangles > budget.complexity.maxTriangles) return failure("triangle-budget-exceeded");
  if (metrics.drawCalls > budget.complexity.maxDrawCalls) return failure("draw-call-budget-exceeded");
  if (metrics.materials > budget.complexity.maxMaterials) return failure("material-budget-exceeded");
  if (metrics.lights > budget.complexity.maxLights) return failure("light-budget-exceeded");
  if (metrics.textures > budget.textures.maxTextures) return failure("texture-count-budget-exceeded");
  if (
    Math.max(metrics.imageBytes, metrics.estimatedDecodedImageBytes) >
    budget.textures.maxTotalBytes
  ) {
    return failure("texture-byte-budget-exceeded");
  }
  if (metrics.maxImageDimension > budget.textures.maxDimension) return failure("texture-dimension-budget-exceeded");
  return null;
}

/**
 * Validates a complete, self-contained GLB before any renderer-specific parsing.
 *
 * The input is snapshotted after cheap byte/metadata guards so an async digest cannot be followed by
 * parsing caller-mutated bytes (a browser-side time-of-check/time-of-use race).
 */
export async function validateStudioBg3dGlb(
  input: ArrayBuffer | Uint8Array,
  options: StudioBg3dGlbValidationOptions,
): Promise<StudioBg3dGlbValidationResult> {
  if (!(input instanceof ArrayBuffer) && !(input instanceof Uint8Array)) return failure("invalid-input");
  if (!isRecord(options) || (options.profile !== "mobile" && options.profile !== "desktop")) {
    return failure("invalid-options");
  }
  const profileBudget = options.budgets?.[options.profile];
  if (
    !validBudget(profileBudget) ||
    !isRecord(options.cumulative) ||
    !isSafeNonNegativeInteger(options.cumulative.usedBytes) ||
    !isSafePositiveInteger(options.cumulative.maximumBytes) ||
    options.cumulative.usedBytes > options.cumulative.maximumBytes
  ) {
    return failure("invalid-options");
  }
  const declaredHash = normalizedDeclaredHash(options.declared?.sha256);
  if (
    !isRecord(options.declared) ||
    !isSafeNonNegativeInteger(options.declared.byteSize) ||
    !declaredHash
  ) {
    return failure("invalid-declared-metadata");
  }
  if (options.declared.mimeType !== undefined && options.declared.mimeType !== STUDIO_BG3D_GLB_MIME_TYPE) {
    return failure("mime-type-mismatch");
  }

  const byteLength = input.byteLength;
  if (byteLength !== options.declared.byteSize) return failure("byte-size-mismatch");
  if (byteLength > STUDIO_BG3D_GLB_MAX_BYTES) return failure("file-too-large");
  if (byteLength > profileBudget.complexity.maxModelBytes) return failure("model-byte-budget-exceeded");
  if (byteLength > options.cumulative.maximumBytes - options.cumulative.usedBytes) {
    return failure("cumulative-byte-budget-exceeded");
  }

  const source = input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const bytes = Uint8Array.from(source);
  // Digest implementations receive a separate copy, so even an injected adapter cannot mutate the
  // canonical snapshot that will later be returned to the renderer boundary.
  const digestResult = await calculateDigest(Uint8Array.from(bytes), options.digest);
  if (digestResult.unavailable) return failure("digest-unavailable");
  if (!digestResult.digest) return failure("digest-failed");
  if (!constantTimeHexEqual(digestResult.digest, declaredHash)) return failure("hash-mismatch");

  const configuredJsonBytes = options.maxJsonBytes ?? STUDIO_BG3D_GLB_MAX_JSON_BYTES;
  if (!isSafePositiveInteger(configuredJsonBytes)) return failure("invalid-options");
  const parsed = parseContainer(bytes, Math.min(configuredJsonBytes, STUDIO_BG3D_GLB_MAX_JSON_BYTES));
  if ("ok" in parsed) return parsed;

  const requiredExtensionFailure = validateRequiredExtensions(
    parsed.root,
    options.supportedRequiredExtensions ?? [],
  );
  if (requiredExtensionFailure) return requiredExtensionFailure;
  const externalResource = hasExternalResourceUri(parsed.root);
  if (externalResource === null) return failure("invalid-gltf-root");
  if (externalResource) return failure("external-resource-uri");

  const collected = collectMetrics(bytes, parsed.root, parsed.bin);
  if (collected.failure || !collected.metrics) return collected.failure ?? failure("invalid-gltf-root");
  const metrics: StudioBg3dGlbMetrics = Object.freeze({
    byteSize: byteLength,
    jsonByteSize: parsed.jsonByteSize,
    binByteSize: parsed.bin?.byteLength ?? 0,
    ...collected.metrics,
  });
  const budgetFailure = enforceBudgets(metrics, profileBudget);
  if (budgetFailure) return budgetFailure;

  return Object.freeze({
    ok: true,
    code: "valid",
    message: "3D 모델의 무결성·내장 리소스·기기 복잡도 검사를 통과했습니다.",
    profile: options.profile,
    verifiedSha256: `sha256:${digestResult.digest}`,
    verifiedBytes: bytes,
    cumulativeBytesAfter: options.cumulative.usedBytes + byteLength,
    metrics,
  });
}
