import {
  STUDIO_PROJECT_ARCHIVE_LIMITS,
  type StudioProjectArchiveDocumentReference,
  type StudioProjectArchiveImportedAttachment,
  type StudioProjectArchiveManifest,
  type StudioProjectArchiveManifestAttachment,
  type StudioProjectArchiveAttachmentInput,
  type StudioProjectArchiveLimits,
} from "./studio-project-archive";
import {
  parseStudioProjectFile,
  type StudioProjectFile,
} from "./studio-project-file";
import {
  STUDIO_VRM_SCENE_DOCUMENT_KIND,
  parseStudioVrmSceneDocument,
  serializeStudioVrmSceneDocument,
  type StudioVrmSurfacePaintTexture,
} from "./studio-vrm-scene-document";
import {
  STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_KIND,
  STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME,
  STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_SCHEMA_VERSION,
  verifyStudioVrmTexturePaintArtifact,
  type StudioVrmTexturePaintArtifact,
  type StudioVrmTexturePaintArtifactHash,
  type StudioVrmTexturePaintArtifactMetadata,
  type StudioVrmTexturePaintArtifactOptions,
  type StudioVrmTexturePaintArtifactResolveContext,
  type StudioVrmTexturePaintArtifactResolver,
  type StudioVrmTexturePaintArtifactSource,
} from "./studio-vrm-texture-paint-artifact";
import {
  StudioVrmTexturePaintLibraryError,
  getStudioVrmTexturePaintLibraryArtifact,
  saveStudioVrmTexturePaintLibraryArtifact,
  type StudioVrmTexturePaintLibraryOptions,
} from "./studio-vrm-texture-paint-library";

/**
 * Project/archive bridge for content-addressed VRM surface-paint PNGs.
 *
 * Scene documents keep only immutable receipts. This module resolves and verifies the matching
 * PNGs without introducing object URLs, raw pixels, local database keys, or path assumptions into
 * the project document.
 */

export const STUDIO_VRM_TEXTURE_PAINT_PROJECT_LIBRARY_SCHEMA_VERSION = 1 as const;

export type StudioVrmTexturePaintProjectLibraryDiagnosticCode =
  | "ARCHIVE_ATTACHMENT_MISSING"
  | "LIBRARY_ARTIFACT_MISSING"
  | "LIBRARY_UNAVAILABLE";

export interface StudioVrmTexturePaintProjectLibraryDiagnostic {
  readonly severity: "error";
  readonly code: StudioVrmTexturePaintProjectLibraryDiagnosticCode;
  readonly message: string;
  readonly contentHash: StudioVrmTexturePaintArtifactHash;
  readonly pointers: readonly string[];
}

export type StudioVrmTexturePaintProjectLibraryErrorCode =
  | "ABORTED"
  | "ARCHIVE_METADATA_CONFLICT"
  | "ARTIFACT_VERIFICATION_FAILED"
  | "CANONICAL_SCENE_FINGERPRINT_MISMATCH"
  | "CRYPTO_UNAVAILABLE"
  | "LIBRARY_INSTALL_FAILED"
  | "LIBRARY_READ_FAILED"
  | "PROJECT_INVALID"
  | "PROJECT_LIMIT_EXCEEDED"
  | "SCENE_INVALID"
  | "SURFACE_PAINT_METADATA_CONFLICT";

export class StudioVrmTexturePaintProjectLibraryError extends Error {
  constructor(
    readonly code: StudioVrmTexturePaintProjectLibraryErrorCode,
    message: string,
    readonly pointer?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = code === "ABORTED"
      ? "AbortError"
      : "StudioVrmTexturePaintProjectLibraryError";
  }
}

export interface StudioVrmTexturePaintProjectReference {
  readonly pointer: string;
  readonly bindingKey: string;
  readonly materialLocator: string;
  readonly textureSlot: string;
}

export interface StudioVrmTexturePaintProjectArtifactPlan {
  readonly contentHash: StudioVrmTexturePaintArtifactHash;
  readonly mimeType: typeof STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly references: readonly StudioVrmTexturePaintProjectReference[];
  readonly documentReferences: readonly StudioProjectArchiveDocumentReference[];
}

export interface StudioVrmTexturePaintProjectPlan {
  readonly schemaVersion: typeof STUDIO_VRM_TEXTURE_PAINT_PROJECT_LIBRARY_SCHEMA_VERSION;
  readonly project: StudioProjectFile;
  readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
  readonly artifacts: readonly StudioVrmTexturePaintProjectArtifactPlan[];
  readonly referenceCount: number;
  readonly totalBytes: number;
}

export interface StudioVrmTexturePaintProjectLibraryInstaller {
  install(
    artifact: StudioVrmTexturePaintArtifact,
    context: StudioVrmTexturePaintArtifactResolveContext,
  ): Promise<"installed" | "reused"> | "installed" | "reused";
}

export interface StudioVrmTexturePaintProjectLibraryAdapter
  extends StudioVrmTexturePaintArtifactResolver,
    StudioVrmTexturePaintProjectLibraryInstaller {}

export type StudioVrmTexturePaintProjectArtifactVerifier = (
  metadata: unknown,
  source: StudioVrmTexturePaintArtifactSource,
  options?: StudioVrmTexturePaintArtifactOptions,
) => Promise<StudioVrmTexturePaintArtifact>;

export interface StudioVrmTexturePaintProjectLibraryDependencies {
  readonly verifyArtifact?: StudioVrmTexturePaintProjectArtifactVerifier;
  readonly digestText?: (value: string, signal?: AbortSignal) => Promise<string>;
  readonly libraryOptions?: Omit<StudioVrmTexturePaintLibraryOptions, "signal">;
}

export interface StudioVrmTexturePaintProjectBridgeInput {
  /** Project immediately before archive processing. */
  readonly project: unknown;
  /** Project returned by the canonical archive/project writer. */
  readonly canonicalProject: unknown;
  readonly signal?: AbortSignal;
  readonly dependencies?: StudioVrmTexturePaintProjectLibraryDependencies;
}

export interface ExportStudioVrmTexturePaintProjectLibraryInput
  extends StudioVrmTexturePaintProjectBridgeInput {
  readonly library?: StudioVrmTexturePaintArtifactResolver;
  /**
   * Optional device/archive ceilings enforced before any PNG is read from browser storage.
   * The archive builder remains authoritative for the combined project and all other assets.
   */
  readonly limits?: Partial<
    Pick<
      StudioProjectArchiveLimits,
      "maxAttachmentBytes" | "maxTotalAttachmentBytes" | "maxAttachments"
    >
  >;
}

export type ExportStudioVrmTexturePaintProjectLibraryResult =
  | {
      readonly status: "ready";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly attachments: readonly StudioProjectArchiveAttachmentInput[];
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "unresolved";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly attachments: readonly [];
      readonly diagnostics: readonly StudioVrmTexturePaintProjectLibraryDiagnostic[];
    };

export interface AuditStudioVrmTexturePaintProjectLibraryAvailabilityInput
  extends StudioVrmTexturePaintProjectBridgeInput {
  readonly library?: StudioVrmTexturePaintArtifactResolver;
}

export type AuditStudioVrmTexturePaintProjectLibraryAvailabilityResult =
  | {
      readonly status: "ready";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly artifactCount: number;
      readonly checkedCount: number;
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "unresolved";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly artifactCount: number;
      readonly checkedCount: number;
      readonly diagnostics: readonly StudioVrmTexturePaintProjectLibraryDiagnostic[];
    }
  | {
      readonly status: "unavailable";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly artifactCount: number;
      readonly checkedCount: number;
      readonly diagnostics: readonly StudioVrmTexturePaintProjectLibraryDiagnostic[];
    };

export interface ImportStudioVrmTexturePaintProjectLibraryInput
  extends StudioVrmTexturePaintProjectBridgeInput {
  readonly manifest: StudioProjectArchiveManifest;
  readonly attachments: ReadonlyMap<string, StudioProjectArchiveImportedAttachment>;
  readonly library?: StudioVrmTexturePaintProjectLibraryAdapter;
}

export type ImportStudioVrmTexturePaintProjectLibraryResult =
  | {
      readonly status: "ready";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly installed: number;
      readonly reused: number;
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "unresolved";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly installed: 0;
      readonly reused: 0;
      readonly diagnostics: readonly StudioVrmTexturePaintProjectLibraryDiagnostic[];
    };

interface StrictSceneScan {
  readonly pointer: string;
  readonly serialized: string;
  readonly textures: readonly StudioVrmSurfacePaintTexture[];
}

interface MutableArtifactPlan {
  readonly contentHash: StudioVrmTexturePaintArtifactHash;
  readonly mimeType: typeof STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly references: StudioVrmTexturePaintProjectReference[];
}

const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const RAW_SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SURFACE_PAINT_POINTER_PATTERN =
  /^\/(?:pagesList\/[0-9]+|master)\/elements\/[0-9]+\/vrmScene\/surfacePaint\/textures\/[0-9]+\/hash$/u;
const textEncoder = new TextEncoder();
const EMPTY_RESULT_ITEMS: readonly [] = Object.freeze([]);

function fail(
  code: StudioVrmTexturePaintProjectLibraryErrorCode,
  message: string,
  pointer?: string,
  cause?: unknown,
): never {
  throw new StudioVrmTexturePaintProjectLibraryError(
    code,
    message,
    pointer,
    cause === undefined ? undefined : { cause },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) fail("ABORTED", "VRM 표면 페인팅 프로젝트 작업이 취소되었습니다.");
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && (error.name === "AbortError" || error.code === "ABORTED");
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function scanStrictScene(
  element: unknown,
  scenePointer: string,
): StrictSceneScan | null {
  if (!isRecord(element) || element.type !== "image" || element.vrmScene === undefined) {
    return null;
  }
  if (
    !isRecord(element.vrmScene)
    || element.vrmScene.kind !== STUDIO_VRM_SCENE_DOCUMENT_KIND
  ) {
    fail("SCENE_INVALID", "프로젝트의 VRM 장면 식별자가 올바르지 않습니다.", scenePointer);
  }
  const serialized = serializeStudioVrmSceneDocument(element.vrmScene);
  if (!serialized) {
    fail(
      "SCENE_INVALID",
      "프로젝트의 VRM 표면 페인팅 장면이 canonical v5 형식이 아닙니다.",
      scenePointer,
    );
  }
  const scene = parseStudioVrmSceneDocument(serialized);
  if (!scene || serializeStudioVrmSceneDocument(scene) !== serialized) {
    fail(
      "SCENE_INVALID",
      "프로젝트의 VRM 표면 페인팅 장면이 canonical v5 형식이 아닙니다.",
      scenePointer,
    );
  }
  return {
    pointer: scenePointer,
    serialized,
    textures: scene.surfacePaint.textures,
  };
}

function scanStrictProjectScenes(
  value: unknown,
  signal?: AbortSignal,
): readonly StrictSceneScan[] {
  if (!isRecord(value) || !Array.isArray(value.pagesList)) {
    fail("PROJECT_INVALID", "VRM 표면 페인팅 참조를 수집할 프로젝트 구조가 올바르지 않습니다.");
  }
  const scenes: StrictSceneScan[] = [];
  let sceneBytes = 0;
  let surfaceReferences = 0;
  const append = (scene: StrictSceneScan | null): void => {
    if (!scene) return;
    sceneBytes += textEncoder.encode(scene.serialized).byteLength;
    surfaceReferences += scene.textures.length;
    if (
      sceneBytes > STUDIO_PROJECT_ARCHIVE_LIMITS.maxProjectBytes
      || surfaceReferences > STUDIO_PROJECT_ARCHIVE_LIMITS.maxReferences
    ) {
      fail(
        "PROJECT_LIMIT_EXCEEDED",
        "프로젝트의 VRM 표면 페인팅 장면 또는 참조가 archive 안전 한도를 넘었습니다.",
      );
    }
    scenes.push(scene);
  };
  for (let pageIndex = 0; pageIndex < value.pagesList.length; pageIndex += 1) {
    throwIfAborted(signal);
    const page = value.pagesList[pageIndex];
    if (!isRecord(page) || !Array.isArray(page.elements)) {
      fail("PROJECT_INVALID", "프로젝트 페이지 요소 구조가 올바르지 않습니다.");
    }
    for (let elementIndex = 0; elementIndex < page.elements.length; elementIndex += 1) {
      throwIfAborted(signal);
      const pointer = `/pagesList/${pageIndex}/elements/${elementIndex}/vrmScene`;
      append(scanStrictScene(page.elements[elementIndex], pointer));
    }
  }
  if (isRecord(value.master) && Array.isArray(value.master.elements)) {
    for (let elementIndex = 0; elementIndex < value.master.elements.length; elementIndex += 1) {
      throwIfAborted(signal);
      const pointer = `/master/elements/${elementIndex}/vrmScene`;
      append(scanStrictScene(value.master.elements[elementIndex], pointer));
    }
  }
  return scenes;
}

function sceneFingerprintSource(scenes: readonly StrictSceneScan[]): string {
  return JSON.stringify(scenes.map((scene) => [scene.pointer, scene.serialized]));
}

async function defaultDigestText(value: string, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    fail("CRYPTO_UNAVAILABLE", "VRM 표면 페인팅 장면 fingerprint를 계산할 수 없습니다.");
  }
  const bytes = textEncoder.encode(value);
  let digest: ArrayBuffer;
  try {
    digest = await subtle.digest("SHA-256", bytes);
  } catch (cause) {
    if (isAbortError(cause) || signal?.aborted) {
      fail("ABORTED", "VRM 표면 페인팅 프로젝트 작업이 취소되었습니다.");
    }
    fail("CRYPTO_UNAVAILABLE", "VRM 표면 페인팅 장면 fingerprint 계산에 실패했습니다.", undefined, cause);
  }
  throwIfAborted(signal);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function addTextureReference(
  byHash: Map<StudioVrmTexturePaintArtifactHash, MutableArtifactPlan>,
  texture: StudioVrmSurfacePaintTexture,
  pointer: string,
): void {
  if (!CONTENT_HASH_PATTERN.test(texture.hash)) {
    fail("SCENE_INVALID", "VRM 표면 페인팅 PNG hash가 올바르지 않습니다.", pointer);
  }
  const contentHash = texture.hash as StudioVrmTexturePaintArtifactHash;
  const reference: StudioVrmTexturePaintProjectReference = {
    pointer,
    bindingKey: texture.bindingKey,
    materialLocator: texture.materialLocator,
    textureSlot: texture.textureSlot,
  };
  const existing = byHash.get(contentHash);
  if (existing) {
    if (
      existing.mimeType !== texture.mime
      || existing.byteLength !== texture.byteSize
      || existing.width !== texture.width
      || existing.height !== texture.height
    ) {
      fail(
        "SURFACE_PAINT_METADATA_CONFLICT",
        "같은 VRM 표면 페인팅 PNG hash에 서로 다른 MIME, 크기 또는 해상도가 선언되었습니다.",
        pointer,
      );
    }
    if (existing.references.some((candidate) => candidate.pointer === pointer)) {
      fail("SURFACE_PAINT_METADATA_CONFLICT", "VRM 표면 페인팅 참조 포인터가 중복되었습니다.", pointer);
    }
    existing.references.push(reference);
    return;
  }
  byHash.set(contentHash, {
    contentHash,
    mimeType: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME,
    byteLength: texture.byteSize,
    width: texture.width,
    height: texture.height,
    references: [reference],
  });
}

function canonicalArtifactPlan(value: MutableArtifactPlan): StudioVrmTexturePaintProjectArtifactPlan {
  const references = [...value.references].sort((left, right) => compareText(left.pointer, right.pointer));
  return Object.freeze({
    contentHash: value.contentHash,
    mimeType: value.mimeType,
    byteLength: value.byteLength,
    width: value.width,
    height: value.height,
    references: Object.freeze(references.map((reference) => Object.freeze({ ...reference }))),
    documentReferences: Object.freeze(references.map((reference) => Object.freeze({
      pointer: reference.pointer,
      usage: "raster" as const,
      mode: "sha256-prefixed" as const,
    }))),
  });
}

async function collectCanonicalProjectPlan(
  rawProject: unknown,
  signal: AbortSignal | undefined,
  dependencies: StudioVrmTexturePaintProjectLibraryDependencies | undefined,
): Promise<StudioVrmTexturePaintProjectPlan> {
  throwIfAborted(signal);
  let project: StudioProjectFile;
  try {
    project = parseStudioProjectFile(rawProject);
  } catch (cause) {
    fail("PROJECT_INVALID", "VRM 표면 페인팅 참조를 수집할 프로젝트가 올바르지 않습니다.", undefined, cause);
  }
  const sourceScenes = scanStrictProjectScenes(rawProject, signal);
  const canonicalScenes = scanStrictProjectScenes(project, signal);
  const sourceFingerprint = sceneFingerprintSource(sourceScenes);
  const canonicalFingerprint = sceneFingerprintSource(canonicalScenes);
  if (sourceFingerprint !== canonicalFingerprint) {
    fail(
      "CANONICAL_SCENE_FINGERPRINT_MISMATCH",
      "프로젝트 파서 전후의 VRM 장면 fingerprint가 일치하지 않습니다.",
    );
  }

  const byHash = new Map<StudioVrmTexturePaintArtifactHash, MutableArtifactPlan>();
  let referenceCount = 0;
  for (const scene of canonicalScenes) {
    for (let textureIndex = 0; textureIndex < scene.textures.length; textureIndex += 1) {
      const pointer = `${scene.pointer}/surfacePaint/textures/${textureIndex}/hash`;
      if (!SURFACE_PAINT_POINTER_PATTERN.test(pointer)) {
        fail("SCENE_INVALID", "VRM 표면 페인팅 RFC 6901 포인터를 만들 수 없습니다.", pointer);
      }
      addTextureReference(byHash, scene.textures[textureIndex], pointer);
      referenceCount += 1;
      if (referenceCount > STUDIO_PROJECT_ARCHIVE_LIMITS.maxReferences) {
        fail("PROJECT_LIMIT_EXCEEDED", "VRM 표면 페인팅 참조 수가 archive 안전 한도를 넘었습니다.");
      }
    }
  }
  const artifacts = Array.from(byHash.values())
    .map(canonicalArtifactPlan)
    .sort((left, right) => compareText(left.contentHash, right.contentHash));
  if (artifacts.length > STUDIO_PROJECT_ARCHIVE_LIMITS.maxAttachments) {
    fail("PROJECT_LIMIT_EXCEEDED", "VRM 표면 페인팅 PNG 수가 archive 안전 한도를 넘었습니다.");
  }
  let totalBytes = 0;
  for (const artifact of artifacts) {
    if (artifact.byteLength > STUDIO_PROJECT_ARCHIVE_LIMITS.maxAttachmentBytes) {
      fail("PROJECT_LIMIT_EXCEEDED", "VRM 표면 페인팅 PNG 하나가 archive 안전 한도를 넘었습니다.");
    }
    totalBytes += artifact.byteLength;
    if (totalBytes > STUDIO_PROJECT_ARCHIVE_LIMITS.maxTotalAttachmentBytes) {
      fail("PROJECT_LIMIT_EXCEEDED", "VRM 표면 페인팅 PNG 합계가 archive 안전 한도를 넘었습니다.");
    }
  }
  const digest = dependencies?.digestText ?? defaultDigestText;
  const rawFingerprint = await digest(canonicalFingerprint, signal);
  if (!RAW_SHA256_PATTERN.test(rawFingerprint)) {
    fail("CRYPTO_UNAVAILABLE", "VRM 표면 페인팅 장면 fingerprint 형식이 올바르지 않습니다.");
  }
  return Object.freeze({
    schemaVersion: STUDIO_VRM_TEXTURE_PAINT_PROJECT_LIBRARY_SCHEMA_VERSION,
    project,
    sceneFingerprint: `sha256:${rawFingerprint}`,
    artifacts: Object.freeze(artifacts),
    referenceCount,
    totalBytes,
  });
}

function plansMatch(
  project: StudioVrmTexturePaintProjectPlan,
  canonical: StudioVrmTexturePaintProjectPlan,
): boolean {
  if (
    project.sceneFingerprint !== canonical.sceneFingerprint
    || project.referenceCount !== canonical.referenceCount
    || project.totalBytes !== canonical.totalBytes
    || project.artifacts.length !== canonical.artifacts.length
  ) return false;
  return project.artifacts.every((artifact, artifactIndex) => {
    const right = canonical.artifacts[artifactIndex];
    if (
      !right
      || artifact.contentHash !== right.contentHash
      || artifact.mimeType !== right.mimeType
      || artifact.byteLength !== right.byteLength
      || artifact.width !== right.width
      || artifact.height !== right.height
      || artifact.references.length !== right.references.length
    ) return false;
    return artifact.references.every((reference, referenceIndex) => {
      const candidate = right.references[referenceIndex];
      return candidate?.pointer === reference.pointer
        && candidate.bindingKey === reference.bindingKey
        && candidate.materialLocator === reference.materialLocator
        && candidate.textureSlot === reference.textureSlot;
    });
  });
}

async function collectMatchingPlans(
  input: StudioVrmTexturePaintProjectBridgeInput,
): Promise<StudioVrmTexturePaintProjectPlan> {
  const projectPlan = await collectCanonicalProjectPlan(
    input.project,
    input.signal,
    input.dependencies,
  );
  if (Object.is(input.project, input.canonicalProject)) return projectPlan;
  const canonicalPlan = await collectCanonicalProjectPlan(
    input.canonicalProject,
    input.signal,
    input.dependencies,
  );
  if (!plansMatch(projectPlan, canonicalPlan)) {
    fail(
      "CANONICAL_SCENE_FINGERPRINT_MISMATCH",
      "archive 입력 프로젝트와 canonical 프로젝트의 VRM 장면 fingerprint가 일치하지 않습니다.",
    );
  }
  return projectPlan;
}

export async function collectStudioVrmTexturePaintProjectPlan(
  project: unknown,
  options: {
    readonly signal?: AbortSignal;
    readonly dependencies?: StudioVrmTexturePaintProjectLibraryDependencies;
  } = {},
): Promise<StudioVrmTexturePaintProjectPlan> {
  return collectCanonicalProjectPlan(project, options.signal, options.dependencies);
}

function metadataForPlan(
  artifact: StudioVrmTexturePaintProjectArtifactPlan,
): StudioVrmTexturePaintArtifactMetadata {
  const bindingKey = [...artifact.references]
    .map((reference) => reference.bindingKey)
    .sort(compareText)[0];
  if (!bindingKey) {
    fail("SURFACE_PAINT_METADATA_CONFLICT", "VRM 표면 페인팅 PNG에 binding 참조가 없습니다.");
  }
  return {
    schemaVersion: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_SCHEMA_VERSION,
    kind: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_KIND,
    bindingKey,
    contentHash: artifact.contentHash,
    mimeType: artifact.mimeType,
    byteLength: artifact.byteLength,
    width: artifact.width,
    height: artifact.height,
  };
}

function verifiedArtifactMatchesPlan(
  verified: StudioVrmTexturePaintArtifact,
  plan: StudioVrmTexturePaintProjectArtifactPlan,
): boolean {
  return verified.metadata.contentHash === plan.contentHash
    && verified.metadata.mimeType === plan.mimeType
    && verified.metadata.byteLength === plan.byteLength
    && verified.metadata.width === plan.width
    && verified.metadata.height === plan.height
    && verified.archiveEntry.contentHash === plan.contentHash
    && verified.archiveEntry.mimeType === plan.mimeType
    && verified.archiveEntry.byteLength === plan.byteLength
    && verified.archiveEntry.width === plan.width
    && verified.archiveEntry.height === plan.height
    && verified.archiveEntry.data.size === plan.byteLength;
}

function defaultLibraryAdapter(
  dependencies: StudioVrmTexturePaintProjectLibraryDependencies | undefined,
): StudioVrmTexturePaintProjectLibraryAdapter {
  const corrupt = new Set<StudioVrmTexturePaintArtifactHash>();
  return {
    async resolve(contentHash, context) {
      try {
        const artifact = await getStudioVrmTexturePaintLibraryArtifact(contentHash, {
          ...dependencies?.libraryOptions,
          signal: context.signal,
        });
        return artifact.archiveEntry.data;
      } catch (cause) {
        if (
          cause instanceof StudioVrmTexturePaintLibraryError
          && (cause.code === "ARTIFACT_MISSING" || cause.code === "STORAGE_CORRUPT")
        ) {
          if (cause.code === "STORAGE_CORRUPT") corrupt.add(contentHash);
          return null;
        }
        throw cause;
      }
    },
    async install(artifact, context) {
      const result = await saveStudioVrmTexturePaintLibraryArtifact(artifact, {
        ...dependencies?.libraryOptions,
        signal: context.signal,
      });
      if (corrupt.delete(artifact.metadata.contentHash)) return "installed";
      return result.deduplicated ? "reused" : "installed";
    },
  };
}

async function resolveLibrarySource(
  library: StudioVrmTexturePaintArtifactResolver,
  contentHash: StudioVrmTexturePaintArtifactHash,
  signal: AbortSignal | undefined,
): Promise<StudioVrmTexturePaintArtifactSource | null> {
  throwIfAborted(signal);
  try {
    const source = await library.resolve(contentHash, { signal });
    throwIfAborted(signal);
    return source;
  } catch (cause) {
    if (isAbortError(cause) || signal?.aborted) {
      fail("ABORTED", "VRM 표면 페인팅 프로젝트 작업이 취소되었습니다.");
    }
    fail("LIBRARY_READ_FAILED", "로컬 VRM 표면 페인팅 PNG를 읽지 못했습니다.", undefined, cause);
  }
}

async function verifyAgainstPlan(
  plan: StudioVrmTexturePaintProjectArtifactPlan,
  source: StudioVrmTexturePaintArtifactSource,
  signal: AbortSignal | undefined,
  dependencies: StudioVrmTexturePaintProjectLibraryDependencies | undefined,
): Promise<StudioVrmTexturePaintArtifact> {
  const verifier = dependencies?.verifyArtifact ?? verifyStudioVrmTexturePaintArtifact;
  let verified: StudioVrmTexturePaintArtifact;
  try {
    verified = await verifier(metadataForPlan(plan), source, { signal });
  } catch (cause) {
    if (isAbortError(cause) || signal?.aborted) {
      fail("ABORTED", "VRM 표면 페인팅 프로젝트 작업이 취소되었습니다.");
    }
    fail(
      "ARTIFACT_VERIFICATION_FAILED",
      "VRM 표면 페인팅 PNG의 hash, MIME, 크기 또는 해상도 검증에 실패했습니다.",
      plan.references[0]?.pointer,
      cause,
    );
  }
  if (!verifiedArtifactMatchesPlan(verified, plan)) {
    fail(
      "ARTIFACT_VERIFICATION_FAILED",
      "검증기가 반환한 VRM 표면 페인팅 PNG receipt가 프로젝트와 일치하지 않습니다.",
      plan.references[0]?.pointer,
    );
  }
  return verified;
}

function unresolvedDiagnostic(
  code: StudioVrmTexturePaintProjectLibraryDiagnosticCode,
  artifact: StudioVrmTexturePaintProjectArtifactPlan,
): StudioVrmTexturePaintProjectLibraryDiagnostic {
  return Object.freeze({
    severity: "error",
    code,
    message: code === "LIBRARY_UNAVAILABLE"
      ? "로컬 VRM 표면 페인팅 저장소의 사용 가능 여부를 확인하지 못했습니다."
      : code === "LIBRARY_ARTIFACT_MISSING"
        ? "로컬 라이브러리에서 VRM 표면 페인팅 PNG를 찾지 못했습니다."
        : "프로젝트 archive에서 VRM 표면 페인팅 PNG를 찾지 못했습니다.",
    contentHash: artifact.contentHash,
    pointers: Object.freeze(artifact.references.map((reference) => reference.pointer)),
  });
}

function exportPreflightLimit(
  value: number | undefined,
  hardMaximum: number,
  label: string,
): number {
  if (value === undefined) return hardMaximum;
  if (!Number.isSafeInteger(value) || value < 1 || value > hardMaximum) {
    fail("PROJECT_LIMIT_EXCEEDED", `${label} archive 사전검사 한도가 올바르지 않습니다.`);
  }
  return value;
}

function assertExportPlanWithinLimits(
  plan: StudioVrmTexturePaintProjectPlan,
  limits: ExportStudioVrmTexturePaintProjectLibraryInput["limits"],
): void {
  const maxAttachments = exportPreflightLimit(
    limits?.maxAttachments,
    STUDIO_PROJECT_ARCHIVE_LIMITS.maxAttachments,
    "attachment 수",
  );
  const maxAttachmentBytes = exportPreflightLimit(
    limits?.maxAttachmentBytes,
    STUDIO_PROJECT_ARCHIVE_LIMITS.maxAttachmentBytes,
    "attachment 크기",
  );
  const maxTotalAttachmentBytes = exportPreflightLimit(
    limits?.maxTotalAttachmentBytes,
    STUDIO_PROJECT_ARCHIVE_LIMITS.maxTotalAttachmentBytes,
    "attachment 합계",
  );
  if (plan.artifacts.length > maxAttachments) {
    fail(
      "PROJECT_LIMIT_EXCEEDED",
      "VRM 표면 페인팅 PNG 수가 현재 기기의 archive 사전검사 한도를 넘었습니다.",
    );
  }
  if (plan.totalBytes > maxTotalAttachmentBytes) {
    fail(
      "PROJECT_LIMIT_EXCEEDED",
      "VRM 표면 페인팅 PNG 합계가 현재 기기의 archive 사전검사 한도를 넘었습니다.",
    );
  }
  const oversized = plan.artifacts.find(
    (artifact) => artifact.byteLength > maxAttachmentBytes,
  );
  if (oversized) {
    fail(
      "PROJECT_LIMIT_EXCEEDED",
      "VRM 표면 페인팅 PNG 하나가 현재 기기의 archive 사전검사 한도를 넘었습니다.",
      oversized.references[0]?.pointer,
    );
  }
}

function sourceMatchesAvailabilityReceipt(
  source: StudioVrmTexturePaintArtifactSource,
  plan: StudioVrmTexturePaintProjectArtifactPlan,
): boolean {
  if (source instanceof Blob) {
    return source.type === plan.mimeType && source.size === plan.byteLength;
  }
  return source instanceof Uint8Array && source.byteLength === plan.byteLength;
}

/**
 * Audits browser-local editability for a JSON project without creating archive attachments,
 * re-hashing, or re-encoding its PNG artifacts. Archive import/export remains the integrity
 * boundary; this path only distinguishes present, missing, and unreadable local storage.
 */
export async function auditStudioVrmTexturePaintProjectLibraryAvailability(
  input: AuditStudioVrmTexturePaintProjectLibraryAvailabilityInput,
): Promise<AuditStudioVrmTexturePaintProjectLibraryAvailabilityResult> {
  const plan = await collectMatchingPlans(input);
  const library = input.library ?? defaultLibraryAdapter(input.dependencies);
  const diagnostics: StudioVrmTexturePaintProjectLibraryDiagnostic[] = [];
  let checkedCount = 0;
  for (const artifactPlan of plan.artifacts) {
    throwIfAborted(input.signal);
    let source: StudioVrmTexturePaintArtifactSource | null;
    try {
      source = await library.resolve(artifactPlan.contentHash, { signal: input.signal });
      throwIfAborted(input.signal);
    } catch (cause) {
      if (isAbortError(cause) || input.signal?.aborted) {
        fail("ABORTED", "VRM 표면 페인팅 프로젝트 작업이 취소되었습니다.");
      }
      return Object.freeze({
        status: "unavailable",
        sceneFingerprint: plan.sceneFingerprint,
        artifactCount: plan.artifacts.length,
        checkedCount,
        diagnostics: Object.freeze([
          unresolvedDiagnostic("LIBRARY_UNAVAILABLE", artifactPlan),
        ]),
      });
    }
    checkedCount += 1;
    if (source === null) {
      diagnostics.push(unresolvedDiagnostic("LIBRARY_ARTIFACT_MISSING", artifactPlan));
      continue;
    }
    if (!sourceMatchesAvailabilityReceipt(source, artifactPlan)) {
      return Object.freeze({
        status: "unavailable",
        sceneFingerprint: plan.sceneFingerprint,
        artifactCount: plan.artifacts.length,
        checkedCount,
        diagnostics: Object.freeze([
          unresolvedDiagnostic("LIBRARY_UNAVAILABLE", artifactPlan),
        ]),
      });
    }
  }
  if (diagnostics.length > 0) {
    return Object.freeze({
      status: "unresolved",
      sceneFingerprint: plan.sceneFingerprint,
      artifactCount: plan.artifacts.length,
      checkedCount,
      diagnostics: Object.freeze(diagnostics),
    });
  }
  return Object.freeze({
    status: "ready",
    sceneFingerprint: plan.sceneFingerprint,
    artifactCount: plan.artifacts.length,
    checkedCount,
    diagnostics: EMPTY_RESULT_ITEMS,
  });
}

export async function exportStudioVrmTexturePaintProjectLibrary(
  input: ExportStudioVrmTexturePaintProjectLibraryInput,
): Promise<ExportStudioVrmTexturePaintProjectLibraryResult> {
  const plan = await collectMatchingPlans(input);
  assertExportPlanWithinLimits(plan, input.limits);
  const library = input.library ?? defaultLibraryAdapter(input.dependencies);
  const verified: Array<{
    plan: StudioVrmTexturePaintProjectArtifactPlan;
    artifact: StudioVrmTexturePaintArtifact;
  }> = [];
  const diagnostics: StudioVrmTexturePaintProjectLibraryDiagnostic[] = [];
  for (const artifactPlan of plan.artifacts) {
    const source = await resolveLibrarySource(library, artifactPlan.contentHash, input.signal);
    if (!source) {
      diagnostics.push(unresolvedDiagnostic("LIBRARY_ARTIFACT_MISSING", artifactPlan));
      continue;
    }
    verified.push({
      plan: artifactPlan,
      artifact: await verifyAgainstPlan(
        artifactPlan,
        source,
        input.signal,
        input.dependencies,
      ),
    });
  }
  if (diagnostics.length > 0) {
    return Object.freeze({
      status: "unresolved",
      sceneFingerprint: plan.sceneFingerprint,
      attachments: EMPTY_RESULT_ITEMS,
      diagnostics: Object.freeze(diagnostics),
    });
  }
  const attachments = verified.map(({ plan: artifactPlan, artifact }) => Object.freeze({
    kind: "raster" as const,
    data: artifact.archiveEntry.data,
    mimeType: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME,
    documentReferences: artifactPlan.documentReferences,
  }));
  return Object.freeze({
    status: "ready",
    sceneFingerprint: plan.sceneFingerprint,
    attachments: Object.freeze(attachments),
    diagnostics: EMPTY_RESULT_ITEMS,
  });
}

function expectedArchivePath(contentHash: StudioVrmTexturePaintArtifactHash): string {
  return `assets/sha256/${contentHash.slice("sha256:".length)}.png`;
}

function referenceMatches(
  left: StudioProjectArchiveDocumentReference,
  right: StudioProjectArchiveDocumentReference,
): boolean {
  return left.pointer === right.pointer
    && left.usage === right.usage
    && left.mode === right.mode;
}

function manifestAttachmentMatchesPlan(
  metadata: StudioProjectArchiveManifestAttachment,
  plan: StudioVrmTexturePaintProjectArtifactPlan,
): boolean {
  if (
    !exactKeys(metadata, [
      "path",
      "mimeType",
      "byteSize",
      "sha256",
      "kinds",
      "documentReferences",
    ])
    || metadata.path !== expectedArchivePath(plan.contentHash)
    || metadata.mimeType !== STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME
    || metadata.byteSize !== plan.byteLength
    || metadata.sha256 !== plan.contentHash.slice("sha256:".length)
    || !metadata.kinds.includes("raster")
  ) return false;
  return plan.documentReferences.every((expected) => {
    const reference = metadata.documentReferences.find(
      (candidate) => candidate.pointer === expected.pointer,
    );
    return reference !== undefined
      && exactKeys(reference, ["pointer", "usage", "mode"])
      && referenceMatches(reference, expected);
  });
}

function importedAttachmentMetadataMatchesManifest(
  imported: StudioProjectArchiveImportedAttachment,
  manifest: StudioProjectArchiveManifestAttachment,
): boolean {
  const metadata = imported.metadata;
  return exactKeys(imported, ["metadata", "blob"])
    && exactKeys(metadata, [
      "path",
      "mimeType",
      "byteSize",
      "sha256",
      "kinds",
      "documentReferences",
    ])
    && metadata.path === manifest.path
    && metadata.mimeType === manifest.mimeType
    && metadata.byteSize === manifest.byteSize
    && metadata.sha256 === manifest.sha256
    && metadata.kinds.length === manifest.kinds.length
    && metadata.kinds.every((kind, index) => kind === manifest.kinds[index])
    && metadata.documentReferences.length === manifest.documentReferences.length
    && metadata.documentReferences.every((reference, index) => {
      const candidate = manifest.documentReferences[index];
      return candidate !== undefined && referenceMatches(reference, candidate);
    });
}

function validateNoForeignSurfacePaintReferences(
  manifest: StudioProjectArchiveManifest,
  plannedPointers: ReadonlyMap<string, string>,
): number {
  const seen = new Set<string>();
  for (const attachment of manifest.attachments) {
    for (const reference of attachment.documentReferences) {
      if (!SURFACE_PAINT_POINTER_PATTERN.test(reference.pointer)) continue;
      const expectedHash = plannedPointers.get(reference.pointer);
      if (
        expectedHash === undefined
        || expectedHash !== attachment.sha256
        || seen.has(reference.pointer)
      ) {
        fail(
          "ARCHIVE_METADATA_CONFLICT",
          "archive manifest의 VRM 표면 페인팅 참조 범위가 canonical 프로젝트와 다릅니다.",
          reference.pointer,
        );
      }
      seen.add(reference.pointer);
    }
  }
  return seen.size;
}

async function installVerifiedArtifact(
  library: StudioVrmTexturePaintProjectLibraryAdapter,
  artifact: StudioVrmTexturePaintArtifact,
  plan: StudioVrmTexturePaintProjectArtifactPlan,
  signal: AbortSignal | undefined,
  dependencies: StudioVrmTexturePaintProjectLibraryDependencies | undefined,
): Promise<"installed" | "reused"> {
  throwIfAborted(signal);
  let disposition: "installed" | "reused";
  try {
    disposition = await library.install(artifact, { signal });
  } catch (cause) {
    if (isAbortError(cause) || signal?.aborted) {
      fail("ABORTED", "VRM 표면 페인팅 프로젝트 작업이 취소되었습니다.");
    }
    fail("LIBRARY_INSTALL_FAILED", "검증된 VRM 표면 페인팅 PNG를 로컬 라이브러리에 저장하지 못했습니다.", undefined, cause);
  }
  if (disposition !== "installed" && disposition !== "reused") {
    fail("LIBRARY_INSTALL_FAILED", "로컬 VRM 표면 페인팅 라이브러리가 올바르지 않은 저장 결과를 반환했습니다.");
  }
  const installed = await resolveLibrarySource(library, plan.contentHash, signal);
  if (!installed) {
    fail("LIBRARY_INSTALL_FAILED", "저장한 VRM 표면 페인팅 PNG를 로컬 라이브러리에서 다시 확인하지 못했습니다.");
  }
  await verifyAgainstPlan(plan, installed, signal, dependencies);
  return disposition;
}

export async function importStudioVrmTexturePaintProjectLibrary(
  input: ImportStudioVrmTexturePaintProjectLibraryInput,
): Promise<ImportStudioVrmTexturePaintProjectLibraryResult> {
  const plan = await collectMatchingPlans(input);
  const library = input.library ?? defaultLibraryAdapter(input.dependencies);
  const manifestByHash = new Map<string, StudioProjectArchiveManifestAttachment>();
  for (const attachment of input.manifest.attachments) {
    if (manifestByHash.has(attachment.sha256)) {
      fail("ARCHIVE_METADATA_CONFLICT", "archive manifest에 중복된 attachment hash가 있습니다.");
    }
    manifestByHash.set(attachment.sha256, attachment);
  }
  const plannedPointers = new Map(
    plan.artifacts.flatMap((artifact) =>
      artifact.references.map((reference) => [
        reference.pointer,
        artifact.contentHash.slice("sha256:".length),
      ] as const)
    ),
  );
  const coveredPointerCount = validateNoForeignSurfacePaintReferences(
    input.manifest,
    plannedPointers,
  );

  const diagnostics: StudioVrmTexturePaintProjectLibraryDiagnostic[] = [];
  const archiveCandidates: Array<{
    plan: StudioVrmTexturePaintProjectArtifactPlan;
    imported: StudioProjectArchiveImportedAttachment;
  }> = [];
  for (const artifactPlan of plan.artifacts) {
    const rawHash = artifactPlan.contentHash.slice("sha256:".length);
    const manifestAttachment = manifestByHash.get(rawHash);
    const imported = input.attachments.get(rawHash);
    if (!manifestAttachment || !imported) {
      diagnostics.push(unresolvedDiagnostic("ARCHIVE_ATTACHMENT_MISSING", artifactPlan));
      continue;
    }
    if (
      !manifestAttachmentMatchesPlan(manifestAttachment, artifactPlan)
      || !importedAttachmentMetadataMatchesManifest(imported, manifestAttachment)
      || imported.blob.size !== artifactPlan.byteLength
      || imported.blob.type !== STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME
    ) {
      fail(
        "ARCHIVE_METADATA_CONFLICT",
        "archive의 VRM 표면 페인팅 attachment metadata가 canonical 프로젝트와 일치하지 않습니다.",
        artifactPlan.references[0]?.pointer,
      );
    }
    archiveCandidates.push({ plan: artifactPlan, imported });
  }
  if (diagnostics.length > 0) {
    return Object.freeze({
      status: "unresolved",
      sceneFingerprint: plan.sceneFingerprint,
      installed: 0,
      reused: 0,
      diagnostics: Object.freeze(diagnostics),
    });
  }
  if (coveredPointerCount !== plannedPointers.size) {
    fail(
      "ARCHIVE_METADATA_CONFLICT",
      "archive manifest가 canonical 프로젝트의 모든 VRM 표면 페인팅 참조를 포함하지 않습니다.",
    );
  }

  // Authenticate every archive PNG before the first IndexedDB mutation.
  const verifiedArchive: Array<{
    plan: StudioVrmTexturePaintProjectArtifactPlan;
    artifact: StudioVrmTexturePaintArtifact;
  }> = [];
  for (const { plan: artifactPlan, imported } of archiveCandidates) {
    verifiedArchive.push({
      plan: artifactPlan,
      artifact: await verifyAgainstPlan(
        artifactPlan,
        imported.blob,
        input.signal,
        input.dependencies,
      ),
    });
  }
  const reusable = new Map<StudioVrmTexturePaintArtifactHash, boolean>();
  for (const { plan: artifactPlan } of verifiedArchive) {
    const existing = await resolveLibrarySource(library, artifactPlan.contentHash, input.signal);
    if (!existing) {
      reusable.set(artifactPlan.contentHash, false);
      continue;
    }
    try {
      await verifyAgainstPlan(artifactPlan, existing, input.signal, input.dependencies);
      reusable.set(artifactPlan.contentHash, true);
    } catch (cause) {
      if (
        cause instanceof StudioVrmTexturePaintProjectLibraryError
        && cause.code === "ARTIFACT_VERIFICATION_FAILED"
      ) {
        reusable.set(artifactPlan.contentHash, false);
        continue;
      }
      throw cause;
    }
  }

  let installed = 0;
  let reused = 0;
  for (const { plan: artifactPlan, artifact } of verifiedArchive) {
    if (reusable.get(artifactPlan.contentHash) === true) {
      reused += 1;
      continue;
    }
    const disposition = await installVerifiedArtifact(
      library,
      artifact,
      artifactPlan,
      input.signal,
      input.dependencies,
    );
    if (disposition === "reused") reused += 1;
    else installed += 1;
  }
  return Object.freeze({
    status: "ready",
    sceneFingerprint: plan.sceneFingerprint,
    installed,
    reused,
    diagnostics: EMPTY_RESULT_ITEMS,
  });
}
