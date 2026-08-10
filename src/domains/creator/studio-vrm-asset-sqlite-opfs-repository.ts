/**
 * V12 durable authority for user VRM binaries, thumbnails, and texture-paint PNG artifacts.
 *
 * Large immutable bytes are content-addressed in a dedicated OPFS root. SQLite stores only two
 * strict canonical manifests. A save is ordered as blob -> OPFS commit marker -> owner refs ->
 * SQLite manifest, so the manifest is always the last durable authority transition. Anything
 * left before that transition is an orphan and can be removed by the bounded collector.
 */

import { acquireStudioLocalDatabase } from "./studio-local-database-runtime";
import {
  createStudioOpfsAssetStore,
  type StudioOpfsAssetStore,
  type StudioOpfsDigest,
  type StudioOpfsPutResult,
} from "./studio-opfs-asset-store";
import {
  createStudioOpfsNativeFileSystem,
  isStudioOpfsError,
  type StudioOpfsFileSystem,
  type StudioOpfsStorageManagerLike,
} from "./studio-opfs-filesystem";
import {
  STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_KIND,
  STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME,
  STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_SCHEMA_VERSION,
  type StudioVrmTexturePaintArtifactMetadata,
} from "./studio-vrm-texture-paint-artifact";

import type { StudioLocalDatabase } from "./studio-local-database";

export const STUDIO_VRM_ASSET_OPFS_ROOT = "toonspectrum-studio-vrm-assets-v12";
export const STUDIO_VRM_MODEL_SQLITE_NAMESPACE = "studio-vrm-model-assets-v12";
export const STUDIO_VRM_TEXTURE_SQLITE_NAMESPACE = "studio-vrm-texture-paint-assets-v12";
export const STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY = "manifest-v1";
export const STUDIO_VRM_ASSET_CAS_OWNER = "studio-vrm-assets-v12";

export const STUDIO_VRM_MODEL_ASSET_LIMITS = Object.freeze({
  maxModels: 512,
  maxModelBytes: 128 * 1024 * 1024,
  maxAggregateModelBytes: 16 * 1024 * 1024 * 1024,
  maxThumbnailBytes: 2 * 1024 * 1024,
  maxSampleThumbnails: 512,
  maxManifestBytes: 4 * 1024 * 1024,
});

export const STUDIO_VRM_TEXTURE_ASSET_LIMITS = Object.freeze({
  maxArtifacts: 128,
  maxArtifactBytes: 96_000_000,
  maxAggregateBytes: 96_000_000,
  maxManifestBytes: 4 * 1024 * 1024,
});

const MODEL_MANIFEST_KIND = "toonspectrum.studio-vrm-model-asset-manifest" as const;
const TEXTURE_MANIFEST_KIND = "toonspectrum.studio-vrm-texture-asset-manifest" as const;
const COMMIT_KIND = "toonspectrum.studio-vrm-asset-cas-commit" as const;
const MANIFEST_VERSION = 1 as const;
const COMMIT_VERSION = 1 as const;
const VRM_MIME = "model/gltf-binary" as const;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const SAFE_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BLOB_PATH_PATTERN = /^blobs\/([0-9a-f]{64})\.(?:bin|dfl|gz)$/u;
const COMMIT_PATH_PATTERN = /^commits\/([0-9a-f]{64})\.json$/u;
const UTF8 = new TextEncoder();
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export type StudioVrmAssetHash = `sha256:${string}`;

interface CasDescriptor {
  readonly hash: StudioVrmAssetHash;
  readonly byteLength: number;
  readonly mimeType: string;
}

interface ModelManifestEntry {
  readonly id: string;
  readonly name: string;
  readonly contentHash: StudioVrmAssetHash;
  readonly byteSize: number;
  readonly mimeType: typeof VRM_MIME;
  readonly validationVersion: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly blob: CasDescriptor;
  readonly thumbnail: CasDescriptor | null;
}

interface SampleThumbnailEntry {
  readonly id: string;
  readonly blob: CasDescriptor;
  readonly updatedAt: number;
}

interface ModelManifestV1 {
  readonly kind: typeof MODEL_MANIFEST_KIND;
  readonly version: typeof MANIFEST_VERSION;
  readonly generation: number;
  readonly models: readonly ModelManifestEntry[];
  readonly sampleThumbnails: readonly SampleThumbnailEntry[];
}

interface TextureManifestEntry {
  readonly contentHash: StudioVrmAssetHash;
  readonly receipt: StudioVrmTexturePaintArtifactMetadata;
  readonly blob: CasDescriptor;
}

interface TextureManifestV1 {
  readonly kind: typeof TEXTURE_MANIFEST_KIND;
  readonly version: typeof MANIFEST_VERSION;
  readonly generation: number;
  readonly artifacts: readonly TextureManifestEntry[];
}

interface CasCommitV1 {
  readonly kind: typeof COMMIT_KIND;
  readonly version: typeof COMMIT_VERSION;
  readonly hash: StudioVrmAssetHash;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly createdAt: number;
}

export interface StudioVrmModelAssetMetadata {
  readonly id: string;
  readonly name: string;
  readonly contentHash: StudioVrmAssetHash;
  readonly byteSize: number;
  readonly mimeType: typeof VRM_MIME;
  readonly validationVersion: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly hasThumbnail: boolean;
}

export interface StudioVrmModelAsset extends StudioVrmModelAssetMetadata {
  readonly bytes: Uint8Array;
  readonly thumbnail: StudioVrmThumbnailAsset | null;
}

export interface StudioVrmThumbnailAsset {
  readonly bytes: Uint8Array;
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export interface SaveStudioVrmModelAssetInput {
  readonly id: string;
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly expectedHash: StudioVrmAssetHash;
  readonly validationVersion: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SaveStudioVrmModelAssetResult {
  readonly metadata: StudioVrmModelAssetMetadata;
  readonly deduplicated: boolean;
}

export interface SaveStudioVrmTextureAssetInput {
  readonly receipt: StudioVrmTexturePaintArtifactMetadata;
  readonly bytes: Uint8Array;
  readonly limits?: {
    readonly maxArtifacts?: number;
    readonly maxArtifactBytes?: number;
    readonly maxAggregateBytes?: number;
  };
}

export interface SaveStudioVrmTextureAssetResult {
  readonly receipt: StudioVrmTexturePaintArtifactMetadata;
  readonly deduplicated: boolean;
}

export interface StudioVrmTextureAsset {
  readonly receipt: StudioVrmTexturePaintArtifactMetadata;
  readonly bytes: Uint8Array;
}

export interface StudioVrmAssetCleanupResult {
  readonly removedAssets: number;
  readonly removedPaths: number;
  readonly retainedInGrace: number;
  readonly observedForNextPass: number;
}

export type StudioVrmAssetRepositoryErrorCode =
  | "aborted"
  | "closed"
  | "conflict"
  | "corrupt"
  | "invalid"
  | "limit"
  | "missing"
  | "unavailable";

export class StudioVrmAssetRepositoryError extends Error {
  readonly code: StudioVrmAssetRepositoryErrorCode;

  constructor(
    code: StudioVrmAssetRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = code === "aborted" ? "AbortError" : "StudioVrmAssetRepositoryError";
    this.code = code;
  }
}

export interface StudioVrmAssetSqliteOpfsRepository {
  readonly authority: "sqlite-opfs";
  listModelMetadata(signal?: AbortSignal): Promise<StudioVrmModelAssetMetadata[]>;
  getModel(id: string, signal?: AbortSignal): Promise<StudioVrmModelAsset | null>;
  getModelByHash(hash: string, signal?: AbortSignal): Promise<StudioVrmModelAsset | null>;
  saveModel(
    input: SaveStudioVrmModelAssetInput,
    signal?: AbortSignal,
  ): Promise<SaveStudioVrmModelAssetResult>;
  saveThumbnail(
    id: string,
    thumbnail: StudioVrmThumbnailAsset,
    updatedAt: number,
    signal?: AbortSignal,
  ): Promise<void>;
  getThumbnail(id: string, signal?: AbortSignal): Promise<StudioVrmThumbnailAsset | null>;
  deleteModel(id: string, signal?: AbortSignal): Promise<boolean>;
  saveTexture(
    input: SaveStudioVrmTextureAssetInput,
    signal?: AbortSignal,
  ): Promise<SaveStudioVrmTextureAssetResult>;
  getTexture(hash: string, signal?: AbortSignal): Promise<StudioVrmTextureAsset | null>;
  cleanupOrphans(options?: {
    readonly maxRemovals?: number;
    readonly graceMs?: number;
    readonly signal?: AbortSignal;
  }): Promise<StudioVrmAssetCleanupResult>;
  close(): Promise<void>;
}

export interface StudioVrmAssetSqliteOpfsRepositoryOptions {
  readonly acquireDatabase?: () => Promise<StudioLocalDatabase>;
  readonly fileSystem?: StudioOpfsFileSystem;
  readonly digest?: StudioOpfsDigest | null;
  readonly now?: () => number;
  readonly orphanGraceMs?: number;
}

const databaseQueues = new WeakMap<
  StudioLocalDatabase,
  Map<string, Promise<unknown>>
>();

function queueForDatabase<T>(
  database: StudioLocalDatabase,
  task: () => Promise<T>,
): Promise<T> {
  let queues = databaseQueues.get(database);
  if (!queues) {
    queues = new Map();
    databaseQueues.set(database, queues);
  }
  const previous = queues.get(STUDIO_VRM_ASSET_CAS_OWNER) ?? Promise.resolve();
  const result = previous.then(task, task);
  queues.set(STUDIO_VRM_ASSET_CAS_OWNER, result.catch(() => undefined));
  return result;
}

function fail(
  code: StudioVrmAssetRepositoryErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new StudioVrmAssetRepositoryError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) fail("aborted", "VRM 자산 저장 작업이 취소되었습니다.", signal.reason);
}

function storageFailure(cause: unknown, operation: string): never {
  if (cause instanceof StudioVrmAssetRepositoryError) throw cause;
  if (isStudioOpfsError(cause)) {
    if (cause.code === "CORRUPT_ENTRY" || cause.code === "INTEGRITY_FAILED") {
      fail("corrupt", `VRM OPFS ${operation} integrity check failed.`, cause);
    }
    if (cause.code === "QUOTA_EXCEEDED") {
      fail("limit", `VRM OPFS ${operation} exceeded the available quota.`, cause);
    }
  }
  fail("unavailable", `VRM SQLite/OPFS ${operation} failed.`, cause);
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actual = Object.keys(descriptors).sort();
    const expected = [...keys].sort();
    if (
      actual.length !== expected.length
      || actual.some((key, index) => key !== expected[index])
      || actual.some((key) => {
        const descriptor = descriptors[key];
        return descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable;
      })
    ) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hash(value: unknown): StudioVrmAssetHash | null {
  return typeof value === "string" && HASH_PATTERN.test(value)
    ? value as StudioVrmAssetHash
    : null;
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function validTimestamp(value: unknown): value is number {
  return safeInteger(value, 0);
}

function validMime(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 3
    && value.length <= 96
    && /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/u.test(value);
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (normalized !== value || normalized.length < 1 || normalized.length > 120) return null;
  return Array.from(normalized).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  }) ? null : normalized;
}

function casDescriptor(value: unknown): CasDescriptor | null {
  const record = exactRecord(value, ["byteLength", "hash", "mimeType"]);
  if (!record) return null;
  const contentHash = hash(record.hash);
  if (!contentHash || !safeInteger(record.byteLength, 1) || !validMime(record.mimeType)) return null;
  return {
    hash: contentHash,
    byteLength: record.byteLength,
    mimeType: record.mimeType,
  };
}

function modelEntry(value: unknown): ModelManifestEntry | null {
  const record = exactRecord(value, [
    "blob",
    "byteSize",
    "contentHash",
    "createdAt",
    "id",
    "mimeType",
    "name",
    "thumbnail",
    "updatedAt",
    "validationVersion",
  ]);
  if (!record) return null;
  const contentHash = hash(record.contentHash);
  const blob = casDescriptor(record.blob);
  const name = normalizeName(record.name);
  const thumbnail = record.thumbnail === null ? null : casDescriptor(record.thumbnail);
  if (
    typeof record.id !== "string"
    || !ID_PATTERN.test(record.id)
    || !name
    || !contentHash
    || !blob
    || blob.hash !== contentHash
    || blob.byteLength !== record.byteSize
    || blob.mimeType !== VRM_MIME
    || record.mimeType !== VRM_MIME
    || !safeInteger(record.byteSize, 1)
    || record.byteSize > STUDIO_VRM_MODEL_ASSET_LIMITS.maxModelBytes
    || !safeInteger(record.validationVersion, 1)
    || !validTimestamp(record.createdAt)
    || !validTimestamp(record.updatedAt)
    || record.updatedAt < record.createdAt
    || (record.thumbnail !== null && (!thumbnail || !SAFE_IMAGE_MIMES.has(thumbnail.mimeType)))
    || (thumbnail?.byteLength ?? 0) > STUDIO_VRM_MODEL_ASSET_LIMITS.maxThumbnailBytes
  ) return null;
  return {
    id: record.id,
    name,
    contentHash,
    byteSize: record.byteSize,
    mimeType: VRM_MIME,
    validationVersion: record.validationVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    blob,
    thumbnail,
  };
}

function sampleThumbnailEntry(value: unknown): SampleThumbnailEntry | null {
  const record = exactRecord(value, ["blob", "id", "updatedAt"]);
  const blob = record ? casDescriptor(record.blob) : null;
  if (
    !record
    || typeof record.id !== "string"
    || !ID_PATTERN.test(record.id)
    || !blob
    || !SAFE_IMAGE_MIMES.has(blob.mimeType)
    || blob.byteLength > STUDIO_VRM_MODEL_ASSET_LIMITS.maxThumbnailBytes
    || !validTimestamp(record.updatedAt)
  ) return null;
  return { id: record.id, blob, updatedAt: record.updatedAt };
}

function textureReceipt(value: unknown): StudioVrmTexturePaintArtifactMetadata | null {
  const record = exactRecord(value, [
    "bindingKey",
    "byteLength",
    "contentHash",
    "height",
    "kind",
    "mimeType",
    "schemaVersion",
    "width",
  ]);
  const contentHash = record ? hash(record.contentHash) : null;
  if (
    !record
    || record.schemaVersion !== STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_SCHEMA_VERSION
    || record.kind !== STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_KIND
    || typeof record.bindingKey !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/u.test(record.bindingKey)
    || !contentHash
    || record.mimeType !== STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME
    || !safeInteger(record.byteLength, 1)
    || !safeInteger(record.width, 1)
    || !safeInteger(record.height, 1)
  ) return null;
  return {
    schemaVersion: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_SCHEMA_VERSION,
    kind: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_KIND,
    bindingKey: record.bindingKey,
    contentHash,
    mimeType: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME,
    byteLength: record.byteLength,
    width: record.width,
    height: record.height,
  };
}

function textureEntry(value: unknown): TextureManifestEntry | null {
  const record = exactRecord(value, ["blob", "contentHash", "receipt"]);
  const contentHash = record ? hash(record.contentHash) : null;
  const receipt = record ? textureReceipt(record.receipt) : null;
  const blob = record ? casDescriptor(record.blob) : null;
  if (
    !contentHash
    || !receipt
    || !blob
    || receipt.contentHash !== contentHash
    || blob.hash !== contentHash
    || blob.byteLength !== receipt.byteLength
    || blob.mimeType !== STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME
  ) return null;
  return { contentHash, receipt, blob };
}

function emptyModelManifest(): ModelManifestV1 {
  return {
    kind: MODEL_MANIFEST_KIND,
    version: MANIFEST_VERSION,
    generation: 0,
    models: [],
    sampleThumbnails: [],
  };
}

function emptyTextureManifest(): TextureManifestV1 {
  return {
    kind: TEXTURE_MANIFEST_KIND,
    version: MANIFEST_VERSION,
    generation: 0,
    artifacts: [],
  };
}

function canonicalModelManifest(value: ModelManifestV1): ModelManifestV1 {
  return {
    kind: MODEL_MANIFEST_KIND,
    version: MANIFEST_VERSION,
    generation: value.generation,
    models: [...value.models].sort((left, right) => left.id.localeCompare(right.id)),
    sampleThumbnails: [...value.sampleThumbnails]
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function canonicalTextureManifest(value: TextureManifestV1): TextureManifestV1 {
  return {
    kind: TEXTURE_MANIFEST_KIND,
    version: MANIFEST_VERSION,
    generation: value.generation,
    artifacts: [...value.artifacts]
      .sort((left, right) => left.contentHash.localeCompare(right.contentHash)),
  };
}

function encodedBytes(value: string): number {
  return UTF8.encode(value).byteLength;
}

function parseModelManifest(raw: string | null): ModelManifestV1 {
  if (raw === null) return emptyModelManifest();
  if (encodedBytes(raw) > STUDIO_VRM_MODEL_ASSET_LIMITS.maxManifestBytes) {
    fail("limit", "VRM model SQLite manifest exceeds its byte limit.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch (cause) {
    fail("corrupt", "VRM model SQLite manifest JSON is corrupt.", cause);
  }
  const record = exactRecord(decoded, [
    "generation",
    "kind",
    "models",
    "sampleThumbnails",
    "version",
  ]);
  if (
    !record
    || record.kind !== MODEL_MANIFEST_KIND
    || record.version !== MANIFEST_VERSION
    || !safeInteger(record.generation, 0)
    || !Array.isArray(record.models)
    || !Array.isArray(record.sampleThumbnails)
    || record.models.length > STUDIO_VRM_MODEL_ASSET_LIMITS.maxModels
    || record.sampleThumbnails.length > STUDIO_VRM_MODEL_ASSET_LIMITS.maxSampleThumbnails
  ) fail("corrupt", "VRM model SQLite manifest envelope is invalid.");
  const models = record.models.map(modelEntry);
  const thumbnails = record.sampleThumbnails.map(sampleThumbnailEntry);
  if (models.some((entry) => entry === null) || thumbnails.some((entry) => entry === null)) {
    fail("corrupt", "VRM model SQLite manifest contains an invalid entry.");
  }
  const modelIds = new Set(models.map((entry) => entry!.id));
  const hashes = new Set(models.map((entry) => entry!.contentHash));
  const thumbnailIds = new Set(thumbnails.map((entry) => entry!.id));
  if (
    modelIds.size !== models.length
    || hashes.size !== models.length
    || thumbnailIds.size !== thumbnails.length
  ) fail("corrupt", "VRM model SQLite manifest contains duplicate identities.");
  const manifest = canonicalModelManifest({
    kind: MODEL_MANIFEST_KIND,
    version: MANIFEST_VERSION,
    generation: record.generation,
    models: models as ModelManifestEntry[],
    sampleThumbnails: thumbnails as SampleThumbnailEntry[],
  });
  if (JSON.stringify(manifest) !== raw) {
    fail("corrupt", "VRM model SQLite manifest is not canonical JSON.");
  }
  return manifest;
}

function parseTextureManifest(raw: string | null): TextureManifestV1 {
  if (raw === null) return emptyTextureManifest();
  if (encodedBytes(raw) > STUDIO_VRM_TEXTURE_ASSET_LIMITS.maxManifestBytes) {
    fail("limit", "VRM texture SQLite manifest exceeds its byte limit.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch (cause) {
    fail("corrupt", "VRM texture SQLite manifest JSON is corrupt.", cause);
  }
  const record = exactRecord(decoded, ["artifacts", "generation", "kind", "version"]);
  if (
    !record
    || record.kind !== TEXTURE_MANIFEST_KIND
    || record.version !== MANIFEST_VERSION
    || !safeInteger(record.generation, 0)
    || !Array.isArray(record.artifacts)
    || record.artifacts.length > STUDIO_VRM_TEXTURE_ASSET_LIMITS.maxArtifacts
  ) fail("corrupt", "VRM texture SQLite manifest envelope is invalid.");
  const artifacts = record.artifacts.map(textureEntry);
  if (artifacts.some((entry) => entry === null)) {
    fail("corrupt", "VRM texture SQLite manifest contains an invalid entry.");
  }
  const hashes = new Set(artifacts.map((entry) => entry!.contentHash));
  if (hashes.size !== artifacts.length) {
    fail("corrupt", "VRM texture SQLite manifest contains duplicate hashes.");
  }
  const manifest = canonicalTextureManifest({
    kind: TEXTURE_MANIFEST_KIND,
    version: MANIFEST_VERSION,
    generation: record.generation,
    artifacts: artifacts as TextureManifestEntry[],
  });
  if (JSON.stringify(manifest) !== raw) {
    fail("corrupt", "VRM texture SQLite manifest is not canonical JSON.");
  }
  return manifest;
}

function modelMetadata(entry: ModelManifestEntry): StudioVrmModelAssetMetadata {
  return {
    id: entry.id,
    name: entry.name,
    contentHash: entry.contentHash,
    byteSize: entry.byteSize,
    mimeType: VRM_MIME,
    validationVersion: entry.validationVersion,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    hasThumbnail: entry.thumbnail !== null,
  };
}

function commitPath(contentHash: StudioVrmAssetHash): string {
  return `commits/${contentHash.slice("sha256:".length)}.json`;
}

export function studioVrmAssetCommitPath(contentHash: StudioVrmAssetHash): string {
  return commitPath(contentHash);
}

function canonicalCommit(descriptor: CasDescriptor, createdAt: number): CasCommitV1 {
  return {
    kind: COMMIT_KIND,
    version: COMMIT_VERSION,
    hash: descriptor.hash,
    byteLength: descriptor.byteLength,
    mimeType: descriptor.mimeType,
    createdAt,
  };
}

function parseCommit(raw: Uint8Array, expected?: CasDescriptor): CasCommitV1 {
  let text: string;
  let decoded: unknown;
  try {
    text = UTF8_DECODER.decode(raw);
    decoded = JSON.parse(text) as unknown;
  } catch (cause) {
    fail("corrupt", "VRM OPFS commit marker is corrupt.", cause);
  }
  const record = exactRecord(decoded, [
    "byteLength",
    "createdAt",
    "hash",
    "kind",
    "mimeType",
    "version",
  ]);
  const contentHash = record ? hash(record.hash) : null;
  if (
    !record
    || record.kind !== COMMIT_KIND
    || record.version !== COMMIT_VERSION
    || !contentHash
    || !safeInteger(record.byteLength, 1)
    || !validMime(record.mimeType)
    || !validTimestamp(record.createdAt)
  ) fail("corrupt", "VRM OPFS commit marker envelope is invalid.");
  const commit = canonicalCommit({
    hash: contentHash,
    byteLength: record.byteLength,
    mimeType: record.mimeType,
  }, record.createdAt);
  if (JSON.stringify(commit) !== text) {
    fail("corrupt", "VRM OPFS commit marker is not canonical JSON.");
  }
  if (
    expected
    && (
      commit.hash !== expected.hash
      || commit.byteLength !== expected.byteLength
      || commit.mimeType !== expected.mimeType
    )
  ) fail("corrupt", "VRM OPFS commit marker does not match the SQLite manifest.");
  return commit;
}

function uniqueLiveHashes(
  models: ModelManifestV1,
  textures: TextureManifestV1,
): StudioVrmAssetHash[] {
  const hashes = new Set<StudioVrmAssetHash>();
  for (const entry of models.models) {
    hashes.add(entry.blob.hash);
    if (entry.thumbnail) hashes.add(entry.thumbnail.hash);
  }
  for (const entry of models.sampleThumbnails) hashes.add(entry.blob.hash);
  for (const entry of textures.artifacts) hashes.add(entry.blob.hash);
  return [...hashes].sort();
}

function resolvedTextureLimit(
  value: number | undefined,
  maximum: number,
  label: string,
): number {
  if (value === undefined) return maximum;
  if (!safeInteger(value, 1) || value > maximum) {
    fail("limit", `${label} exceeds the hard V12 texture asset limit.`);
  }
  return value;
}

function resolveTextureLimits(value: SaveStudioVrmTextureAssetInput["limits"]): {
  maxArtifacts: number;
  maxArtifactBytes: number;
  maxAggregateBytes: number;
} {
  return {
    maxArtifacts: resolvedTextureLimit(
      value?.maxArtifacts,
      STUDIO_VRM_TEXTURE_ASSET_LIMITS.maxArtifacts,
      "maxArtifacts",
    ),
    maxArtifactBytes: resolvedTextureLimit(
      value?.maxArtifactBytes,
      STUDIO_VRM_TEXTURE_ASSET_LIMITS.maxArtifactBytes,
      "maxArtifactBytes",
    ),
    maxAggregateBytes: resolvedTextureLimit(
      value?.maxAggregateBytes,
      STUDIO_VRM_TEXTURE_ASSET_LIMITS.maxAggregateBytes,
      "maxAggregateBytes",
    ),
  };
}

function productOpfsFileSystem(): StudioOpfsFileSystem {
  let manager: StudioOpfsStorageManagerLike | null = null;
  try {
    const storage = globalThis.navigator?.storage as unknown as
      | (StudioOpfsStorageManagerLike & { getDirectory?: unknown })
      | undefined;
    if (storage && typeof storage.getDirectory === "function") manager = storage;
  } catch {
    manager = null;
  }
  if (!manager) {
    fail(
      "unavailable",
      "이 환경에서는 VRM 자산용 OPFS를 사용할 수 없습니다. 현재 탭 메모리 임시 상태만 사용할 수 있습니다.",
    );
  }
  return createStudioOpfsNativeFileSystem(manager, STUDIO_VRM_ASSET_OPFS_ROOT);
}

export function createStudioVrmAssetSqliteOpfsRepository(
  options: StudioVrmAssetSqliteOpfsRepositoryOptions = {},
): StudioVrmAssetSqliteOpfsRepository {
  const acquireDatabase = options.acquireDatabase ?? acquireStudioLocalDatabase;
  const now = options.now ?? Date.now;
  const orphanGraceMs = options.orphanGraceMs ?? 300_000;
  let fileSystem = options.fileSystem ?? null;
  let assetStore: StudioOpfsAssetStore | null = null;
  let closed = false;
  let lifecycleGeneration = 0;
  const observedOrphans = new Set<string>();

  function ensureOpen(generation?: number): void {
    if (closed || (generation !== undefined && generation !== lifecycleGeneration)) {
      fail("closed", "VRM asset repository is closed or superseded.");
    }
  }

  function fs(): StudioOpfsFileSystem {
    ensureOpen();
    fileSystem ??= productOpfsFileSystem();
    return fileSystem;
  }

  function assets(): StudioOpfsAssetStore {
    assetStore ??= createStudioOpfsAssetStore({
      fs: fs(),
      ...(options.digest !== undefined ? { digest: options.digest } : {}),
      now,
      graceMs: orphanGraceMs,
    });
    return assetStore;
  }

  async function database(): Promise<StudioLocalDatabase> {
    ensureOpen();
    try {
      return await acquireDatabase();
    } catch (cause) {
      fail(
        "unavailable",
        "VRM 자산용 shared SQLite/OPFS 권위를 열지 못했습니다. 현재 탭 메모리 임시 상태만 유지됩니다.",
        cause,
      );
    }
  }

  async function readManifests(databaseHandle: StudioLocalDatabase): Promise<{
    modelRaw: string | null;
    models: ModelManifestV1;
    textureRaw: string | null;
    textures: TextureManifestV1;
  }> {
    const [modelRaw, textureRaw] = await Promise.all([
      databaseHandle.kvGet(
        STUDIO_VRM_MODEL_SQLITE_NAMESPACE,
        STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
      ),
      databaseHandle.kvGet(
        STUDIO_VRM_TEXTURE_SQLITE_NAMESPACE,
        STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
      ),
    ]);
    return {
      modelRaw,
      models: parseModelManifest(modelRaw),
      textureRaw,
      textures: parseTextureManifest(textureRaw),
    };
  }

  async function committedBlob(
    descriptor: CasDescriptor,
    bytes: Uint8Array,
    signal: AbortSignal | undefined,
  ): Promise<boolean> {
    throwIfAborted(signal);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== descriptor.byteLength) {
      fail("invalid", "VRM CAS byte length does not match its descriptor.");
    }
    let result: StudioOpfsPutResult;
    try {
      result = await assets().put(Uint8Array.from(bytes), {
        mime: descriptor.mimeType,
        codec: "identity",
      });
    } catch (cause) {
      storageFailure(cause, "blob write");
    }
    throwIfAborted(signal);
    if (result.ref.hash !== descriptor.hash || result.ref.bytes !== descriptor.byteLength) {
      fail("invalid", "VRM CAS SHA-256 does not match the expected content identity.");
    }
    let verified: Uint8Array | null;
    try {
      verified = await assets().get(descriptor.hash, { verify: true });
    } catch (cause) {
      storageFailure(cause, "blob write verification");
    }
    if (!verified || verified.byteLength !== descriptor.byteLength) {
      fail("corrupt", "VRM CAS blob could not be verified after write.");
    }
    const markerPath = commitPath(descriptor.hash);
    const existingMarker = await fs().read(markerPath);
    if (existingMarker) {
      parseCommit(existingMarker, descriptor);
    } else {
      const marker = JSON.stringify(canonicalCommit(descriptor, now()));
      await fs().write(markerPath, UTF8.encode(marker));
      const persistedMarker = await fs().read(markerPath);
      if (!persistedMarker) fail("corrupt", "VRM OPFS commit marker disappeared after write.");
      parseCommit(persistedMarker, descriptor);
    }
    return result.deduped;
  }

  async function readCommittedBlob(
    descriptor: CasDescriptor,
    signal: AbortSignal | undefined,
  ): Promise<Uint8Array> {
    throwIfAborted(signal);
    const marker = await fs().read(commitPath(descriptor.hash));
    if (!marker) fail("corrupt", "VRM OPFS commit marker is missing.");
    parseCommit(marker, descriptor);
    let bytes: Uint8Array | null;
    try {
      bytes = await assets().get(descriptor.hash, { verify: true });
    } catch (cause) {
      storageFailure(cause, "blob read verification");
    }
    throwIfAborted(signal);
    if (!bytes || bytes.byteLength !== descriptor.byteLength) {
      fail("corrupt", "VRM OPFS blob is missing, truncated, or hash-mismatched.");
    }
    return Uint8Array.from(bytes);
  }

  async function commitModelManifest(
    databaseHandle: StudioLocalDatabase,
    baselineRaw: string | null,
    next: ModelManifestV1,
    textures: TextureManifestV1,
  ): Promise<void> {
    const currentRaw = await databaseHandle.kvGet(
      STUDIO_VRM_MODEL_SQLITE_NAMESPACE,
      STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
    );
    if (currentRaw !== baselineRaw) {
      fail("conflict", "VRM model manifest generation changed before commit.");
    }
    const canonical = canonicalModelManifest(next);
    const serialized = JSON.stringify(canonical);
    if (encodedBytes(serialized) > STUDIO_VRM_MODEL_ASSET_LIMITS.maxManifestBytes) {
      fail("limit", "VRM model SQLite manifest exceeds its byte limit.");
    }
    await assets().setOwnerRefs(
      STUDIO_VRM_ASSET_CAS_OWNER,
      uniqueLiveHashes(canonical, textures),
    );
    await databaseHandle.kvSet(
      STUDIO_VRM_MODEL_SQLITE_NAMESPACE,
      STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
      serialized,
    );
    const persisted = await databaseHandle.kvGet(
      STUDIO_VRM_MODEL_SQLITE_NAMESPACE,
      STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
    );
    if (persisted !== serialized) fail("conflict", "VRM model manifest commit was superseded.");
  }

  async function commitTextureManifest(
    databaseHandle: StudioLocalDatabase,
    baselineRaw: string | null,
    models: ModelManifestV1,
    next: TextureManifestV1,
  ): Promise<void> {
    const currentRaw = await databaseHandle.kvGet(
      STUDIO_VRM_TEXTURE_SQLITE_NAMESPACE,
      STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
    );
    if (currentRaw !== baselineRaw) {
      fail("conflict", "VRM texture manifest generation changed before commit.");
    }
    const canonical = canonicalTextureManifest(next);
    const serialized = JSON.stringify(canonical);
    if (encodedBytes(serialized) > STUDIO_VRM_TEXTURE_ASSET_LIMITS.maxManifestBytes) {
      fail("limit", "VRM texture SQLite manifest exceeds its byte limit.");
    }
    await assets().setOwnerRefs(
      STUDIO_VRM_ASSET_CAS_OWNER,
      uniqueLiveHashes(models, canonical),
    );
    await databaseHandle.kvSet(
      STUDIO_VRM_TEXTURE_SQLITE_NAMESPACE,
      STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
      serialized,
    );
    const persisted = await databaseHandle.kvGet(
      STUDIO_VRM_TEXTURE_SQLITE_NAMESPACE,
      STUDIO_VRM_ASSET_SQLITE_MANIFEST_KEY,
    );
    if (persisted !== serialized) fail("conflict", "VRM texture manifest commit was superseded.");
  }

  async function queued<T>(
    signal: AbortSignal | undefined,
    task: (databaseHandle: StudioLocalDatabase, generation: number) => Promise<T>,
  ): Promise<T> {
    throwIfAborted(signal);
    const generation = lifecycleGeneration;
    const databaseHandle = await database();
    return queueForDatabase(databaseHandle, async () => {
      ensureOpen(generation);
      throwIfAborted(signal);
      const result = await task(databaseHandle, generation);
      ensureOpen(generation);
      throwIfAborted(signal);
      return result;
    });
  }

  async function readThumbnail(
    descriptor: CasDescriptor | null,
    signal: AbortSignal | undefined,
  ): Promise<StudioVrmThumbnailAsset | null> {
    if (!descriptor) return null;
    if (!SAFE_IMAGE_MIMES.has(descriptor.mimeType)) {
      fail("corrupt", "VRM thumbnail manifest MIME is invalid.");
    }
    return {
      bytes: await readCommittedBlob(descriptor, signal),
      mimeType: descriptor.mimeType as StudioVrmThumbnailAsset["mimeType"],
    };
  }

  return {
    authority: "sqlite-opfs",

    listModelMetadata(signal) {
      return queued(signal, async (databaseHandle) => {
        const { models } = await readManifests(databaseHandle);
        return [...models.models]
          .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
          .map(modelMetadata);
      });
    },

    getModel(id, signal) {
      return queued(signal, async (databaseHandle) => {
        if (!ID_PATTERN.test(id)) return null;
        const { models } = await readManifests(databaseHandle);
        const entry = models.models.find((candidate) => candidate.id === id);
        if (!entry) return null;
        return {
          ...modelMetadata(entry),
          bytes: await readCommittedBlob(entry.blob, signal),
          thumbnail: await readThumbnail(entry.thumbnail, signal),
        };
      });
    },

    getModelByHash(value, signal) {
      return queued(signal, async (databaseHandle) => {
        const contentHash = hash(value.toLowerCase());
        if (!contentHash) return null;
        const { models } = await readManifests(databaseHandle);
        const entry = models.models.find((candidate) => candidate.contentHash === contentHash);
        if (!entry) return null;
        return {
          ...modelMetadata(entry),
          bytes: await readCommittedBlob(entry.blob, signal),
          thumbnail: await readThumbnail(entry.thumbnail, signal),
        };
      });
    },

    saveModel(input, signal) {
      return queued(signal, async (databaseHandle) => {
        const name = normalizeName(input.name);
        if (
          !ID_PATTERN.test(input.id)
          || !name
          || !hash(input.expectedHash)
          || !(input.bytes instanceof Uint8Array)
          || input.bytes.byteLength < 1
          || input.bytes.byteLength > STUDIO_VRM_MODEL_ASSET_LIMITS.maxModelBytes
          || !safeInteger(input.validationVersion, 1)
          || !validTimestamp(input.createdAt)
          || !validTimestamp(input.updatedAt)
          || input.updatedAt < input.createdAt
        ) fail("invalid", "VRM model asset input is invalid or noncanonical.");
        const state = await readManifests(databaseHandle);
        const duplicate = state.models.models.find(
          (candidate) => candidate.contentHash === input.expectedHash,
        );
        if (duplicate) {
          await readCommittedBlob(duplicate.blob, signal);
          return { metadata: modelMetadata(duplicate), deduplicated: true };
        }
        if (state.models.models.length >= STUDIO_VRM_MODEL_ASSET_LIMITS.maxModels) {
          fail("limit", "VRM model library reached its entry limit.");
        }
        const aggregate = state.models.models.reduce((sum, entry) => sum + entry.byteSize, 0);
        if (
          aggregate + input.bytes.byteLength
          > STUDIO_VRM_MODEL_ASSET_LIMITS.maxAggregateModelBytes
        ) fail("limit", "VRM model library reached its aggregate byte limit.");
        if (state.models.models.some((entry) => entry.id === input.id)) {
          fail("conflict", "VRM model id already exists with different content.");
        }
        const descriptor: CasDescriptor = {
          hash: input.expectedHash,
          byteLength: input.bytes.byteLength,
          mimeType: VRM_MIME,
        };
        await committedBlob(descriptor, input.bytes, signal);
        const entry: ModelManifestEntry = {
          id: input.id,
          name,
          contentHash: input.expectedHash,
          byteSize: input.bytes.byteLength,
          mimeType: VRM_MIME,
          validationVersion: input.validationVersion,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
          blob: descriptor,
          thumbnail: null,
        };
        const next: ModelManifestV1 = {
          ...state.models,
          generation: state.models.generation + 1,
          models: [...state.models.models, entry],
        };
        await commitModelManifest(databaseHandle, state.modelRaw, next, state.textures);
        return { metadata: modelMetadata(entry), deduplicated: false };
      });
    },

    saveThumbnail(id, thumbnail, updatedAt, signal) {
      return queued(signal, async (databaseHandle) => {
        if (
          !ID_PATTERN.test(id)
          || !SAFE_IMAGE_MIMES.has(thumbnail.mimeType)
          || !(thumbnail.bytes instanceof Uint8Array)
          || thumbnail.bytes.byteLength < 1
          || thumbnail.bytes.byteLength > STUDIO_VRM_MODEL_ASSET_LIMITS.maxThumbnailBytes
          || !validTimestamp(updatedAt)
        ) fail("invalid", "VRM thumbnail input is invalid or exceeds its byte limit.");
        const state = await readManifests(databaseHandle);
        const put = await assets().put(Uint8Array.from(thumbnail.bytes), {
          mime: thumbnail.mimeType,
          codec: "identity",
        });
        const descriptor: CasDescriptor = {
          hash: put.ref.hash,
          byteLength: thumbnail.bytes.byteLength,
          mimeType: thumbnail.mimeType,
        };
        await committedBlob(descriptor, thumbnail.bytes, signal);
        const modelIndex = state.models.models.findIndex((entry) => entry.id === id);
        let next: ModelManifestV1;
        if (modelIndex >= 0) {
          const models = [...state.models.models];
          const current = models[modelIndex]!;
          models[modelIndex] = {
            ...current,
            thumbnail: descriptor,
            updatedAt: Math.max(updatedAt, current.updatedAt),
          };
          next = {
            ...state.models,
            generation: state.models.generation + 1,
            models,
          };
        } else {
          const filtered = state.models.sampleThumbnails.filter((entry) => entry.id !== id);
          if (
            filtered.length >= STUDIO_VRM_MODEL_ASSET_LIMITS.maxSampleThumbnails
          ) fail("limit", "VRM sample thumbnail library reached its entry limit.");
          next = {
            ...state.models,
            generation: state.models.generation + 1,
            sampleThumbnails: [...filtered, { id, blob: descriptor, updatedAt }],
          };
        }
        await commitModelManifest(databaseHandle, state.modelRaw, next, state.textures);
      });
    },

    getThumbnail(id, signal) {
      return queued(signal, async (databaseHandle) => {
        if (!ID_PATTERN.test(id)) return null;
        const { models } = await readManifests(databaseHandle);
        const model = models.models.find((entry) => entry.id === id);
        const descriptor = model?.thumbnail
          ?? models.sampleThumbnails.find((entry) => entry.id === id)?.blob
          ?? null;
        return readThumbnail(descriptor, signal);
      });
    },

    deleteModel(id, signal) {
      return queued(signal, async (databaseHandle) => {
        if (!ID_PATTERN.test(id)) return false;
        const state = await readManifests(databaseHandle);
        const models = state.models.models.filter((entry) => entry.id !== id);
        const sampleThumbnails = state.models.sampleThumbnails
          .filter((entry) => entry.id !== id);
        if (
          models.length === state.models.models.length
          && sampleThumbnails.length === state.models.sampleThumbnails.length
        ) return false;
        const next: ModelManifestV1 = {
          ...state.models,
          generation: state.models.generation + 1,
          models,
          sampleThumbnails,
        };
        await commitModelManifest(databaseHandle, state.modelRaw, next, state.textures);
        return true;
      });
    },

    saveTexture(input, signal) {
      return queued(signal, async (databaseHandle) => {
        const receipt = textureReceipt(input.receipt);
        const limits = resolveTextureLimits(input.limits);
        if (
          !receipt
          || !(input.bytes instanceof Uint8Array)
          || input.bytes.byteLength !== receipt.byteLength
          || input.bytes.byteLength > limits.maxArtifactBytes
        ) fail("invalid", "VRM texture-paint asset input is invalid or exceeds its byte limit.");
        const state = await readManifests(databaseHandle);
        const existingIndex = state.textures.artifacts.findIndex(
          (entry) => entry.contentHash === receipt.contentHash,
        );
        const aggregate = state.textures.artifacts.reduce(
          (sum, entry, index) => sum + (index === existingIndex ? 0 : entry.receipt.byteLength),
          0,
        );
        if (existingIndex < 0 && state.textures.artifacts.length >= limits.maxArtifacts) {
          fail("limit", "VRM texture-paint library reached its artifact count limit.");
        }
        if (aggregate + receipt.byteLength > limits.maxAggregateBytes) {
          fail("limit", "VRM texture-paint library reached its aggregate byte limit.");
        }
        const descriptor: CasDescriptor = {
          hash: receipt.contentHash,
          byteLength: receipt.byteLength,
          mimeType: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME,
        };
        const deduplicated = await committedBlob(descriptor, input.bytes, signal);
        const entry: TextureManifestEntry = {
          contentHash: receipt.contentHash,
          receipt,
          blob: descriptor,
        };
        const artifacts = [...state.textures.artifacts];
        if (existingIndex >= 0) artifacts[existingIndex] = entry;
        else artifacts.push(entry);
        const next: TextureManifestV1 = {
          ...state.textures,
          generation: state.textures.generation + 1,
          artifacts,
        };
        await commitTextureManifest(databaseHandle, state.textureRaw, state.models, next);
        return { receipt, deduplicated: existingIndex >= 0 || deduplicated };
      });
    },

    getTexture(value, signal) {
      return queued(signal, async (databaseHandle) => {
        const contentHash = hash(value.toLowerCase());
        if (!contentHash) return null;
        const { textures } = await readManifests(databaseHandle);
        const entry = textures.artifacts.find(
          (candidate) => candidate.contentHash === contentHash,
        );
        if (!entry) return null;
        return {
          receipt: entry.receipt,
          bytes: await readCommittedBlob(entry.blob, signal),
        };
      });
    },

    cleanupOrphans(cleanupOptions = {}) {
      const signal = cleanupOptions.signal;
      return queued(signal, async (databaseHandle) => {
        const maxRemovals = cleanupOptions.maxRemovals ?? 32;
        const graceMs = cleanupOptions.graceMs ?? orphanGraceMs;
        if (!safeInteger(maxRemovals, 1) || maxRemovals > 256 || !safeInteger(graceMs, 0)) {
          fail("invalid", "VRM orphan cleanup bounds are invalid.");
        }
        const { models, textures } = await readManifests(databaseHandle);
        const live = new Set(uniqueLiveHashes(models, textures));
        const indexed = new Map(
          (await assets().list()).map((entry) => [entry.hash, entry] as const),
        );
        const markerPaths = await fs().list("commits/");
        const blobPaths = await fs().list("blobs/");
        const candidateHashes = new Set<StudioVrmAssetHash>();
        for (const contentHash of indexed.keys()) {
          if (!live.has(contentHash)) candidateHashes.add(contentHash);
        }
        for (const path of markerPaths) {
          const match = COMMIT_PATH_PATTERN.exec(path);
          const contentHash = match ? hash(`sha256:${match[1]}`) : null;
          if (contentHash && !live.has(contentHash)) candidateHashes.add(contentHash);
        }
        for (const path of blobPaths) {
          const match = BLOB_PATH_PATTERN.exec(path);
          const contentHash = match ? hash(`sha256:${match[1]}`) : null;
          if (contentHash && !live.has(contentHash)) candidateHashes.add(contentHash);
        }

        let removedAssets = 0;
        let removedPaths = 0;
        let retainedInGrace = 0;
        const nextObserved = new Set<string>();
        for (const contentHash of [...candidateHashes].sort()) {
          if (removedAssets >= maxRemovals) break;
          throwIfAborted(signal);
          const markerPath = commitPath(contentHash);
          const markerBytes = await fs().read(markerPath);
          const oldEnough = (() => {
            if (!markerBytes) {
              return observedOrphans.has(contentHash) || graceMs === 0;
            }
            try {
              return now() - parseCommit(markerBytes).createdAt >= graceMs;
            } catch {
              return observedOrphans.has(contentHash) || graceMs === 0;
            }
          })();
          if (!oldEnough) {
            retainedInGrace += 1;
            nextObserved.add(contentHash);
            continue;
          }
          if (await assets().delete(contentHash)) removedPaths += 1;
          if (await fs().remove(markerPath)) removedPaths += 1;
          for (const path of blobPaths) {
            const match = BLOB_PATH_PATTERN.exec(path);
            if (match?.[1] === contentHash.slice("sha256:".length)) {
              if (await fs().remove(path)) removedPaths += 1;
            }
          }
          removedAssets += 1;
        }
        observedOrphans.clear();
        for (const contentHash of nextObserved) observedOrphans.add(contentHash);
        return {
          removedAssets,
          removedPaths,
          retainedInGrace,
          observedForNextPass: observedOrphans.size,
        };
      });
    },

    async close() {
      if (closed) return;
      closed = true;
      lifecycleGeneration += 1;
      assetStore = null;
      fileSystem = null;
      observedOrphans.clear();
    },
  };
}

let productRepository: StudioVrmAssetSqliteOpfsRepository | null = null;

export function getProductStudioVrmAssetSqliteOpfsRepository():
StudioVrmAssetSqliteOpfsRepository {
  productRepository ??= createStudioVrmAssetSqliteOpfsRepository();
  return productRepository;
}
