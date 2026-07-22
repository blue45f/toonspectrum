import {
  DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  STUDIO_BG3D_GLB_MAX_BYTES,
  STUDIO_BG3D_GLB_MIME_TYPE,
  type StudioBg3dGlbBudgetProfiles,
  type StudioBg3dGlbDigest,
  type StudioBg3dGlbFailureCode,
  type StudioBg3dGlbMetrics,
  type StudioBg3dGlbProfile,
  type StudioBg3dGlbValidationSuccess,
} from "./studio-bg3d-glb-validation";
import {
  StudioBg3dValidationWorkerError,
  validateStudioBg3dGlbOffMainThread,
} from "./studio-bg3d-glb-validation-worker-client";
import { STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS } from "./studio-bg3d-meshopt";
import {
  inspectStudioBg3dModelThumbnailDataUrl,
  normalizeStudioBg3dModelThumbnailDataUrl,
} from "./studio-bg3d-model-thumbnail-data";
import {
  STUDIO_BG3D_GLB_MIME,
  type StudioBg3dAttachmentRights,
  type StudioBg3dAttachmentSource,
  type StudioBg3dModelAttachment,
  type StudioBg3dRightsStatus,
} from "./studio-bg3d-scene-document";

const DB_NAME = "toonspectrum-studio-bg3d-model-library";
export const BG3D_MODEL_LIBRARY_DB_VERSION = 2;
export const BG3D_MODEL_STORAGE_VERSION = 2 as const;
export const BG3D_MODEL_VALIDATION_VERSION = 1 as const;
/** 12-byte header + 8-byte JSON chunk header + the smallest 4-byte-aligned JSON object. */
export const BG3D_MODEL_MIN_GLB_BYTES = 24;

const MODEL_STORE = "models";
const THUMBNAIL_STORE = "thumbnails";
const MODEL_HASH_INDEX = "contentHash";
const MAX_NAME_LENGTH = 160;
const MAX_ATTACHMENT_BASE_NAME_LENGTH = 116;
const MAX_RIGHTS_TEXT_LENGTH = 160;
const HASH_PATTERN = /^(?:sha256:)?([a-f0-9]{64})$/iu;
const SCENE_ATTACHMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;
const STORAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;
const EXTERNAL_REFERENCE_PATTERN = /(?:\b(?:blob|data|file|https?):|:\/\/|\bwww\.)/iu;
const SENSITIVE_REFERENCE_PATTERN =
  /(?:\b(?:api[-_ ]?key|access[-_ ]?token|secret|password)\b|(?:^|\s)sk-[A-Za-z0-9_-]{8,})/iu;
const FORBIDDEN_SCENE_IDS = new Set(["constructor", "prototype", "__proto__"]);
const SAFE_UPLOAD_MIME_TYPES = new Set(["", STUDIO_BG3D_GLB_MIME_TYPE, "application/octet-stream"]);
const RIGHTS_STATUSES = new Set<StudioBg3dRightsStatus>(["owned", "licensed", "public-domain", "unknown"]);
const GLB_METRIC_KEYS: readonly (keyof StudioBg3dGlbMetrics)[] = [
  "byteSize",
  "jsonByteSize",
  "binByteSize",
  "nodes",
  "meshes",
  "meshPrimitives",
  "drawCalls",
  "triangles",
  "materials",
  "textures",
  "images",
  "imageBytes",
  "estimatedDecodedImageBytes",
  "maxImageDimension",
  "undeterminedImageDimensions",
  "lights",
];
const STORED_METADATA_FAILURE_CODES = new Set<StudioBg3dGlbFailureCode>([
  "invalid-declared-metadata",
  "mime-type-mismatch",
  "byte-size-mismatch",
  "hash-mismatch",
]);

export const BG3D_MODEL_VERIFIED_STATUS_MESSAGE = "GLB 안전 검사와 무결성 확인을 완료했습니다.";
export const BG3D_MODEL_LEGACY_GLB_STATUS_MESSAGE =
  "기존 GLB 모델입니다. 사용하려면 안전 검사를 거쳐 다시 등록해 주세요.";
export const BG3D_MODEL_LEGACY_EXTERNAL_STATUS_MESSAGE =
  "기존 GLTF·OBJ 모델은 사용할 수 없습니다. 모든 리소스를 포함한 GLB로 다시 내보내 등록해 주세요.";

export const DEFAULT_BG3D_MODEL_RIGHTS: StudioBg3dAttachmentRights = Object.freeze({
  status: "unknown",
  commercialUse: false,
  attributionRequired: false,
});

export type Bg3dModelFormat = "glb" | "gltf" | "obj";
export type Bg3dModelLibraryStatus = "verified" | "legacy-reimport-required";

/** V1 records remain readable and are never deleted during the V2 database upgrade. */
export interface Bg3dLegacyStoredRecord {
  readonly id: string;
  readonly name: string;
  readonly format: Bg3dModelFormat;
  readonly blob: Blob;
  readonly thumbnail: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly storageVersion?: 1;
}

/**
 * A renderer may consume only this V2 record shape. `id` is a private local persistence key and
 * must never be copied into a Studio scene document; use createStudioBg3dModelAttachment instead.
 */
export interface Bg3dVerifiedStoredRecord {
  readonly id: string;
  readonly storageVersion: typeof BG3D_MODEL_STORAGE_VERSION;
  readonly name: string;
  readonly format: "glb";
  readonly blob: Blob;
  /** Thumbnails are stored in the separate thumbnail store, never alongside verified model bytes. */
  readonly thumbnail: null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly contentHash: `sha256:${string}`;
  readonly byteSize: number;
  readonly mime: typeof STUDIO_BG3D_GLB_MIME;
  readonly validationVersion: typeof BG3D_MODEL_VALIDATION_VERSION;
  readonly validatedAt: number;
  readonly validatorProfile: StudioBg3dGlbProfile;
  readonly validatorMetrics: StudioBg3dGlbMetrics;
  readonly rights: StudioBg3dAttachmentRights;
}

export type Bg3dModelStoredRecord = Bg3dLegacyStoredRecord | Bg3dVerifiedStoredRecord;

export interface Bg3dModelLibraryEntry {
  /** Local library row identifier. It is not a scene attachment identifier. */
  readonly id: string;
  readonly name: string;
  readonly format: Bg3dModelFormat;
  readonly source: "sample" | "indexed-db";
  readonly thumbnail: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: Bg3dModelLibraryStatus;
  readonly canUse: boolean;
  readonly statusMessage: string;
  readonly contentHash: `sha256:${string}` | null;
  readonly byteSize: number | null;
  readonly commercialUse: boolean;
}

export interface SampleBg3dModel {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly format: Bg3dModelFormat;
}

interface Bg3dModelThumbnailRecord {
  readonly id: string;
  readonly thumbnail: string;
  readonly updatedAt: number;
  /** Monotonic operation fence. Legacy V2 rows without it are treated as revision zero. */
  readonly captureRevision?: number;
}

export interface Bg3dModelThumbnailSaveOptions {
  readonly captureRevision?: number;
  readonly now?: number;
}

let lastThumbnailCaptureRevision = 0;

export interface Bg3dModelUploadSource {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface Bg3dModelImportItem {
  readonly file: Bg3dModelUploadSource;
  readonly rights?: Partial<StudioBg3dAttachmentRights>;
  /** Used by archive/import callers that already have trusted manifest metadata. */
  readonly expectedSha256?: string;
}

export interface Bg3dModelVerificationOptions {
  readonly profile?: StudioBg3dGlbProfile;
  readonly budgets?: StudioBg3dGlbBudgetProfiles;
  readonly cumulativeUsedBytes?: number;
  readonly maximumCumulativeBytes?: number;
  readonly supportedRequiredExtensions?: readonly string[];
  readonly digest?: StudioBg3dGlbDigest;
  /** Cancels worker validation before any IndexedDB write transaction starts. */
  readonly signal?: AbortSignal;
  /** Deterministic clocks/IDs are useful to importers and tests; neither value enters scene docs. */
  readonly now?: number;
  readonly idFactory?: () => string;
}

export type Bg3dModelAdmissionOptions = Omit<Bg3dModelVerificationOptions, "now" | "idFactory">;

export type Bg3dModelLibraryErrorCode =
  | "unsupported-format"
  | "invalid-file"
  | "invalid-mime"
  | "file-too-large"
  | "digest-unavailable"
  | "hash-mismatch"
  | "validation-failed"
  | "admission-failed"
  | "stored-metadata-mismatch"
  | "rights-conflict"
  | "storage-id-conflict"
  | "storage-unavailable"
  | "invalid-attachment";

const ERROR_MESSAGES: Readonly<Record<Bg3dModelLibraryErrorCode, string>> = Object.freeze({
  "unsupported-format": "안전한 GLB 2.0 파일만 등록할 수 있습니다. GLB로 다시 내보내 주세요.",
  "invalid-file": "3D 모델 파일을 읽을 수 없습니다. 원본 GLB 파일을 다시 선택해 주세요.",
  "invalid-mime": "선택한 파일의 형식 정보가 GLB와 일치하지 않습니다. 원본 파일을 다시 선택해 주세요.",
  "file-too-large": "3D 모델은 파일 하나당 최대 100MiB까지 등록할 수 있습니다. 모델을 최적화해 주세요.",
  "digest-unavailable": "이 환경에서는 3D 모델 무결성 검사를 사용할 수 없습니다. 최신 브라우저에서 다시 시도해 주세요.",
  "hash-mismatch": "3D 모델의 무결성 정보가 실제 파일과 다릅니다. 신뢰할 수 있는 원본을 다시 등록해 주세요.",
  "validation-failed": "3D 모델 안전 검사를 통과하지 못했습니다. 모든 리소스를 포함한 GLB 2.0으로 다시 내보내 주세요.",
  "admission-failed": "저장된 3D 모델을 안전하게 불러올 수 없습니다. 신뢰할 수 있는 원본을 다시 등록해 주세요.",
  "stored-metadata-mismatch": "저장된 3D 모델의 파일과 무결성 정보가 일치하지 않습니다. 원본 GLB를 다시 등록해 주세요.",
  "rights-conflict": "같은 3D 모델에 서로 다른 이용 권리가 선언되었습니다. 라이선스 정보를 확인해 주세요.",
  "storage-id-conflict": "3D 모델 저장 식별자가 기존 자산과 충돌했습니다. 다시 등록해 주세요.",
  "storage-unavailable": "이 브라우저에서는 검증된 3D 모델 라이브러리를 사용할 수 없습니다.",
  "invalid-attachment": "3D 모델을 장면에 연결할 수 없습니다. 모델을 다시 등록해 주세요.",
});

export class Bg3dModelLibraryError extends Error {
  readonly code: Bg3dModelLibraryErrorCode;
  readonly validationCode?: StudioBg3dGlbFailureCode;

  constructor(code: Bg3dModelLibraryErrorCode, validationCode?: StudioBg3dGlbFailureCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "Bg3dModelLibraryError";
    this.code = code;
    this.validationCode = validationCode;
  }
}

// Bundled sample assets remain intentionally empty until both their binaries and commercial rights
// have been audited. The types stay in place so a future audited bundle does not alter callers.
export const SAMPLE_BG3D_MODELS: SampleBg3dModel[] = [];
export const SAMPLE_BG3D_MODEL_ENTRIES: Bg3dModelLibraryEntry[] = SAMPLE_BG3D_MODELS.map((sample) => ({
  id: sample.id,
  name: sample.name,
  format: sample.format,
  source: "sample",
  thumbnail: null,
  createdAt: 0,
  updatedAt: 0,
  status: "legacy-reimport-required",
  canUse: false,
  statusMessage: BG3D_MODEL_LEGACY_GLB_STATUS_MESSAGE,
  contentHash: null,
  byteSize: null,
  commercialUse: false,
}));

/** Legacy detection stays broad so V1 records can be classified without deleting them. */
export function detectBg3dModelFormat(fileName: string): Bg3dModelFormat | null {
  const match = /\.(glb|gltf|obj)$/iu.exec(fileName.trim());
  return match ? (match[1].toLowerCase() as Bg3dModelFormat) : null;
}

export function canonicalizeBg3dModelHash(value: string): `sha256:${string}` | null {
  const match = HASH_PATTERN.exec(value.trim());
  return match ? `sha256:${match[1].toLowerCase()}` : null;
}

function safeText(value: unknown, maximumLength: number, rejectExternalReference = false): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  })
    .join("")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ");
  const result = Array.from(normalized).slice(0, maximumLength).join("").trim();
  if (
    !result ||
    (rejectExternalReference &&
      (EXTERNAL_REFERENCE_PATTERN.test(result) || SENSITIVE_REFERENCE_PATTERN.test(result)))
  ) {
    return undefined;
  }
  return result;
}

export function normalizeBg3dModelRights(
  value?: Partial<StudioBg3dAttachmentRights> | null,
): StudioBg3dAttachmentRights {
  const status = value?.status && RIGHTS_STATUSES.has(value.status) ? value.status : "unknown";
  const attribution = safeText(value?.attribution, MAX_RIGHTS_TEXT_LENGTH, true);
  const licenseName = safeText(value?.licenseName, MAX_RIGHTS_TEXT_LENGTH, true);
  const attributionRequired = value?.attributionRequired === true;
  if ((attributionRequired && !attribution) || (status === "licensed" && !licenseName)) {
    return DEFAULT_BG3D_MODEL_RIGHTS;
  }
  return Object.freeze({
    status,
    commercialUse: status === "unknown" ? false : value?.commercialUse === true,
    attributionRequired,
    ...(attribution ? { attribution } : {}),
    ...(licenseName ? { licenseName } : {}),
  });
}

function normalizeModelName(fileName: string): string {
  const withoutExtension = fileName
    .trim()
    .replace(/\.(glb|gltf|obj)$/iu, "")
    .replace(/[\\/]/gu, " ")
    .trim();
  return safeText(withoutExtension, MAX_NAME_LENGTH, true) ?? "3D 모델";
}

function attachmentFileName(modelName: string): string {
  const safeBaseName = safeText(normalizeModelName(modelName), MAX_ATTACHMENT_BASE_NAME_LENGTH, true) ?? "3D 모델";
  return `${safeBaseName}.glb`;
}

function createOpaqueId(prefix: "bg3d-storage" | "bg3d-attachment"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  // Non-security identifier fallback for older local runtimes.
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; // NOSONAR S2245
}

function createStorageId(): string {
  return createOpaqueId("bg3d-storage");
}

function isSafeTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSafeThumbnailCaptureRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isSafeBg3dModelStorageId(value: unknown): value is string {
  return Boolean(
    typeof value === "string" &&
      STORAGE_ID_PATTERN.test(value) &&
      !FORBIDDEN_SCENE_IDS.has(value.toLowerCase()) &&
      !SENSITIVE_REFERENCE_PATTERN.test(value),
  );
}

/**
 * Creates a wall-clock-prefixed fence while remaining monotonic within this realm. Equal fences
 * from two tabs are allowed: IndexedDB serializes their read/write transactions, so the later
 * transaction remains authoritative instead of being discarded arbitrarily.
 */
export function createBg3dModelThumbnailCaptureRevision(now = Date.now()): number {
  if (!isSafeTimestamp(now) || now > Math.floor(Number.MAX_SAFE_INTEGER / 1_024)) {
    throw createLibraryError("invalid-file");
  }
  const clockRevision = now * 1_024;
  lastThumbnailCaptureRevision = Math.max(lastThumbnailCaptureRevision + 1, clockRevision);
  return lastThumbnailCaptureRevision;
}

function readSafeThumbnailRecord(
  value: unknown,
  expectedId?: string,
): (Bg3dModelThumbnailRecord & { readonly thumbnail: string }) | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<Bg3dModelThumbnailRecord>;
  if (
    !isSafeBg3dModelStorageId(record.id)
    || (expectedId !== undefined && record.id !== expectedId)
    || !isSafeTimestamp(record.updatedAt)
    || (record.captureRevision !== undefined && !isSafeThumbnailCaptureRevision(record.captureRevision))
  ) return null;
  const thumbnail = normalizeStudioBg3dModelThumbnailDataUrl(record.thumbnail);
  return thumbnail ? { ...record, id: record.id, thumbnail, updatedAt: record.updatedAt } : null;
}

function hasSafeMetrics(value: unknown): value is StudioBg3dGlbMetrics {
  if (!value || typeof value !== "object") return false;
  const metrics = value as Partial<Record<keyof StudioBg3dGlbMetrics, unknown>>;
  return GLB_METRIC_KEYS.every(
    (key) => typeof metrics[key] === "number" && Number.isSafeInteger(metrics[key]) && metrics[key] >= 0,
  );
}

function metricsMatch(left: StudioBg3dGlbMetrics, right: StudioBg3dGlbMetrics): boolean {
  return GLB_METRIC_KEYS.every((key) => left[key] === right[key]);
}

function hasSafeRights(value: unknown): value is StudioBg3dAttachmentRights {
  if (!value || typeof value !== "object") return false;
  const rights = value as Partial<StudioBg3dAttachmentRights>;
  const attribution = safeText(rights.attribution, MAX_RIGHTS_TEXT_LENGTH, true);
  const licenseName = safeText(rights.licenseName, MAX_RIGHTS_TEXT_LENGTH, true);
  return Boolean(
    rights.status &&
      RIGHTS_STATUSES.has(rights.status) &&
      typeof rights.commercialUse === "boolean" &&
      typeof rights.attributionRequired === "boolean" &&
      (rights.status !== "unknown" || rights.commercialUse === false) &&
      (!rights.attributionRequired || attribution) &&
      (rights.attribution === undefined || rights.attribution === attribution) &&
      (rights.status !== "licensed" || licenseName) &&
      (rights.licenseName === undefined || rights.licenseName === licenseName),
  );
}

export function isVerifiedBg3dModelRecord(value: unknown): value is Bg3dVerifiedStoredRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Bg3dVerifiedStoredRecord>;
  return Boolean(
    record.storageVersion === BG3D_MODEL_STORAGE_VERSION &&
      isSafeBg3dModelStorageId(record.id) &&
      typeof record.name === "string" &&
      record.format === "glb" &&
      record.blob instanceof Blob &&
      record.thumbnail === null &&
      isSafeTimestamp(record.createdAt) &&
      isSafeTimestamp(record.updatedAt) &&
      canonicalizeBg3dModelHash(record.contentHash ?? "") === record.contentHash &&
      typeof record.byteSize === "number" &&
      Number.isSafeInteger(record.byteSize) &&
      record.byteSize >= BG3D_MODEL_MIN_GLB_BYTES &&
      record.byteSize <= STUDIO_BG3D_GLB_MAX_BYTES &&
      record.blob.size === record.byteSize &&
      record.mime === STUDIO_BG3D_GLB_MIME &&
      record.blob.type === STUDIO_BG3D_GLB_MIME_TYPE &&
      record.validationVersion === BG3D_MODEL_VALIDATION_VERSION &&
      isSafeTimestamp(record.validatedAt) &&
      (record.validatorProfile === "mobile" || record.validatorProfile === "desktop") &&
      hasSafeMetrics(record.validatorMetrics) &&
      record.validatorMetrics.byteSize === record.byteSize &&
      hasSafeRights(record.rights),
  );
}

function isBaseStoredRecord(value: unknown): value is Bg3dModelStoredRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Bg3dLegacyStoredRecord>;
  return Boolean(
    typeof record.id === "string" &&
      record.id.length > 0 &&
      typeof record.name === "string" &&
      (record.format === "glb" || record.format === "gltf" || record.format === "obj") &&
      record.blob instanceof Blob &&
      isSafeTimestamp(record.createdAt) &&
      isSafeTimestamp(record.updatedAt),
  );
}

function isSampleBg3dModelId(id: string): boolean {
  return SAMPLE_BG3D_MODELS.some((sample) => sample.id === id);
}

function createLibraryError(code: Bg3dModelLibraryErrorCode, validationCode?: StudioBg3dGlbFailureCode) {
  return new Bg3dModelLibraryError(code, validationCode);
}

function createIndexedDbError() {
  return createLibraryError("storage-unavailable");
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(createIndexedDbError());
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(createIndexedDbError());
    transaction.onabort = () => reject(createIndexedDbError());
  });
}

function openLibraryDatabase(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) return Promise.reject(createIndexedDbError());

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, BG3D_MODEL_LIBRARY_DB_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      const modelStore = database.objectStoreNames.contains(MODEL_STORE)
        ? request.transaction?.objectStore(MODEL_STORE)
        : database.createObjectStore(MODEL_STORE, { keyPath: "id" });
      if (modelStore && !modelStore.indexNames.contains(MODEL_HASH_INDEX)) {
        // V1 records have no contentHash and remain untouched/listed after this index-only migration.
        modelStore.createIndex(MODEL_HASH_INDEX, "contentHash", { unique: true });
      }
      if (!database.objectStoreNames.contains(THUMBNAIL_STORE)) {
        database.createObjectStore(THUMBNAIL_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
      } else {
        resolve(request.result);
      }
    };
    request.onerror = () => reject(createIndexedDbError());
    request.onblocked = () => {
      blocked = true;
      reject(createIndexedDbError());
    };
  });
}

async function withDatabase<T>(callback: (database: IDBDatabase) => Promise<T>): Promise<T> {
  const database = await openLibraryDatabase();
  try {
    return await callback(database);
  } catch (error) {
    if (error instanceof Bg3dModelLibraryError) throw error;
    throw createIndexedDbError();
  } finally {
    database.close();
  }
}

async function getRawStoredBg3dModel(id: string): Promise<Bg3dModelStoredRecord | null> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(MODEL_STORE, "readonly");
    const done = transactionDone(transaction);
    const value = await requestResult<unknown>(transaction.objectStore(MODEL_STORE).get(id));
    await done;
    return isBaseStoredRecord(value) ? value : null;
  });
}

function digestToHex(value: ArrayBuffer | Uint8Array | string): string | null {
  if (typeof value === "string") return HASH_PATTERN.exec(value.trim())?.[1].toLowerCase() ?? null;
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (bytes.byteLength !== 32) return null;
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function calculateSha256(bytes: Uint8Array, digest?: StudioBg3dGlbDigest): Promise<`sha256:${string}`> {
  let value: ArrayBuffer | Uint8Array | string;
  try {
    if (digest) {
      value = await digest(Uint8Array.from(bytes));
    } else {
      if (typeof crypto === "undefined" || !crypto.subtle) throw createLibraryError("digest-unavailable");
      value = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
    }
  } catch (error) {
    if (error instanceof Bg3dModelLibraryError) throw error;
    throw createLibraryError("digest-unavailable");
  }
  const hex = digestToHex(value);
  if (!hex) throw createLibraryError("digest-unavailable");
  return `sha256:${hex}`;
}

function normalizeImportItem(input: Bg3dModelUploadSource | Bg3dModelImportItem): Bg3dModelImportItem {
  if (!input || typeof input !== "object") throw createLibraryError("invalid-file");
  return "file" in input ? input : { file: input };
}

function validateUploadMetadata(file: Bg3dModelUploadSource): void {
  if (
    !file ||
    typeof file.name !== "string" ||
    typeof file.type !== "string" ||
    typeof file.size !== "number" ||
    !Number.isSafeInteger(file.size) ||
    file.size < 0 ||
    typeof file.arrayBuffer !== "function"
  ) {
    throw createLibraryError("invalid-file");
  }
  if (detectBg3dModelFormat(file.name) !== "glb") throw createLibraryError("unsupported-format");
  if (!SAFE_UPLOAD_MIME_TYPES.has(file.type.trim().toLowerCase())) throw createLibraryError("invalid-mime");
  // This guard must run before arrayBuffer(), so an oversized Blob is never eagerly materialized.
  if (file.size > STUDIO_BG3D_GLB_MAX_BYTES) throw createLibraryError("file-too-large");
}

interface Bg3dDeclaredByteAdmission {
  readonly profile: StudioBg3dGlbProfile;
  readonly budgets: StudioBg3dGlbBudgetProfiles;
  readonly cumulativeUsedBytes: number;
  readonly maximumCumulativeBytes: number;
}

/**
 * Applies the byte-only subset of the GLB validation policy to trusted Blob/File metadata before
 * materializing or hashing its bytes. A within-batch item without an expected hash cannot yet be
 * distinguished from a previously counted duplicate, so only that cumulative check remains at the
 * post-digest validator boundary; the per-model profile ceiling is always decidable here.
 */
function assertDeclaredBg3dModelByteAdmission(
  item: Bg3dModelImportItem,
  options: Bg3dModelVerificationOptions,
  alreadyCountedHashes: ReadonlySet<string>,
): Bg3dDeclaredByteAdmission {
  const profile = options.profile ?? "desktop";
  const budgets = options.budgets ?? DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES;
  const maxModelBytes = budgets?.[profile]?.complexity?.maxModelBytes;
  const cumulativeUsedBytes = options.cumulativeUsedBytes ?? 0;
  const maximumCumulativeBytes = options.maximumCumulativeBytes ?? STUDIO_BG3D_GLB_MAX_BYTES;
  if (
    typeof maxModelBytes !== "number"
    || !Number.isSafeInteger(maxModelBytes)
    || maxModelBytes <= 0
    || !Number.isSafeInteger(cumulativeUsedBytes)
    || cumulativeUsedBytes < 0
    || !Number.isSafeInteger(maximumCumulativeBytes)
    || maximumCumulativeBytes <= 0
    || cumulativeUsedBytes > maximumCumulativeBytes
  ) {
    throw createLibraryError("validation-failed", "invalid-options");
  }
  if (item.file.size > maxModelBytes) {
    throw createLibraryError("validation-failed", "model-byte-budget-exceeded");
  }

  const expectedHash = item.expectedSha256 === undefined
    ? null
    : canonicalizeBg3dModelHash(item.expectedSha256);
  const cumulativeCanBeDecidedBeforeDigest = alreadyCountedHashes.size === 0 || expectedHash !== null;
  if (cumulativeCanBeDecidedBeforeDigest) {
    const validationUsedBytes = expectedHash && alreadyCountedHashes.has(expectedHash)
      ? Math.max(0, cumulativeUsedBytes - item.file.size)
      : cumulativeUsedBytes;
    if (item.file.size > maximumCumulativeBytes - validationUsedBytes) {
      throw createLibraryError("validation-failed", "cumulative-byte-budget-exceeded");
    }
  }

  return {
    profile,
    budgets,
    cumulativeUsedBytes,
    maximumCumulativeBytes,
  };
}

function resolveNow(now: number | undefined): number {
  const value = now ?? Date.now();
  if (!isSafeTimestamp(value)) throw createLibraryError("invalid-file");
  return value;
}

function throwIfBg3dOperationAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new StudioBg3dValidationWorkerError("aborted");
}

function makeVerifiedBlob(bytes: Uint8Array): Blob {
  const copy = Uint8Array.from(bytes);
  return new Blob([copy.buffer], { type: STUDIO_BG3D_GLB_MIME_TYPE });
}

function freezeMetrics(metrics: StudioBg3dGlbMetrics): StudioBg3dGlbMetrics {
  return Object.freeze({ ...metrics });
}

/**
 * Validates one import without touching IndexedDB. The returned Blob is created exclusively from
 * the validator-owned byte snapshot, never from the caller's mutable buffer.
 */
async function prepareVerifiedBg3dModelRecordInternal(
  input: Bg3dModelUploadSource | Bg3dModelImportItem,
  options: Bg3dModelVerificationOptions = {},
  alreadyCountedHashes: ReadonlySet<string> = new Set(),
): Promise<Bg3dVerifiedStoredRecord> {
  const item = normalizeImportItem(input);
  throwIfBg3dOperationAborted(options.signal);
  validateUploadMetadata(item.file);
  const declaredByteAdmission = assertDeclaredBg3dModelByteAdmission(
    item,
    options,
    alreadyCountedHashes,
  );

  let rawBuffer: ArrayBuffer;
  try {
    rawBuffer = await item.file.arrayBuffer();
  } catch {
    throwIfBg3dOperationAborted(options.signal);
    throw createLibraryError("invalid-file");
  }
  throwIfBg3dOperationAborted(options.signal);
  if (!(rawBuffer instanceof ArrayBuffer)) throw createLibraryError("invalid-file");
  if (rawBuffer.byteLength > STUDIO_BG3D_GLB_MAX_BYTES) throw createLibraryError("file-too-large");
  if (rawBuffer.byteLength !== item.file.size) throw createLibraryError("invalid-file");

  const inputSnapshot = new Uint8Array(rawBuffer.slice(0));
  let computedHash: `sha256:${string}`;
  try {
    computedHash = await calculateSha256(inputSnapshot, options.digest);
  } catch (error) {
    throwIfBg3dOperationAborted(options.signal);
    throw error;
  }
  throwIfBg3dOperationAborted(options.signal);
  if (item.expectedSha256 !== undefined) {
    const expectedHash = canonicalizeBg3dModelHash(item.expectedSha256);
    if (!expectedHash || expectedHash !== computedHash) throw createLibraryError("hash-mismatch");
  }

  const {
    profile,
    budgets,
    cumulativeUsedBytes,
    maximumCumulativeBytes,
  } = declaredByteAdmission;
  const validationUsedBytes = alreadyCountedHashes.has(computedHash)
    ? Math.max(0, cumulativeUsedBytes - inputSnapshot.byteLength)
    : cumulativeUsedBytes;
  const validationOutcome = await validateStudioBg3dGlbOffMainThread(inputSnapshot, {
    declared: {
      byteSize: inputSnapshot.byteLength,
      sha256: computedHash,
      mimeType: STUDIO_BG3D_GLB_MIME_TYPE,
    },
    cumulative: { usedBytes: validationUsedBytes, maximumBytes: maximumCumulativeBytes },
    profile,
    budgets,
    digest: options.digest,
    supportedRequiredExtensions: options.supportedRequiredExtensions
      ?? STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS,
  }, options.signal);
  const validation = validationOutcome.result;
  if (!validation.ok) throw createLibraryError("validation-failed", validation.code);

  const now = resolveNow(options.now);
  let storageId: string;
  try {
    storageId = options.idFactory?.() ?? createStorageId();
  } catch {
    throw createLibraryError("invalid-file");
  }
  if (!isSafeBg3dModelStorageId(storageId)) throw createLibraryError("invalid-file");
  const record: Bg3dVerifiedStoredRecord = {
    id: storageId,
    storageVersion: BG3D_MODEL_STORAGE_VERSION,
    name: normalizeModelName(item.file.name),
    format: "glb",
    blob: makeVerifiedBlob(validation.verifiedBytes),
    thumbnail: null,
    createdAt: now,
    updatedAt: now,
    contentHash: validation.verifiedSha256,
    byteSize: validation.verifiedBytes.byteLength,
    mime: STUDIO_BG3D_GLB_MIME,
    validationVersion: BG3D_MODEL_VALIDATION_VERSION,
    validatedAt: now,
    validatorProfile: validation.profile,
    validatorMetrics: freezeMetrics(validation.metrics),
    rights: normalizeBg3dModelRights(item.rights),
  };
  return Object.freeze(record);
}

export async function prepareVerifiedBg3dModelRecord(
  input: Bg3dModelUploadSource | Bg3dModelImportItem,
  options: Bg3dModelVerificationOptions = {},
): Promise<Bg3dVerifiedStoredRecord> {
  return prepareVerifiedBg3dModelRecordInternal(input, options);
}

/**
 * Synchronous V1 compatibility constructor. It creates an explicitly unverified GLB record only;
 * saveUploadedBg3dModel is the sole supported upload persistence path.
 */
export function createUploadedBg3dModelRecord(
  file: File,
  id = createStorageId(),
  now = Date.now(),
): Bg3dLegacyStoredRecord {
  if (detectBg3dModelFormat(file.name) !== "glb") throw createLibraryError("unsupported-format");
  if (file.size > STUDIO_BG3D_GLB_MAX_BYTES) throw createLibraryError("file-too-large");
  if (!isSafeBg3dModelStorageId(id) || !isSafeTimestamp(now)) throw createLibraryError("invalid-file");
  return {
    id,
    name: normalizeModelName(file.name),
    format: "glb",
    blob: file,
    thumbnail: null,
    createdAt: now,
    updatedAt: now,
    storageVersion: 1,
  };
}

function libraryStatus(record: Bg3dModelStoredRecord): Pick<
  Bg3dModelLibraryEntry,
  "status" | "canUse" | "statusMessage" | "contentHash" | "byteSize" | "commercialUse"
> {
  if (isVerifiedBg3dModelRecord(record)) {
    return {
      status: "verified",
      canUse: true,
      statusMessage: BG3D_MODEL_VERIFIED_STATUS_MESSAGE,
      contentHash: record.contentHash,
      byteSize: record.byteSize,
      commercialUse: record.rights.commercialUse,
    };
  }
  return {
    status: "legacy-reimport-required",
    canUse: false,
    statusMessage:
      record.format === "glb" ? BG3D_MODEL_LEGACY_GLB_STATUS_MESSAGE : BG3D_MODEL_LEGACY_EXTERNAL_STATUS_MESSAGE,
    contentHash: null,
    byteSize: null,
    commercialUse: false,
  };
}

export function withDefaultBg3dModelEntry(
  storedModels: readonly Bg3dModelStoredRecord[],
  thumbnails: Partial<Record<string, string | null>> = {},
): Bg3dModelLibraryEntry[] {
  const sampleEntries = SAMPLE_BG3D_MODEL_ENTRIES.map((entry) => ({
    ...entry,
    thumbnail: normalizeStudioBg3dModelThumbnailDataUrl(thumbnails[entry.id])
      ?? normalizeStudioBg3dModelThumbnailDataUrl(entry.thumbnail),
  }));
  const uploadedEntries = storedModels
    .filter(isBaseStoredRecord)
    .slice()
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map<Bg3dModelLibraryEntry>((record) => ({
      id: record.id,
      name: record.name,
      format: record.format,
      source: "indexed-db",
      thumbnail: normalizeStudioBg3dModelThumbnailDataUrl(thumbnails[record.id])
        ?? normalizeStudioBg3dModelThumbnailDataUrl(record.thumbnail),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...libraryStatus(record),
    }));
  return [...sampleEntries, ...uploadedEntries];
}

export function getDeletableModelIds(entries: readonly Bg3dModelLibraryEntry[]): string[] {
  return entries.filter((entry) => entry.source === "indexed-db").map((entry) => entry.id);
}

export async function listStoredBg3dModels(): Promise<Bg3dModelStoredRecord[]> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(MODEL_STORE, "readonly");
    const done = transactionDone(transaction);
    const values = await requestResult<unknown[]>(transaction.objectStore(MODEL_STORE).getAll());
    await done;
    return values.filter(isBaseStoredRecord);
  });
}

/** Finds a V2 record by its exact canonical content identity, never by a scene or storage key. */
export async function getStoredBg3dModelByHash(hash: string): Promise<Bg3dVerifiedStoredRecord | null> {
  const canonicalHash = canonicalizeBg3dModelHash(hash);
  if (!canonicalHash) return null;
  return withDatabase(async (database) => {
    const transaction = database.transaction(MODEL_STORE, "readonly");
    const done = transactionDone(transaction);
    const value = await requestResult<unknown>(
      transaction.objectStore(MODEL_STORE).index(MODEL_HASH_INDEX).get(canonicalHash),
    );
    await done;
    return isVerifiedBg3dModelRecord(value) ? value : null;
  });
}

function uniqueVerifiedRecords(records: readonly Bg3dVerifiedStoredRecord[]): Bg3dVerifiedStoredRecord[] {
  const byHash = new Map<string, Bg3dVerifiedStoredRecord>();
  for (const record of records) if (!byHash.has(record.contentHash)) byHash.set(record.contentHash, record);
  return [...byHash.values()];
}

function rightsMatch(
  left: StudioBg3dAttachmentRights,
  right: StudioBg3dAttachmentRights,
): boolean {
  return left.status === right.status
    && left.commercialUse === right.commercialUse
    && left.attributionRequired === right.attributionRequired
    && left.attribution === right.attribution
    && left.licenseName === right.licenseName;
}

async function putVerifiedRecordsAtomically(
  records: readonly Bg3dVerifiedStoredRecord[],
): Promise<Bg3dVerifiedStoredRecord[]> {
  const unique = uniqueVerifiedRecords(records);
  if (unique.length === 0) return [];

  return withDatabase(async (database) => {
    const transaction = database.transaction(MODEL_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(MODEL_STORE);
    const results = unique.slice();
    // Recheck within the write transaction to close a concurrent-import dedupe race. Each put is
    // queued synchronously from the IDB success callback; awaiting between get() and put() can make
    // a real browser transaction inactive even though simpler test doubles keep it open.
    unique.forEach((record, index) => {
      const lookup = store.index(MODEL_HASH_INDEX).get(record.contentHash);
      lookup.onsuccess = () => {
        if (isVerifiedBg3dModelRecord(lookup.result)) {
          if (rightsMatch(lookup.result.rights, record.rights)) {
            results[index] = lookup.result;
          } else {
            // `add` intentionally hits the unique hash index and aborts the whole transaction.
            store.add(record);
          }
        } else {
          // `add`, unlike `put`, can never overwrite a concurrent primary-key collision.
          store.add(record);
        }
      };
      lookup.onerror = () => transaction.abort();
    });
    await done;
    return results;
  });
}

/**
 * Validates every input before opening the single read/write transaction. A failing item therefore
 * cannot leave a partially imported batch. Existing and within-batch hashes are deduplicated.
 */
export async function importVerifiedBg3dModelsAtomically(
  inputs: readonly (Bg3dModelUploadSource | Bg3dModelImportItem)[],
  options: Bg3dModelVerificationOptions = {},
): Promise<Bg3dVerifiedStoredRecord[]> {
  if (inputs.length === 0) return [];

  const storedRecords = await listStoredBg3dModels();
  const existing = storedRecords.filter(isVerifiedBg3dModelRecord);
  const existingByHash = new Map(existing.map((record) => [record.contentHash, record] as const));
  const occupiedStorageIds = new Set(storedRecords.map((record) => record.id));
  // The GLB validator's cumulative budget is a batch/project admission boundary, not a hidden
  // quota for every unrelated asset already present in IndexedDB. A separate storage quota can be
  // enforced by the persistence layer with its own error; counting the whole library here made a
  // small valid archive fail merely because another project had cached models locally.
  let cumulativeUsedBytes = options.cumulativeUsedBytes ?? 0;
  const preparedByHash = new Map<string, Bg3dVerifiedStoredRecord>();
  // Storage dedupe and this batch's admission accounting are different concerns. An existing hash
  // still belongs to the imported project's unique-byte total the first time it appears here.
  const countedHashes = new Set<string>();
  const orderedHashes: `sha256:${string}`[] = [];

  for (const input of inputs) {
    const prepared = await prepareVerifiedBg3dModelRecordInternal(
      input,
      { ...options, cumulativeUsedBytes },
      countedHashes,
    );
    orderedHashes.push(prepared.contentHash);
    const duplicate = existingByHash.get(prepared.contentHash)
      ?? preparedByHash.get(prepared.contentHash);
    if (duplicate && !rightsMatch(duplicate.rights, prepared.rights)) {
      throw createLibraryError("rights-conflict");
    }
    if (!duplicate) {
      if (occupiedStorageIds.has(prepared.id)) throw createLibraryError("storage-id-conflict");
      occupiedStorageIds.add(prepared.id);
      preparedByHash.set(prepared.contentHash, prepared);
    }
    if (!countedHashes.has(prepared.contentHash)) {
      countedHashes.add(prepared.contentHash);
      cumulativeUsedBytes += prepared.byteSize;
    }
  }

  // Every validation above has completed successfully before this sole write transaction begins.
  throwIfBg3dOperationAborted(options.signal);
  const committed = await putVerifiedRecordsAtomically([...preparedByHash.values()]);
  const resolvedByHash = new Map(existingByHash);
  for (const record of committed) resolvedByHash.set(record.contentHash, record);

  const result: Bg3dVerifiedStoredRecord[] = [];
  const emitted = new Set<string>();
  for (const hash of orderedHashes) {
    const record = resolvedByHash.get(hash);
    if (record && !emitted.has(hash)) {
      emitted.add(hash);
      result.push(record);
    }
  }
  return result;
}

export async function saveVerifiedBg3dModel(
  input: Bg3dModelUploadSource | Bg3dModelImportItem,
  options: Bg3dModelVerificationOptions = {},
): Promise<Bg3dVerifiedStoredRecord> {
  const [record] = await importVerifiedBg3dModelsAtomically([input], options);
  if (!record) throw createIndexedDbError();
  return record;
}

/** Current upload compatibility wrapper; GLTF/OBJ now fail closed before any storage write. */
export async function saveUploadedBg3dModel(file: File): Promise<Bg3dVerifiedStoredRecord> {
  return saveVerifiedBg3dModel(file);
}

/**
 * Revalidates persisted bytes at the renderer admission boundary. A renderer must parse only the
 * returned success object's `verifiedBytes`; neither `record.blob` nor a prior upload buffer is an
 * admitted rendering source. Structural V2 metadata alone is deliberately insufficient.
 */
export async function revalidateStoredBg3dModelForRendering(
  record: unknown,
  options: Bg3dModelAdmissionOptions = {},
): Promise<StudioBg3dGlbValidationSuccess> {
  if (!isVerifiedBg3dModelRecord(record)) throw createLibraryError("stored-metadata-mismatch");

  let storedBuffer: ArrayBuffer;
  try {
    storedBuffer = await record.blob.arrayBuffer();
  } catch {
    throw createLibraryError("admission-failed");
  }
  if (storedBuffer.byteLength !== record.byteSize) throw createLibraryError("stored-metadata-mismatch");

  const validationOutcome = await validateStudioBg3dGlbOffMainThread(storedBuffer, {
    declared: {
      byteSize: record.byteSize,
      sha256: record.contentHash,
      mimeType: record.mime,
    },
    cumulative: {
      usedBytes: options.cumulativeUsedBytes ?? 0,
      maximumBytes: options.maximumCumulativeBytes ?? STUDIO_BG3D_GLB_MAX_BYTES,
    },
    profile: options.profile ?? record.validatorProfile,
    budgets: options.budgets ?? DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    digest: options.digest,
    supportedRequiredExtensions: options.supportedRequiredExtensions
      ?? STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS,
  }, options.signal);
  const validation = validationOutcome.result;
  if (!validation.ok) {
    const code = STORED_METADATA_FAILURE_CODES.has(validation.code)
      ? "stored-metadata-mismatch"
      : "admission-failed";
    throw createLibraryError(code, validation.code);
  }
  if (
    validation.verifiedSha256 !== record.contentHash ||
    validation.verifiedBytes.byteLength !== record.byteSize ||
    validation.metrics.byteSize !== record.byteSize ||
    !metricsMatch(validation.metrics, record.validatorMetrics)
  ) {
    throw createLibraryError("stored-metadata-mismatch");
  }
  return validation;
}

async function promoteLegacyGlb(record: Bg3dLegacyStoredRecord): Promise<Bg3dVerifiedStoredRecord | null> {
  if (record.format !== "glb") return null;
  try {
    const existing = await listStoredBg3dModels();
    const cumulativeUsedBytes = uniqueVerifiedRecords(existing.filter(isVerifiedBg3dModelRecord)).reduce(
      (sum, item) => sum + item.byteSize,
      0,
    );
    const promoted = await prepareVerifiedBg3dModelRecord(
      {
        name: `${normalizeModelName(record.name)}.glb`,
        size: record.blob.size,
        type: record.blob.type,
        arrayBuffer: () => record.blob.arrayBuffer(),
      },
      {
        cumulativeUsedBytes,
        idFactory: () => record.id,
      },
    );
    const duplicate = existing.find(
      (item): item is Bg3dVerifiedStoredRecord =>
        isVerifiedBg3dModelRecord(item) && item.contentHash === promoted.contentHash,
    );
    if (duplicate) return duplicate;

    return withDatabase(async (database) => {
      const safeThumbnail = normalizeStudioBg3dModelThumbnailDataUrl(record.thumbnail);
      const stores = safeThumbnail ? [MODEL_STORE, THUMBNAIL_STORE] : [MODEL_STORE];
      const transaction = database.transaction(stores, "readwrite");
      const done = transactionDone(transaction);
      const storedRecord = Object.freeze({
        ...promoted,
        createdAt: record.createdAt,
      } satisfies Bg3dVerifiedStoredRecord);
      transaction.objectStore(MODEL_STORE).put(storedRecord);
      if (safeThumbnail) {
        transaction.objectStore(THUMBNAIL_STORE).put({
          id: record.id,
          thumbnail: safeThumbnail,
          updatedAt: record.updatedAt,
        } satisfies Bg3dModelThumbnailRecord);
      }
      await done;
      return storedRecord;
    });
  } catch {
    return null;
  }
}

/**
 * Persistence lookup for editing library metadata. Legacy GLTF/OBJ bytes are never returned and a
 * V1 GLB is returned only after full validation and successful V2 promotion. Renderers must still
 * call admitStoredBg3dModelForRendering instead of parsing this record's Blob directly.
 */
export async function getStoredBg3dModel(id: string): Promise<Bg3dVerifiedStoredRecord | null> {
  const record = await getRawStoredBg3dModel(id);
  if (!record) return null;
  if (isVerifiedBg3dModelRecord(record)) return record;
  return promoteLegacyGlb(record);
}

/** Resolves local storage privately and returns only a fresh GLB validation success to renderers. */
export async function admitStoredBg3dModelForRendering(
  storageId: string,
  options: Bg3dModelAdmissionOptions = {},
): Promise<StudioBg3dGlbValidationSuccess> {
  if (!isSafeBg3dModelStorageId(storageId)) throw createLibraryError("admission-failed");
  const record = await getStoredBg3dModel(storageId);
  if (!record) throw createLibraryError("admission-failed");
  return revalidateStoredBg3dModelForRendering(record, options);
}

export async function getCachedBg3dModelThumbnail(id: string): Promise<string | null> {
  if (!isSafeBg3dModelStorageId(id)) return null;
  return withDatabase(async (database) => {
    const transaction = database.transaction(THUMBNAIL_STORE, "readonly");
    const done = transactionDone(transaction);
    const value = await requestResult<unknown>(transaction.objectStore(THUMBNAIL_STORE).get(id));
    await done;
    return readSafeThumbnailRecord(value, id)?.thumbnail ?? null;
  });
}

export async function listBg3dModelLibraryEntries(): Promise<Bg3dModelLibraryEntry[]> {
  const records = await listStoredBg3dModels();
  const thumbnails = await withDatabase(async (database) => {
    const transaction = database.transaction(THUMBNAIL_STORE, "readonly");
    const done = transactionDone(transaction);
    const values = await requestResult<unknown[]>(transaction.objectStore(THUMBNAIL_STORE).getAll());
    await done;
    const pairs = values.flatMap((value): readonly (readonly [string, string])[] => {
      const item = readSafeThumbnailRecord(value);
      return item
        ? [[item.id, item.thumbnail] as const]
        : [];
    });
    return Object.fromEntries(pairs) as Record<string, string>;
  });
  return withDefaultBg3dModelEntry(records, thumbnails);
}

/**
 * Commits a validated thumbnail only if no newer capture fence already owns the model. The model
 * lookup, fence comparison, and thumbnail put share one IndexedDB transaction, preventing a late
 * capture or concurrent delete from resurrecting stale UI data.
 */
export async function saveBg3dModelThumbnailIfCurrent(
  id: string,
  thumbnail: string,
  options: Bg3dModelThumbnailSaveOptions = {},
): Promise<boolean> {
  const inspected = inspectStudioBg3dModelThumbnailDataUrl(thumbnail);
  if (!isSafeBg3dModelStorageId(id) || !inspected) {
    throw createLibraryError("invalid-file");
  }
  const captureRevision = options.captureRevision
    ?? createBg3dModelThumbnailCaptureRevision(options.now);
  if (!isSafeThumbnailCaptureRevision(captureRevision)) throw createLibraryError("invalid-file");
  const updatedAt = resolveNow(options.now);
  return withDatabase(async (database) => {
    const transaction = database.transaction([MODEL_STORE, THUMBNAIL_STORE], "readwrite");
    const done = transactionDone(transaction);
    const modelStore = transaction.objectStore(MODEL_STORE);
    const thumbnailStore = transaction.objectStore(THUMBNAIL_STORE);
    let outcome: "missing" | "saved" | "stale" = "missing";
    const modelLookup = modelStore.get(id);
    modelLookup.onsuccess = () => {
      if (!isVerifiedBg3dModelRecord(modelLookup.result)) return;
      const thumbnailLookup = thumbnailStore.get(id);
      thumbnailLookup.onsuccess = () => {
        const existing = readSafeThumbnailRecord(thumbnailLookup.result, id);
        const existingRevision = existing?.captureRevision ?? 0;
        if (existingRevision > captureRevision) {
          outcome = "stale";
          return;
        }
        outcome = "saved";
        thumbnailStore.put({
          id,
          thumbnail: inspected.dataUrl,
          updatedAt,
          captureRevision,
        } satisfies Bg3dModelThumbnailRecord);
      };
      thumbnailLookup.onerror = () => transaction.abort();
    };
    modelLookup.onerror = () => transaction.abort();
    await done;
    if (outcome === "missing") throw createLibraryError("invalid-file");
    return outcome === "saved";
  });
}

export async function saveBg3dModelThumbnail(
  id: string,
  thumbnail: string,
  options: Bg3dModelThumbnailSaveOptions = {},
): Promise<void> {
  await saveBg3dModelThumbnailIfCurrent(id, thumbnail, options);
}

export async function deleteStoredBg3dModel(id: string): Promise<void> {
  if (isSampleBg3dModelId(id)) return;
  return withDatabase(async (database) => {
    const transaction = database.transaction([MODEL_STORE, THUMBNAIL_STORE], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(MODEL_STORE).delete(id);
    transaction.objectStore(THUMBNAIL_STORE).delete(id);
    await done;
  });
}

/** Creates a scene-local attachment without exposing or reusing the IndexedDB storage key. */
export function createStudioBg3dModelAttachment(
  record: Bg3dVerifiedStoredRecord,
  options: {
    readonly attachmentId?: string;
    readonly source?: StudioBg3dAttachmentSource;
  } = {},
): StudioBg3dModelAttachment {
  if (!isVerifiedBg3dModelRecord(record)) throw createLibraryError("invalid-attachment");
  const attachmentId = options.attachmentId ?? createOpaqueId("bg3d-attachment");
  if (
    !SCENE_ATTACHMENT_ID_PATTERN.test(attachmentId) ||
    FORBIDDEN_SCENE_IDS.has(attachmentId.toLowerCase()) ||
    attachmentId === record.id
  ) {
    throw createLibraryError("invalid-attachment");
  }
  return Object.freeze({
    id: attachmentId,
    name: attachmentFileName(record.name),
    mime: STUDIO_BG3D_GLB_MIME,
    byteSize: record.byteSize,
    hash: record.contentHash,
    rights: Object.freeze({ ...record.rights }),
    source: options.source ?? "local-library",
  });
}
