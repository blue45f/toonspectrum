import { disposeStudioBg3dThreeResources } from "./studio-background-3d-model";
import { STUDIO_BG3D_GLB_MAX_BYTES } from "./studio-bg3d-glb-validation";
import { STUDIO_BG3D_MESHOPT_EXTENSION } from "./studio-bg3d-meshopt";

import type { Bg3dModelUploadSource } from "./bg3d-model-library";
import type * as THREE from "three";

export const STUDIO_BG3D_IMPORT_MAX_FILES = 256;
export const STUDIO_BG3D_IMPORT_MAX_MODELS = 32;
export const STUDIO_BG3D_IMPORT_MAX_FILE_BYTES = STUDIO_BG3D_GLB_MAX_BYTES;
export const STUDIO_BG3D_IMPORT_MAX_TOTAL_BYTES = 300 * 1024 * 1024;
export const STUDIO_BG3D_IMPORT_MAX_TEXT_BYTES = 32 * 1024 * 1024;
export const STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION = 8_192;
export const STUDIO_BG3D_IMPORT_MAX_DECODED_IMAGE_BYTES = 256 * 1024 * 1024;
/** Mirrors the downstream model library's default cumulative admission budget. */
export const STUDIO_BG3D_IMPORT_MAX_OUTPUT_TOTAL_BYTES = STUDIO_BG3D_GLB_MAX_BYTES;

export const STUDIO_BG3D_IMPORT_PRIMARY_FORMATS = [
  "glb",
  "gltf",
  "obj",
  "fbx",
  "dae",
  "stl",
  "ply",
  "3ds",
] as const;
export const STUDIO_BG3D_IMPORT_COMPANION_FORMATS = [
  "bin",
  "mtl",
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const;

export type StudioBg3dImportPrimaryFormat = (typeof STUDIO_BG3D_IMPORT_PRIMARY_FORMATS)[number];
export type StudioBg3dImportCompanionFormat = (typeof STUDIO_BG3D_IMPORT_COMPANION_FORMATS)[number];
export type StudioBg3dImportProgressStage = "planning" | "reading" | "parsing" | "exporting" | "ready";

export interface StudioBg3dImportFile extends Blob {
  readonly name: string;
  readonly webkitRelativePath?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface StudioBg3dImportPlanItem {
  readonly primary: StudioBg3dImportFile;
  readonly primaryPath: string;
  readonly format: StudioBg3dImportPrimaryFormat;
}

export interface StudioBg3dImportPlan {
  readonly items: readonly StudioBg3dImportPlanItem[];
  readonly resources: ReadonlyMap<string, StudioBg3dImportFile>;
  readonly ignoredFiles: readonly string[];
  readonly totalBytes: number;
}

export interface StudioBg3dImportProgress {
  readonly stage: StudioBg3dImportProgressStage;
  readonly completedModels: number;
  readonly totalModels: number;
  readonly sourceName: string;
}

export interface StudioBg3dModelImportOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: StudioBg3dImportProgress) => void;
}

export type StudioBg3dModelImportErrorCode =
  | "aborted"
  | "duplicate-resource"
  | "empty-file"
  | "environment-unsupported"
  | "export-failed"
  | "file-too-large"
  | "image-dimension-too-large"
  | "image-memory-too-large"
  | "invalid-image"
  | "invalid-path"
  | "invalid-text"
  | "missing-resource"
  | "no-model"
  | "output-too-large"
  | "output-total-too-large"
  | "parse-failed"
  | "too-many-files"
  | "too-many-models"
  | "total-too-large"
  | "unsafe-resource-uri"
  | "unsupported-extension";

const ERROR_MESSAGES: Readonly<Record<StudioBg3dModelImportErrorCode, string>> = Object.freeze({
  aborted: "3D 모델 가져오기를 취소했습니다.",
  "duplicate-resource": "같은 경로 또는 이름의 3D 리소스가 중복되어 있습니다. 파일 구성을 정리해 주세요.",
  "empty-file": "비어 있는 3D 모델 또는 리소스 파일은 가져올 수 없습니다.",
  "environment-unsupported": "이 브라우저에서는 3D 모델 변환 기능을 사용할 수 없습니다. 최신 브라우저에서 다시 시도해 주세요.",
  "export-failed": "3D 모델을 자체 포함 GLB로 변환하지 못했습니다. 원본 모델과 텍스처를 확인해 주세요.",
  "file-too-large": "3D 모델 또는 리소스 파일 하나가 100MiB 제한을 초과했습니다.",
  "image-dimension-too-large": "3D 모델 텍스처 한 변은 8192px을 초과할 수 없습니다. 텍스처 해상도를 낮춰 주세요.",
  "image-memory-too-large": "선택한 3D 텍스처의 디코딩 메모리가 256MiB 제한을 초과했습니다. 텍스처를 줄여 주세요.",
  "invalid-image": "3D 모델 텍스처의 형식 또는 크기 정보를 안전하게 확인할 수 없습니다.",
  "invalid-path": "3D 모델 리소스 경로가 안전하지 않습니다. 상대 경로로 구성된 원본을 선택해 주세요.",
  "invalid-text": "3D 모델의 텍스트 데이터를 UTF-8로 읽지 못했습니다.",
  "missing-resource": "3D 모델이 참조하는 BIN·MTL·텍스처 파일이 선택 항목에 없습니다.",
  "no-model": "GLB, glTF, OBJ, FBX, DAE, STL, PLY 또는 3DS 모델 파일을 하나 이상 선택해 주세요.",
  "output-too-large": "변환된 GLB가 100MiB 제한을 초과했습니다. 텍스처나 메시를 최적화해 주세요.",
  "output-total-too-large": "한 번에 변환된 GLB의 총용량은 100MiB를 초과할 수 없습니다. 모델을 나누어 가져와 주세요.",
  "parse-failed": "3D 모델 구조를 해석하지 못했습니다. 원본 파일과 연결 리소스를 확인해 주세요.",
  "too-many-files": "한 번에 선택할 수 있는 3D 모델과 연결 리소스는 최대 256개입니다.",
  "too-many-models": "한 번에 가져올 수 있는 3D 모델은 최대 32개입니다.",
  "total-too-large": "한 번에 가져올 파일의 총용량은 300MiB를 초과할 수 없습니다.",
  "unsafe-resource-uri": "3D 모델이 로컬 선택 범위 밖의 네트워크 또는 파일 리소스를 참조합니다.",
  "unsupported-extension": "아직 변환할 수 없는 압축 또는 텍스처 확장이 포함되어 있습니다. 표준 glTF/GLB로 다시 내보내 주세요.",
});

export class StudioBg3dModelImportError extends Error {
  constructor(readonly code: StudioBg3dModelImportErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "StudioBg3dModelImportError";
  }
}

const PRIMARY_FORMAT_SET = new Set<string>(STUDIO_BG3D_IMPORT_PRIMARY_FORMATS);
const COMPANION_FORMAT_SET = new Set<string>(STUDIO_BG3D_IMPORT_COMPANION_FORMATS);
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/iu;
const SAFE_DATA_URI_PATTERN = /^data:(?:application\/(?:octet-stream|gltf-buffer)|image\/(?:png|jpeg|webp));base64,/iu;
const UNSUPPORTED_REQUIRED_GLTF_EXTENSIONS = new Set([
  "KHR_draco_mesh_compression",
  "KHR_texture_basisu",
  STUDIO_BG3D_MESHOPT_EXTENSION,
  "KHR_meshopt_compression",
]);
const JSON_GLTF_MESHOPT_EXTENSIONS = [
  STUDIO_BG3D_MESHOPT_EXTENSION,
  "KHR_meshopt_compression",
] as const;

function importError(code: StudioBg3dModelImportErrorCode): StudioBg3dModelImportError {
  return new StudioBg3dModelImportError(code);
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 31 || codePoint === 127;
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some(isControlCharacter);
}

function isSafeDataResourceUri(value: string): boolean {
  return SAFE_DATA_URI_PATTERN.test(value);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw importError("aborted");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extensionOf(path: string): string {
  const lastSegment = path.slice(path.lastIndexOf("/") + 1);
  const dot = lastSegment.lastIndexOf(".");
  return dot > 0 && dot < lastSegment.length - 1 ? lastSegment.slice(dot + 1).toLowerCase() : "";
}

function modelBaseName(path: string): string {
  const segment = path.slice(path.lastIndexOf("/") + 1);
  const dot = segment.lastIndexOf(".");
  const raw = dot > 0 ? segment.slice(0, dot) : segment;
  const normalized = Array.from(raw.normalize("NFKC"), (character) =>
    isControlCharacter(character) ? " " : character)
    .slice(0, 116)
    .join("")
    .trim()
    .replace(/\s+/gu, "-")
    .replace(/[^\p{L}\p{N}._~-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized || "3d-model";
}

function canonicalFilePath(file: StudioBg3dImportFile): string {
  const raw = (file.webkitRelativePath || file.name).normalize("NFC").replace(/\\/gu, "/");
  if (!raw || raw.length > 1024 || raw.startsWith("/") || containsControlCharacter(raw)) {
    throw importError("invalid-path");
  }
  const segments = raw.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw importError("invalid-path");
  }
  return segments.join("/");
}

function validateInputFile(file: StudioBg3dImportFile): void {
  validateInputFileShape(file);
  if (file.size <= 0) throw importError("empty-file");
  if (file.size > STUDIO_BG3D_IMPORT_MAX_FILE_BYTES) throw importError("file-too-large");
}

function validateInputFileShape(file: StudioBg3dImportFile): void {
  if (
    typeof file?.name !== "string"
    || typeof file.size !== "number"
    || !Number.isSafeInteger(file.size)
    || typeof file.arrayBuffer !== "function"
  ) {
    throw importError("invalid-path");
  }
}

/**
 * Creates a bounded, deterministic plan before any file bytes are materialized. Unknown files are
 * ignored so a directory selection may include licenses/readmes, but every usable resource path
 * must still be unique case-insensitively across platforms.
 */
export function planStudioBg3dModelImports(
  input: readonly StudioBg3dImportFile[],
): StudioBg3dImportPlan {
  if (input.length > STUDIO_BG3D_IMPORT_MAX_FILES) throw importError("too-many-files");
  const resources = new Map<string, StudioBg3dImportFile>();
  const canonicalPathByFoldedPath = new Map<string, string>();
  const items: StudioBg3dImportPlanItem[] = [];
  const ignoredFiles: string[] = [];
  let totalBytes = 0;

  for (const file of input) {
    validateInputFileShape(file);
    const path = canonicalFilePath(file);
    const extension = extensionOf(path);
    const isPrimary = PRIMARY_FORMAT_SET.has(extension);
    const isCompanion = COMPANION_FORMAT_SET.has(extension);
    if (!isPrimary && !isCompanion) {
      ignoredFiles.push(path);
      continue;
    }
    validateInputFile(file);
    if (totalBytes > STUDIO_BG3D_IMPORT_MAX_TOTAL_BYTES - file.size) throw importError("total-too-large");
    totalBytes += file.size;
    const foldedPath = path.toLocaleLowerCase("en-US");
    if (canonicalPathByFoldedPath.has(foldedPath)) throw importError("duplicate-resource");
    canonicalPathByFoldedPath.set(foldedPath, path);
    resources.set(path, file);
    if (isPrimary) {
      items.push({
        primary: file,
        primaryPath: path,
        format: extension as StudioBg3dImportPrimaryFormat,
      });
    }
  }

  if (items.length === 0) throw importError("no-model");
  if (items.length > STUDIO_BG3D_IMPORT_MAX_MODELS) throw importError("too-many-models");
  return Object.freeze({
    items: Object.freeze(items),
    resources,
    ignoredFiles: Object.freeze(ignoredFiles),
    totalBytes,
  });
}

function safeDecodeUriPath(value: string): string {
  const withoutQuery = value.split(/[?#]/u, 1)[0] ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery).replace(/\\/gu, "/");
  } catch {
    throw importError("unsafe-resource-uri");
  }
  if (!decoded || decoded.startsWith("/") || containsControlCharacter(decoded)) {
    throw importError("unsafe-resource-uri");
  }
  const normalized: string[] = [];
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (normalized.length === 0) throw importError("unsafe-resource-uri");
      normalized.pop();
    } else {
      normalized.push(segment);
    }
  }
  if (normalized.length === 0) throw importError("unsafe-resource-uri");
  return normalized.join("/");
}

function directoryOf(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator >= 0 ? path.slice(0, separator + 1) : "";
}

class LocalResourceResolver {
  readonly #resources: ReadonlyMap<string, StudioBg3dImportFile>;
  readonly #primaryDirectory: string;
  readonly #pathByFoldedPath = new Map<string, string>();
  readonly #uniquePathByFoldedBaseName = new Map<string, string | null>();
  readonly #objectUrlByPath = new Map<string, string>();
  readonly #ownedObjectUrls = new Set<string>();

  constructor(resources: ReadonlyMap<string, StudioBg3dImportFile>, primaryPath: string) {
    this.#resources = resources;
    this.#primaryDirectory = directoryOf(primaryPath);
    for (const path of resources.keys()) {
      this.#pathByFoldedPath.set(path.toLocaleLowerCase("en-US"), path);
      const baseName = path.slice(path.lastIndexOf("/") + 1).toLocaleLowerCase("en-US");
      if (!this.#uniquePathByFoldedBaseName.has(baseName)) {
        this.#uniquePathByFoldedBaseName.set(baseName, path);
      } else {
        this.#uniquePathByFoldedBaseName.set(baseName, null);
      }
    }
  }

  fileForUri(uri: string): StudioBg3dImportFile {
    const path = this.#resolvePath(uri);
    const file = this.#resources.get(path);
    if (!file) throw importError("missing-resource");
    return file;
  }

  urlForUri = (uri: string): string => {
    if (uri.startsWith("data:")) {
      if (!isSafeDataResourceUri(uri)) throw importError("unsafe-resource-uri");
      return uri;
    }
    if (uri.startsWith("blob:") && this.#ownedObjectUrls.has(uri)) return uri;
    if (SCHEME_PATTERN.test(uri) || uri.startsWith("//")) throw importError("unsafe-resource-uri");
    const path = this.#resolvePath(uri);
    const existing = this.#objectUrlByPath.get(path);
    if (existing) return existing;
    if (typeof URL?.createObjectURL !== "function") throw importError("environment-unsupported");
    const file = this.#resources.get(path);
    if (!file) throw importError("missing-resource");
    const objectUrl = URL.createObjectURL(file);
    this.#objectUrlByPath.set(path, objectUrl);
    this.#ownedObjectUrls.add(objectUrl);
    return objectUrl;
  };

  dispose(): void {
    for (const objectUrl of this.#ownedObjectUrls) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Revocation is best-effort, but one browser failure must not strand the remaining URLs.
      }
    }
    this.#ownedObjectUrls.clear();
    this.#objectUrlByPath.clear();
  }

  #resolvePath(uri: string): string {
    if (SCHEME_PATTERN.test(uri) || uri.startsWith("//")) throw importError("unsafe-resource-uri");
    const normalized = safeDecodeUriPath(uri);
    const candidates = [`${this.#primaryDirectory}${normalized}`, normalized];
    for (const candidate of candidates) {
      const exact = this.#resources.has(candidate)
        ? candidate
        : this.#pathByFoldedPath.get(candidate.toLocaleLowerCase("en-US"));
      if (exact) return exact;
    }
    const baseName = normalized.slice(normalized.lastIndexOf("/") + 1).toLocaleLowerCase("en-US");
    const uniquePath = this.#uniquePathByFoldedBaseName.get(baseName);
    if (uniquePath) return uniquePath;
    throw importError("missing-resource");
  }
}

interface TrackedLoadingManager {
  readonly manager: THREE.LoadingManager;
  waitForIdle(): Promise<void>;
}

async function createTrackedLoadingManager(
  resolver: LocalResourceResolver,
): Promise<TrackedLoadingManager> {
  const { LoadingManager } = await import("three");
  const manager = new LoadingManager();
  let started = false;
  let settled = false;
  let failed = false;
  let settle: (() => void) | null = null;
  const idle = new Promise<void>((resolve) => {
    settle = resolve;
  });
  manager.setURLModifier(resolver.urlForUri);
  manager.onStart = () => {
    started = true;
  };
  manager.onLoad = () => {
    settled = true;
    settle?.();
  };
  manager.onError = () => {
    failed = true;
    settled = true;
    settle?.();
  };
  return {
    manager,
    async waitForIdle() {
      await Promise.resolve();
      if (!started || settled) {
        if (failed) throw importError("missing-resource");
        return;
      }
      await idle;
      if (failed) throw importError("missing-resource");
    },
  };
}

async function readBytes(
  file: StudioBg3dImportFile,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  throwIfAborted(signal);
  try {
    const result = await file.arrayBuffer();
    throwIfAborted(signal);
    if (!(result instanceof ArrayBuffer) || result.byteLength !== file.size) throw importError("parse-failed");
    return result;
  } catch (error) {
    if (error instanceof StudioBg3dModelImportError) throw error;
    throw importError("parse-failed");
  }
}

async function readUtf8(
  file: StudioBg3dImportFile,
  signal?: AbortSignal,
): Promise<string> {
  if (file.size > STUDIO_BG3D_IMPORT_MAX_TEXT_BYTES) throw importError("file-too-large");
  const bytes = await readBytes(file, signal);
  throwIfAborted(signal);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw importError("invalid-text");
  }
}

interface ImportedImageDimensions {
  readonly width: number;
  readonly height: number;
}

function importedPngDimensions(bytes: Uint8Array): ImportedImageDimensions | null {
  if (
    bytes.byteLength < 24 ||
    ![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    )
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return width > 0 && height > 0 ? { width, height } : null;
}

function importedJpegDimensions(bytes: Uint8Array): ImportedImageDimensions | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sizeMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
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
    if (sizeMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      const height = ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0);
      const width = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function importedWebpDimensions(bytes: Uint8Array): ImportedImageDimensions | null {
  const text = (offset: number, length: number) => String.fromCharCode(
    ...bytes.subarray(offset, offset + length),
  );
  if (bytes.byteLength < 30 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP") return null;
  const kind = text(12, 4);
  if (kind === "VP8X") {
    return {
      width: 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16),
      height: 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16),
    };
  }
  if (kind === "VP8L" && bytes[20] === 0x2f) {
    return {
      width: 1 + (((bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8)) & 0x3fff),
      height: 1 + ((((bytes[22] ?? 0) >> 6) | ((bytes[23] ?? 0) << 2) | ((bytes[24] ?? 0) << 10)) & 0x3fff),
    };
  }
  if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const width = ((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff;
    const height = ((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

function importedImageDimensions(
  extension: string,
  bytes: Uint8Array,
): ImportedImageDimensions | null {
  if (extension === "png") return importedPngDimensions(bytes);
  if (extension === "jpg" || extension === "jpeg") return importedJpegDimensions(bytes);
  if (extension === "webp") return importedWebpDimensions(bytes);
  return null;
}

async function preflightCompanionImageMemory(
  resources: ReadonlyMap<string, StudioBg3dImportFile>,
  signal?: AbortSignal,
): Promise<void> {
  let decodedBytes = 0;
  for (const [path, file] of resources) {
    const extension = extensionOf(path);
    if (extension !== "png" && extension !== "jpg" && extension !== "jpeg" && extension !== "webp") {
      continue;
    }
    const dimensions = importedImageDimensions(
      extension,
      new Uint8Array(await readBytes(file, signal)),
    );
    if (!dimensions) throw importError("invalid-image");
    if (
      dimensions.width > STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION ||
      dimensions.height > STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION
    ) {
      throw importError("image-dimension-too-large");
    }
    const imageBytes = dimensions.width * dimensions.height * 4;
    if (
      !Number.isSafeInteger(imageBytes) ||
      decodedBytes > STUDIO_BG3D_IMPORT_MAX_DECODED_IMAGE_BYTES - imageBytes
    ) {
      throw importError("image-memory-too-large");
    }
    decodedBytes += imageBytes;
  }
}

function rejectJsonGltfMeshoptBufferViews(root: Record<string, unknown>): void {
  const bufferViews = root.bufferViews;
  if (bufferViews === undefined) return;
  if (!Array.isArray(bufferViews)) throw importError("parse-failed");
  for (const bufferView of bufferViews) {
    if (!isRecord(bufferView)) throw importError("parse-failed");
    const extensions = bufferView.extensions;
    if (extensions === undefined) continue;
    if (!isRecord(extensions)) throw importError("parse-failed");
    if (JSON_GLTF_MESHOPT_EXTENSIONS.some((extension) => Object.hasOwn(extensions, extension))) {
      throw importError("unsupported-extension");
    }
  }
}

function gltfResourceUris(root: unknown): readonly string[] {
  if (!isRecord(root)) throw importError("parse-failed");
  const candidate = root as {
    readonly asset?: { readonly version?: unknown };
    readonly buffers?: readonly { readonly uri?: unknown }[];
    readonly images?: readonly { readonly uri?: unknown }[];
    readonly extensionsRequired?: unknown;
  };
  if (candidate.asset?.version !== "2.0") throw importError("parse-failed");
  rejectJsonGltfMeshoptBufferViews(root);
  const extensionsRequired = candidate.extensionsRequired;
  if (extensionsRequired !== undefined && !Array.isArray(extensionsRequired)) {
    throw importError("parse-failed");
  }
  for (const extension of extensionsRequired ?? []) {
    if (typeof extension !== "string") throw importError("parse-failed");
    if (UNSUPPORTED_REQUIRED_GLTF_EXTENSIONS.has(extension)) throw importError("unsupported-extension");
  }
  const uris: string[] = [];
  for (const entry of [...(candidate.buffers ?? []), ...(candidate.images ?? [])]) {
    if (entry.uri === undefined) continue;
    if (typeof entry.uri !== "string" || !entry.uri) throw importError("parse-failed");
    uris.push(entry.uri);
  }
  return uris;
}

function validateSelectedResourceUri(uri: string, resolver: LocalResourceResolver): void {
  if (uri.startsWith("data:")) {
    if (!isSafeDataResourceUri(uri)) throw importError("unsafe-resource-uri");
    return;
  }
  if (SCHEME_PATTERN.test(uri) || uri.startsWith("//")) throw importError("unsafe-resource-uri");
  resolver.fileForUri(uri);
}

interface ParsedImport {
  readonly root: THREE.Object3D;
  readonly animations: readonly THREE.AnimationClip[];
}

async function parseGltfImport(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const source = item.format === "gltf"
    ? await readUtf8(item.primary, signal)
    : await readBytes(item.primary, signal);
  throwIfAborted(signal);
  if (typeof source === "string") {
    let root: unknown;
    try {
      root = JSON.parse(source) as unknown;
    } catch {
      throw importError("parse-failed");
    }
    for (const uri of gltfResourceUris(root)) validateSelectedResourceUri(uri, resolver);
  }
  const tracked = await createTrackedLoadingManager(resolver);
  throwIfAborted(signal);
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  throwIfAborted(signal);
  const loader = new GLTFLoader(tracked.manager);
  let parsedRoot: THREE.Object3D | null = null;
  try {
    const gltf = await new Promise<import("three/examples/jsm/loaders/GLTFLoader.js").GLTF>((resolve, reject) => {
      loader.parse(source, "", resolve, () => reject(importError("parse-failed")));
    });
    throwIfAborted(signal);
    if (!gltf.scene) throw importError("parse-failed");
    parsedRoot = gltf.scene;
    await tracked.waitForIdle();
    throwIfAborted(signal);
    return { root: parsedRoot, animations: gltf.animations };
  } catch (error) {
    if (parsedRoot) disposeStudioBg3dThreeResources(parsedRoot);
    throw error;
  }
}

function objMaterialLibraries(text: string): readonly string[] {
  const result: string[] = [];
  for (const line of text.split(/\r?\n/gu)) {
    const match = /^\s*mtllib\s+(.+?)\s*$/iu.exec(line);
    if (!match) continue;
    const reference = match[1].trim();
    if (!reference || SCHEME_PATTERN.test(reference) || reference.startsWith("//")) {
      throw importError("unsafe-resource-uri");
    }
    result.push(reference);
  }
  return result;
}

async function parseObjImport(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const text = await readUtf8(item.primary, signal);
  const tracked = await createTrackedLoadingManager(resolver);
  throwIfAborted(signal);
  const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
  throwIfAborted(signal);
  const loader = new OBJLoader(tracked.manager);
  const materialLibraries = objMaterialLibraries(text);
  if (materialLibraries.length > 0) {
    const { MTLLoader } = await import("three/examples/jsm/loaders/MTLLoader.js");
    throwIfAborted(signal);
    const materialTexts = await Promise.all(
      materialLibraries.map((uri) => readUtf8(resolver.fileForUri(uri), signal)),
    );
    throwIfAborted(signal);
    const materials = new MTLLoader(tracked.manager).parse(materialTexts.join("\n"), "");
    materials.preload();
    loader.setMaterials(materials);
  }
  let root: THREE.Object3D | null = null;
  try {
    root = loader.parse(text);
    throwIfAborted(signal);
    await tracked.waitForIdle();
    throwIfAborted(signal);
    return { root, animations: [] };
  } catch (error) {
    if (root) disposeStudioBg3dThreeResources(root);
    throw error;
  }
}

async function parseFbxImport(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const bytes = await readBytes(item.primary, signal);
  const tracked = await createTrackedLoadingManager(resolver);
  throwIfAborted(signal);
  const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
  throwIfAborted(signal);
  let root: THREE.Group | null = null;
  try {
    root = new FBXLoader(tracked.manager).parse(bytes, "");
    throwIfAborted(signal);
    await tracked.waitForIdle();
    throwIfAborted(signal);
    return { root, animations: root.animations };
  } catch (error) {
    if (root) disposeStudioBg3dThreeResources(root);
    throw error;
  }
}

async function parseDaeImport(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const text = await readUtf8(item.primary, signal);
  const tracked = await createTrackedLoadingManager(resolver);
  throwIfAborted(signal);
  const { ColladaLoader } = await import("three/examples/jsm/loaders/ColladaLoader.js");
  throwIfAborted(signal);
  let root: THREE.Object3D | null = null;
  try {
    const collada = new ColladaLoader(tracked.manager).parse(text, "");
    throwIfAborted(signal);
    const scene = collada?.scene;
    if (!scene) throw importError("parse-failed");
    root = scene;
    await tracked.waitForIdle();
    throwIfAborted(signal);
    return { root, animations: scene.animations };
  } catch (error) {
    if (root) disposeStudioBg3dThreeResources(root);
    throw error;
  }
}

async function parseStlImport(
  item: StudioBg3dImportPlanItem,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const bytes = await readBytes(item.primary, signal);
  const [{ Mesh, MeshStandardMaterial }, { STLLoader }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/STLLoader.js"),
  ]);
  throwIfAborted(signal);
  let geometry: THREE.BufferGeometry;
  try {
    geometry = new STLLoader().parse(bytes);
  } catch {
    throw importError("parse-failed");
  }
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  if (signal?.aborted) {
    geometry.dispose();
    throw importError("aborted");
  }
  const root = new Mesh(geometry, new MeshStandardMaterial({ color: 0xb8b8c2 }));
  root.name = modelBaseName(item.primaryPath);
  return { root, animations: [] };
}

async function parsePlyImport(
  item: StudioBg3dImportPlanItem,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const bytes = await readBytes(item.primary, signal);
  const [{ Mesh, MeshStandardMaterial, Points, PointsMaterial }, { PLYLoader }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/PLYLoader.js"),
  ]);
  throwIfAborted(signal);
  let geometry: THREE.BufferGeometry;
  try {
    geometry = new PLYLoader().parse(bytes);
  } catch {
    throw importError("parse-failed");
  }
  if (signal?.aborted) {
    geometry.dispose();
    throw importError("aborted");
  }
  const hasVertexColors = Boolean(geometry.getAttribute("color"));
  const hasMeshTopology = Boolean(geometry.index || geometry.getAttribute("normal"));
  if (hasMeshTopology) {
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    const root = new Mesh(geometry, new MeshStandardMaterial({
      color: 0xb8b8c2,
      vertexColors: hasVertexColors,
    }));
    root.name = modelBaseName(item.primaryPath);
    return { root, animations: [] };
  }
  const root = new Points(geometry, new PointsMaterial({
    color: 0xb8b8c2,
    size: 0.01,
    sizeAttenuation: true,
    vertexColors: hasVertexColors,
  }));
  root.name = modelBaseName(item.primaryPath);
  return { root, animations: [] };
}

async function parse3dsImport(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const bytes = await readBytes(item.primary, signal);
  const tracked = await createTrackedLoadingManager(resolver);
  throwIfAborted(signal);
  const { TDSLoader } = await import("three/examples/jsm/loaders/TDSLoader.js");
  throwIfAborted(signal);
  let root: THREE.Group | null = null;
  try {
    root = new TDSLoader(tracked.manager).parse(bytes, "");
    throwIfAborted(signal);
    await tracked.waitForIdle();
    throwIfAborted(signal);
    return { root, animations: root.animations };
  } catch (error) {
    if (root) disposeStudioBg3dThreeResources(root);
    throw error;
  }
}

async function parsePlanItem(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  switch (item.format) {
    case "gltf":
      return parseGltfImport(item, resolver, signal);
    case "obj":
      return parseObjImport(item, resolver, signal);
    case "fbx":
      return parseFbxImport(item, resolver, signal);
    case "dae":
      return parseDaeImport(item, resolver, signal);
    case "stl":
      return parseStlImport(item, signal);
    case "ply":
      return parsePlyImport(item, signal);
    case "3ds":
      return parse3dsImport(item, resolver, signal);
    case "glb":
      throw importError("parse-failed");
  }
}

async function exportParsedImportToGlb(
  parsed: ParsedImport,
  sourcePath: string,
  signal?: AbortSignal,
): Promise<Bg3dModelUploadSource> {
  throwIfAborted(signal);
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  throwIfAborted(signal);
  parsed.root.updateMatrixWorld(true);
  let exported: ArrayBuffer | object;
  try {
    exported = await new GLTFExporter().parseAsync(parsed.root, {
      animations: [...parsed.animations],
      binary: true,
      includeCustomExtensions: true,
      maxTextureSize: 8192,
      onlyVisible: false,
      truncateDrawRange: true,
    });
  } catch {
    throwIfAborted(signal);
    throw importError("export-failed");
  }
  throwIfAborted(signal);
  if (!(exported instanceof ArrayBuffer)) throw importError("export-failed");
  if (exported.byteLength <= 0) throw importError("export-failed");
  if (exported.byteLength > STUDIO_BG3D_IMPORT_MAX_FILE_BYTES) throw importError("output-too-large");
  const canonicalBytes = exported.slice(0);
  const name = `${modelBaseName(sourcePath)}.glb`;
  return Object.freeze({
    name,
    size: canonicalBytes.byteLength,
    type: "model/gltf-binary",
    async arrayBuffer() {
      return canonicalBytes.slice(0);
    },
  });
}

async function convertPlanItem(
  item: StudioBg3dImportPlanItem,
  resources: ReadonlyMap<string, StudioBg3dImportFile>,
  signal: AbortSignal | undefined,
  onBeforeExport?: () => void,
): Promise<Bg3dModelUploadSource> {
  throwIfAborted(signal);
  if (item.format === "glb") return item.primary;
  const resolver = new LocalResourceResolver(resources, item.primaryPath);
  let parsed: ParsedImport | null = null;
  try {
    parsed = await parsePlanItem(item, resolver, signal);
    throwIfAborted(signal);
    onBeforeExport?.();
    throwIfAborted(signal);
    const exported = await exportParsedImportToGlb(parsed, item.primaryPath, signal);
    throwIfAborted(signal);
    return exported;
  } catch (error) {
    throwIfAborted(signal);
    if (error instanceof StudioBg3dModelImportError) throw error;
    throw importError("parse-failed");
  } finally {
    resolver.dispose();
    if (parsed) disposeStudioBg3dThreeResources(parsed.root);
  }
}

/**
 * Converts heterogeneous user files into the sole trusted persistence format: self-contained GLB.
 * GLB inputs pass through without copying here; every output still enters the existing hash,
 * container, extension, decoded-memory, and renderer-admission validation boundary afterwards.
 */
export async function convertStudioBg3dModelFilesToGlb(
  input: readonly StudioBg3dImportFile[],
  options: StudioBg3dModelImportOptions = {},
): Promise<readonly Bg3dModelUploadSource[]> {
  throwIfAborted(options.signal);
  const plan = planStudioBg3dModelImports(input);
  options.onProgress?.({
    stage: "planning",
    completedModels: 0,
    totalModels: plan.items.length,
    sourceName: "",
  });
  throwIfAborted(options.signal);
  const converted: Bg3dModelUploadSource[] = [];
  let convertedOutputBytes = 0;
  if (plan.items.some((item) => item.format !== "glb")) {
    await preflightCompanionImageMemory(plan.resources, options.signal);
    throwIfAborted(options.signal);
  }
  for (let index = 0; index < plan.items.length; index += 1) {
    const item = plan.items[index];
    const progress = (stage: StudioBg3dImportProgressStage) => options.onProgress?.({
      stage,
      completedModels: index,
      totalModels: plan.items.length,
      sourceName: item.primary.name,
    });
    progress("reading");
    throwIfAborted(options.signal);
    if (
      item.format === "glb"
      && item.primary.size > STUDIO_BG3D_IMPORT_MAX_OUTPUT_TOTAL_BYTES - convertedOutputBytes
    ) {
      throw importError("output-total-too-large");
    }
    if (item.format !== "glb") progress("parsing");
    throwIfAborted(options.signal);
    const result = await convertPlanItem(
      item,
      plan.resources,
      options.signal,
      item.format === "glb" ? undefined : () => progress("exporting"),
    );
    throwIfAborted(options.signal);
    if (result.size > STUDIO_BG3D_IMPORT_MAX_OUTPUT_TOTAL_BYTES - convertedOutputBytes) {
      throw importError("output-total-too-large");
    }
    convertedOutputBytes += result.size;
    converted.push(result);
    options.onProgress?.({
      stage: "ready",
      completedModels: index + 1,
      totalModels: plan.items.length,
      sourceName: item.primary.name,
    });
    throwIfAborted(options.signal);
  }
  throwIfAborted(options.signal);
  return Object.freeze(converted);
}
