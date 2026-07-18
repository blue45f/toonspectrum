import {
  type ImportStudioProjectArchiveResult,
  type StudioProjectArchiveAttachmentInput,
  type StudioProjectArchiveDocumentReference,
  type StudioProjectArchiveImportedAttachment,
} from "./studio-project-archive";
import { parseStudioProjectFile, type StudioProjectFile } from "./studio-project-file";
import {
  parseStudioVrmSceneDocument,
  serializeStudioVrmSceneDocument,
  type StudioVrmAttachmentModel,
  type StudioVrmSceneDocument,
} from "./studio-vrm-scene-document";
import {
  canonicalizeVrmContentHash,
  ensureStoredVrmContentIdentity,
  getStoredVrmModelByHash,
  hashVrmBlob,
  saveVerifiedVrmBlob,
  validateVrmGlbBytes,
  VRM_VALIDATION_VERSION,
  type VrmContentHash,
  type VrmStoredModelRecord,
  type VrmStoredModelWithContentIdentity,
} from "./vrm-library";

/**
 * Portable VRM archive bridge.
 *
 * Scene documents own only a stable content hash and public model metadata. Device-local IndexedDB
 * ids remain behind this boundary and are never written into project.json. Export and import both
 * re-read and validate the complete GLB/VRM payload instead of trusting cached row metadata.
 */

export type StudioVrmProjectLibraryDiagnosticCode =
  | "ATTACHMENT_BYTES_INVALID"
  | "ATTACHMENT_HASH_MISMATCH"
  | "ATTACHMENT_METADATA_MISMATCH"
  | "ATTACHMENT_MIME_MISMATCH"
  | "ATTACHMENT_MISSING"
  | "LOCAL_MODEL_BYTES_INVALID"
  | "LOCAL_MODEL_HASH_MISMATCH"
  | "LOCAL_MODEL_METADATA_CONFLICT"
  | "LOCAL_MODEL_MIME_MISMATCH"
  | "LOCAL_MODEL_NOT_FOUND"
  | "LOCAL_MODEL_SAVE_FAILED"
  | "LOCAL_MODEL_SIZE_MISMATCH";

export interface StudioVrmProjectLibraryDiagnostic {
  readonly code: StudioVrmProjectLibraryDiagnosticCode;
  readonly message: string;
  readonly hash: VrmContentHash;
  readonly pointers: readonly string[];
}

export interface StudioVrmProjectArchiveReference {
  readonly hash: VrmContentHash;
  /** RFC 6901 pointer to the canonical `model.hash` field in project.json. */
  readonly pointer: string;
  readonly scenePointer: string;
  readonly scope: "page" | "master";
  readonly pageIndex?: number;
  readonly elementIndex: number;
  readonly model: StudioVrmAttachmentModel;
}

export type StudioVrmProjectArchiveMissingReason =
  | "bytes-invalid"
  | "hash-mismatch"
  | "metadata-conflict"
  | "mime-mismatch"
  | "not-found"
  | "size-mismatch";

export interface StudioVrmProjectArchiveMissingModel {
  readonly hash: VrmContentHash;
  readonly pointers: readonly string[];
  readonly reason: StudioVrmProjectArchiveMissingReason;
}

export interface PrepareStudioVrmProjectArchiveExportResult {
  readonly attachments: readonly StudioProjectArchiveAttachmentInput[];
  readonly missing: readonly StudioVrmProjectArchiveMissingModel[];
  readonly diagnostics: readonly StudioVrmProjectLibraryDiagnostic[];
  readonly isComplete: boolean;
}

export interface StudioVrmProjectLibraryDependencies {
  readonly getStoredByContentHash: (hash: string) => Promise<VrmStoredModelRecord | null>;
  readonly ensureStoredIdentity: (
    record: VrmStoredModelRecord,
  ) => Promise<VrmStoredModelWithContentIdentity>;
  readonly hashBlob: (blob: Blob) => Promise<VrmContentHash>;
  readonly validateGlbVrmBytes: typeof validateVrmGlbBytes;
  readonly saveVerifiedBlob: typeof saveVerifiedVrmBlob;
}

export interface RestoreStudioVrmProjectArchiveImportResult {
  /** Canonical snapshots; VRM scene documents are unchanged and contain no local model ids. */
  readonly project: StudioProjectFile;
  readonly canonicalProject: StudioProjectFile;
  readonly installed: ReadonlyArray<{ hash: VrmContentHash; modelId: string }>;
  readonly reused: ReadonlyArray<{ hash: VrmContentHash; modelId: string }>;
  readonly unresolved: readonly VrmContentHash[];
  readonly diagnostics: readonly StudioVrmProjectLibraryDiagnostic[];
}

export type StudioVrmProjectLibraryErrorCode = "import-project-mismatch" | "project-invalid";

const ERROR_MESSAGES: Readonly<Record<StudioVrmProjectLibraryErrorCode, string>> = Object.freeze({
  "import-project-mismatch": "검증한 프로젝트와 복구할 VRM 장면 원본이 일치하지 않습니다.",
  "project-invalid": "VRM 모델 참조를 수집할 프로젝트가 올바르지 않습니다.",
});

export class StudioVrmProjectLibraryError extends Error {
  readonly code: StudioVrmProjectLibraryErrorCode;

  constructor(code: StudioVrmProjectLibraryErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "StudioVrmProjectLibraryError";
    this.code = code;
  }
}

const DEFAULT_DEPENDENCIES: StudioVrmProjectLibraryDependencies = Object.freeze({
  getStoredByContentHash: getStoredVrmModelByHash,
  ensureStoredIdentity: ensureStoredVrmContentIdentity,
  hashBlob: hashVrmBlob,
  validateGlbVrmBytes: validateVrmGlbBytes,
  saveVerifiedBlob: saveVerifiedVrmBlob,
});

function resolveDependencies(
  overrides: Partial<StudioVrmProjectLibraryDependencies>,
): StudioVrmProjectLibraryDependencies {
  return { ...DEFAULT_DEPENDENCIES, ...overrides };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCanonicalScene(value: unknown): StudioVrmSceneDocument | null {
  const serialized = serializeStudioVrmSceneDocument(value);
  return serialized ? parseStudioVrmSceneDocument(serialized) : null;
}

interface ProjectVrmSnapshot {
  readonly project: StudioProjectFile;
  readonly references: StudioVrmProjectArchiveReference[];
  readonly sceneFingerprints: string[];
}

function snapshotProjectVrmReferences(project: unknown): ProjectVrmSnapshot {
  let parsed: StudioProjectFile;
  try {
    parsed = parseStudioProjectFile(project);
  } catch {
    throw new StudioVrmProjectLibraryError("project-invalid");
  }
  const references: StudioVrmProjectArchiveReference[] = [];
  const sceneFingerprints: string[] = [];

  const visitElements = (
    elements: readonly unknown[],
    basePointer: string,
    scope: "page" | "master",
    pageIndex?: number,
  ): void => {
    elements.forEach((element, elementIndex) => {
      if (!isRecord(element) || element.type !== "image" || element.vrmScene === undefined) return;
      const scene = parseCanonicalScene(element.vrmScene);
      if (!scene) throw new StudioVrmProjectLibraryError("project-invalid");
      const scenePointer = `${basePointer}/${elementIndex}/vrmScene`;
      const serialized = serializeStudioVrmSceneDocument(scene);
      if (!serialized) throw new StudioVrmProjectLibraryError("project-invalid");
      sceneFingerprints.push(`${scenePointer}\u0000${serialized}`);
      if (scene.model.source !== "attachment") return;
      const canonicalHash = canonicalizeVrmContentHash(scene.model.hash);
      if (!canonicalHash || canonicalHash !== scene.model.hash) {
        throw new StudioVrmProjectLibraryError("project-invalid");
      }
      references.push({
        hash: canonicalHash,
        pointer: `${scenePointer}/model/hash`,
        scenePointer,
        scope,
        ...(pageIndex === undefined ? {} : { pageIndex }),
        elementIndex,
        model: scene.model,
      });
    });
  };

  parsed.pagesList.forEach((page, pageIndex) => {
    visitElements(page.elements, `/pagesList/${pageIndex}/elements`, "page", pageIndex);
  });
  if (isRecord(parsed.master) && Array.isArray(parsed.master.elements)) {
    visitElements(parsed.master.elements, "/master/elements", "master");
  }
  return { project: parsed, references, sceneFingerprints };
}

/** Collects attachment-backed VRM references in page order followed by master element order. */
export function collectStudioVrmProjectArchiveReferences(
  project: StudioProjectFile | unknown,
): StudioVrmProjectArchiveReference[] {
  return snapshotProjectVrmReferences(project).references;
}

function groupReferences(
  references: readonly StudioVrmProjectArchiveReference[],
): Map<VrmContentHash, StudioVrmProjectArchiveReference[]> {
  const grouped = new Map<VrmContentHash, StudioVrmProjectArchiveReference[]>();
  for (const reference of references) {
    const existing = grouped.get(reference.hash);
    if (existing) existing.push(reference);
    else grouped.set(reference.hash, [reference]);
  }
  return grouped;
}

function metadataConflict(
  references: readonly StudioVrmProjectArchiveReference[],
): boolean {
  const first = references[0]?.model;
  return !first || references.some(({ model }) =>
    model.hash !== first.hash
    || model.byteSize !== first.byteSize
    || !["model/vrm", "model/gltf-binary"].includes(model.mime)
  );
}

type BlobVerificationFailure = Exclude<
  StudioVrmProjectArchiveMissingReason,
  "metadata-conflict" | "not-found"
>;

async function verifyVrmBlob(
  blob: Blob,
  expectedHash: VrmContentHash,
  expectedBytes: number,
  dependencies: StudioVrmProjectLibraryDependencies,
): Promise<BlobVerificationFailure | null> {
  if (!Number.isSafeInteger(blob.size) || blob.size !== expectedBytes) return "size-mismatch";
  let bytes: ArrayBuffer;
  try {
    bytes = await blob.arrayBuffer();
  } catch {
    return "bytes-invalid";
  }
  if (bytes.byteLength !== expectedBytes) return "size-mismatch";
  try {
    dependencies.validateGlbVrmBytes(bytes);
  } catch {
    return "bytes-invalid";
  }
  try {
    const actualHash = canonicalizeVrmContentHash(await dependencies.hashBlob(blob));
    return actualHash === expectedHash ? null : "hash-mismatch";
  } catch {
    return "bytes-invalid";
  }
}

interface VerifiedStoredModel {
  readonly record: VrmStoredModelWithContentIdentity;
  readonly blob: Blob;
}

interface ResolveStoredModelResult {
  readonly match: VerifiedStoredModel | null;
  readonly reason: StudioVrmProjectArchiveMissingReason;
}

async function resolveVerifiedStoredModel(
  hash: VrmContentHash,
  expectedBytes: number,
  dependencies: StudioVrmProjectLibraryDependencies,
): Promise<ResolveStoredModelResult> {
  let stored: VrmStoredModelRecord | null;
  try {
    stored = await dependencies.getStoredByContentHash(hash);
  } catch {
    return { match: null, reason: "not-found" };
  }
  if (!stored) return { match: null, reason: "not-found" };

  let ensured: VrmStoredModelWithContentIdentity;
  try {
    ensured = await dependencies.ensureStoredIdentity(stored);
  } catch {
    return { match: null, reason: "bytes-invalid" };
  }
  if (canonicalizeVrmContentHash(ensured.contentHash) !== hash) {
    return { match: null, reason: "hash-mismatch" };
  }
  if (
    ensured.byteSize !== expectedBytes
    || ensured.blob.size !== expectedBytes
    || ensured.validationVersion !== VRM_VALIDATION_VERSION
  ) {
    return { match: null, reason: "size-mismatch" };
  }
  if (ensured.mimeType !== "model/gltf-binary") {
    return { match: null, reason: "mime-mismatch" };
  }
  const failure = await verifyVrmBlob(ensured.blob, hash, expectedBytes, dependencies);
  return failure
    ? { match: null, reason: failure }
    : { match: { record: ensured, blob: ensured.blob }, reason: "not-found" };
}

function diagnosticForMissing(
  missing: StudioVrmProjectArchiveMissingModel,
): StudioVrmProjectLibraryDiagnostic {
  const details: Record<StudioVrmProjectArchiveMissingReason, {
    code: StudioVrmProjectLibraryDiagnosticCode;
    message: string;
  }> = {
    "bytes-invalid": {
      code: "LOCAL_MODEL_BYTES_INVALID",
      message: "로컬 VRM이 GLB/VRM 안전 검사를 통과하지 못해 archive에 포함하지 않았습니다.",
    },
    "hash-mismatch": {
      code: "LOCAL_MODEL_HASH_MISMATCH",
      message: "로컬 VRM의 실제 SHA-256이 장면 문서의 모델 해시와 일치하지 않습니다.",
    },
    "metadata-conflict": {
      code: "LOCAL_MODEL_METADATA_CONFLICT",
      message: "같은 VRM 해시를 참조하는 장면들의 모델 크기 또는 MIME 정보가 충돌합니다.",
    },
    "mime-mismatch": {
      code: "LOCAL_MODEL_MIME_MISMATCH",
      message: "로컬 VRM의 검증된 MIME 정보가 VRM 라이브러리 계약과 일치하지 않습니다.",
    },
    "not-found": {
      code: "LOCAL_MODEL_NOT_FOUND",
      message: "장면이 가리키는 VRM을 이 기기의 검증 라이브러리에서 찾지 못했습니다.",
    },
    "size-mismatch": {
      code: "LOCAL_MODEL_SIZE_MISMATCH",
      message: "로컬 VRM의 실제 크기가 장면 문서의 모델 크기와 일치하지 않습니다.",
    },
  };
  return { ...details[missing.reason], hash: missing.hash, pointers: missing.pointers };
}

/**
 * Resolves, re-hashes, and validates every attachment-backed VRM. Equal hashes become one archive
 * attachment with all of their exact model-hash pointers. Missing or conflicting rows are never
 * substituted with a similarly named/id'd model.
 */
export async function prepareStudioVrmProjectArchiveExport(
  project: StudioProjectFile | unknown,
  dependencyOverrides: Partial<StudioVrmProjectLibraryDependencies> = {},
): Promise<PrepareStudioVrmProjectArchiveExportResult> {
  const dependencies = resolveDependencies(dependencyOverrides);
  // Capture a bounded canonical snapshot before the first asynchronous library lookup.
  const grouped = groupReferences(snapshotProjectVrmReferences(project).references);
  const attachments: StudioProjectArchiveAttachmentInput[] = [];
  const missing: StudioVrmProjectArchiveMissingModel[] = [];

  for (const [hash, references] of grouped) {
    const pointers = references.map(({ pointer }) => pointer);
    if (metadataConflict(references)) {
      missing.push({ hash, pointers, reason: "metadata-conflict" });
      continue;
    }
    const expectedBytes = references[0]?.model.byteSize;
    if (!expectedBytes) {
      missing.push({ hash, pointers, reason: "metadata-conflict" });
      continue;
    }
    const resolved = await resolveVerifiedStoredModel(hash, expectedBytes, dependencies);
    if (!resolved.match) {
      missing.push({ hash, pointers, reason: resolved.reason });
      continue;
    }
    const documentReferences: StudioProjectArchiveDocumentReference[] = pointers.map((pointer) => ({
      pointer,
      usage: "vrm",
      mode: "sha256-prefixed",
    }));
    attachments.push({
      kind: "vrm",
      data: resolved.match.blob,
      mimeType: "model/vrm",
      documentReferences,
    });
  }

  const diagnostics = missing.map(diagnosticForMissing);
  return { attachments, missing, diagnostics, isComplete: missing.length === 0 };
}

function sceneSnapshotsMatch(left: ProjectVrmSnapshot, right: ProjectVrmSnapshot): boolean {
  return left.sceneFingerprints.length === right.sceneFingerprints.length
    && left.sceneFingerprints.every((fingerprint, index) =>
      fingerprint === right.sceneFingerprints[index]
    );
}

type ImportedAttachmentFailure =
  | "bytes-invalid"
  | "hash-mismatch"
  | "metadata-mismatch"
  | "mime-mismatch"
  | "missing"
  | "size-mismatch";

function attachmentCoversAllReferences(
  imported: StudioProjectArchiveImportedAttachment,
  hash: VrmContentHash,
  expectedBytes: number,
  references: readonly StudioVrmProjectArchiveReference[],
): ImportedAttachmentFailure | null {
  const rawHash = hash.slice("sha256:".length);
  if (imported.metadata.sha256 !== rawHash || imported.metadata.byteSize !== expectedBytes) {
    return "metadata-mismatch";
  }
  if (
    imported.metadata.mimeType !== "model/vrm"
    || imported.blob.type !== "model/vrm"
    || !imported.metadata.kinds.includes("vrm")
  ) {
    return "mime-mismatch";
  }
  const authenticatedPointers = new Set(
    imported.metadata.documentReferences
      .filter((reference) =>
        reference.usage === "vrm" && reference.mode === "sha256-prefixed"
      )
      .map(({ pointer }) => pointer),
  );
  return references.every(({ pointer }) => authenticatedPointers.has(pointer))
    ? null
    : "metadata-mismatch";
}

function diagnosticForImportedFailure(
  hash: VrmContentHash,
  pointers: readonly string[],
  failure: ImportedAttachmentFailure,
): StudioVrmProjectLibraryDiagnostic {
  const details: Record<ImportedAttachmentFailure, {
    code: StudioVrmProjectLibraryDiagnosticCode;
    message: string;
  }> = {
    "bytes-invalid": {
      code: "ATTACHMENT_BYTES_INVALID",
      message: "archive의 VRM attachment가 GLB/VRM 안전 검사를 통과하지 못했습니다.",
    },
    "hash-mismatch": {
      code: "ATTACHMENT_HASH_MISMATCH",
      message: "archive VRM attachment의 실제 SHA-256이 장면 문서와 일치하지 않습니다.",
    },
    "metadata-mismatch": {
      code: "ATTACHMENT_METADATA_MISMATCH",
      message: "archive VRM attachment가 장면 문서의 모델 해시 위치와 안전하게 연결되지 않았습니다.",
    },
    "mime-mismatch": {
      code: "ATTACHMENT_MIME_MISMATCH",
      message: "archive attachment의 kind 또는 MIME이 VRM 계약과 일치하지 않습니다.",
    },
    missing: {
      code: "ATTACHMENT_MISSING",
      message: "가져온 archive에 장면이 사용하는 VRM attachment가 없습니다.",
    },
    "size-mismatch": {
      code: "ATTACHMENT_METADATA_MISMATCH",
      message: "archive VRM attachment의 실제 크기가 장면 문서와 일치하지 않습니다.",
    },
  };
  return { ...details[failure], hash, pointers };
}

/**
 * Installs only VRM attachments referenced by the authenticated project. Existing verified hashes
 * are reused; imported bytes are otherwise validated once here and again by the library writer.
 * Returned project snapshots preserve every scene/model field and never receive a local model id.
 */
export async function restoreStudioVrmProjectArchiveImport(
  archive: ImportStudioProjectArchiveResult,
  dependencyOverrides: Partial<StudioVrmProjectLibraryDependencies> = {},
): Promise<RestoreStudioVrmProjectArchiveImportResult> {
  const dependencies = resolveDependencies(dependencyOverrides);
  // Snapshot both authenticated variants before the first await. Raster rehydration may differ,
  // but every complete VRM scene (including bundled scenes) must remain byte-for-byte canonical.
  const canonicalSnapshot = snapshotProjectVrmReferences(archive.canonicalProject);
  const projectSnapshot = snapshotProjectVrmReferences(archive.project);
  if (!sceneSnapshotsMatch(canonicalSnapshot, projectSnapshot)) {
    throw new StudioVrmProjectLibraryError("import-project-mismatch");
  }

  const grouped = groupReferences(canonicalSnapshot.references);
  const installed: Array<{ hash: VrmContentHash; modelId: string }> = [];
  const reused: Array<{ hash: VrmContentHash; modelId: string }> = [];
  const unresolved: VrmContentHash[] = [];
  const diagnostics: StudioVrmProjectLibraryDiagnostic[] = [];

  for (const [hash, references] of grouped) {
    const pointers = references.map(({ pointer }) => pointer);
    if (metadataConflict(references)) {
      unresolved.push(hash);
      diagnostics.push({
        code: "LOCAL_MODEL_METADATA_CONFLICT",
        message: "같은 VRM 해시를 참조하는 장면들의 모델 크기 또는 MIME 정보가 충돌합니다.",
        hash,
        pointers,
      });
      continue;
    }
    const expectedBytes = references[0]?.model.byteSize;
    if (!expectedBytes) {
      unresolved.push(hash);
      diagnostics.push({
        code: "LOCAL_MODEL_METADATA_CONFLICT",
        message: "VRM 장면의 모델 크기 정보가 올바르지 않습니다.",
        hash,
        pointers,
      });
      continue;
    }
    const imported = archive.attachments.get(hash.slice("sha256:".length));
    if (!imported) {
      unresolved.push(hash);
      diagnostics.push(diagnosticForImportedFailure(hash, pointers, "missing"));
      continue;
    }
    const coverageFailure = attachmentCoversAllReferences(
      imported,
      hash,
      expectedBytes,
      references,
    );
    if (coverageFailure) {
      unresolved.push(hash);
      diagnostics.push(diagnosticForImportedFailure(hash, pointers, coverageFailure));
      continue;
    }
    const byteFailure = await verifyVrmBlob(imported.blob, hash, expectedBytes, dependencies);
    if (byteFailure) {
      unresolved.push(hash);
      diagnostics.push(diagnosticForImportedFailure(hash, pointers, byteFailure));
      continue;
    }

    const existing = await resolveVerifiedStoredModel(hash, expectedBytes, dependencies);
    if (existing.match) {
      reused.push({ hash, modelId: existing.match.record.id });
      continue;
    }

    let saved: VrmStoredModelRecord;
    try {
      saved = await dependencies.saveVerifiedBlob({
        name: references[0]?.model.name ?? "VRM 모델",
        blob: imported.blob,
        expectedHash: hash,
      });
    } catch {
      unresolved.push(hash);
      diagnostics.push({
        code: "LOCAL_MODEL_SAVE_FAILED",
        message: "검증된 archive VRM을 이 기기의 모델 라이브러리에 저장하지 못했습니다.",
        hash,
        pointers,
      });
      continue;
    }

    let verifiedSaved: VrmStoredModelWithContentIdentity;
    try {
      verifiedSaved = await dependencies.ensureStoredIdentity(saved);
    } catch {
      unresolved.push(hash);
      diagnostics.push({
        code: "LOCAL_MODEL_SAVE_FAILED",
        message: "저장한 VRM 모델을 다시 검증하지 못했습니다.",
        hash,
        pointers,
      });
      continue;
    }
    const savedFailure =
      canonicalizeVrmContentHash(verifiedSaved.contentHash) !== hash
      || verifiedSaved.byteSize !== expectedBytes
      || verifiedSaved.mimeType !== "model/gltf-binary"
      || verifiedSaved.validationVersion !== VRM_VALIDATION_VERSION
        ? "metadata-mismatch" as const
        : await verifyVrmBlob(verifiedSaved.blob, hash, expectedBytes, dependencies);
    if (savedFailure) {
      unresolved.push(hash);
      diagnostics.push({
        code: "LOCAL_MODEL_SAVE_FAILED",
        message: "저장 결과가 장면 문서의 VRM 콘텐츠 식별 정보와 일치하지 않습니다.",
        hash,
        pointers,
      });
      continue;
    }
    installed.push({ hash, modelId: verifiedSaved.id });
  }

  return {
    project: projectSnapshot.project,
    canonicalProject: canonicalSnapshot.project,
    installed,
    reused,
    unresolved,
    diagnostics,
  };
}
