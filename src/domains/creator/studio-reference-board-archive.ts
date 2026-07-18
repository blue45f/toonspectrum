import {
  canonicalizeStudioAssetContentHash,
  deleteAsset,
  ensureStudioAssetContentHash,
  listAssets,
  saveAsset,
  type StudioAsset,
  type StudioAssetWithContentHash,
} from "./studio-asset-library";
import {
  type ImportStudioProjectArchiveResult,
  type StudioProjectArchiveAttachmentInput,
  type StudioProjectArchiveDocumentReference,
} from "./studio-project-archive";
import { parseStudioProjectFile, type StudioProjectFile } from "./studio-project-file";
import {
  createDefaultStudioReferenceBoardDocument,
  parseStudioReferenceBoardDocument,
  type StudioReferenceBoardAssetDescriptor,
  type StudioReferenceBoardDocument,
  type StudioReferenceBoardSha256,
} from "./studio-reference-board";

/**
 * Reference-board archive bridge.
 *
 * The project document remains hash-only. This module is the explicit boundary that resolves those
 * hashes against the device-local asset library for export and installs authenticated archive
 * bytes back into that library after import. All dependencies are injectable so archive behavior
 * can be tested without IndexedDB or browser image decoders.
 */

export type StudioReferenceBoardArchiveDiagnosticCode =
  | "ASSET_DATA_INVALID"
  | "ASSET_HASH_MISMATCH"
  | "ASSET_NOT_FOUND"
  | "ASSET_SAVE_FAILED"
  | "ATTACHMENT_MISSING"
  | "ATTACHMENT_NOT_REFERENCE"
  | "DIMENSION_FALLBACK";

export interface StudioReferenceBoardArchiveDiagnostic {
  code: StudioReferenceBoardArchiveDiagnosticCode;
  message: string;
  sha256: StudioReferenceBoardSha256;
  pointers: string[];
}

export interface StudioReferenceBoardArchiveReference {
  sha256: StudioReferenceBoardSha256;
  /** RFC 6901 pointer to the canonical hash field in project.json. */
  pointer: string;
  itemId: string;
  itemIndex: number;
  asset: StudioReferenceBoardAssetDescriptor;
}

export interface StudioReferenceBoardArchiveMissingAsset {
  sha256: StudioReferenceBoardSha256;
  pointers: string[];
  reason: "invalid-data" | "hash-mismatch" | "not-found";
}

export interface PrepareStudioReferenceBoardArchiveExportResult {
  attachments: StudioProjectArchiveAttachmentInput[];
  missing: StudioReferenceBoardArchiveMissingAsset[];
  diagnostics: StudioReferenceBoardArchiveDiagnostic[];
  isComplete: boolean;
}

export interface StudioReferenceBoardArchiveExportDependencies {
  listAssets: () => Promise<StudioAsset[]>;
  ensureContentHash: (asset: StudioAsset) => Promise<StudioAssetWithContentHash>;
  digestBlob: (blob: Blob) => Promise<StudioReferenceBoardSha256>;
}

export interface StudioReferenceBoardArchiveImportDependencies
  extends StudioReferenceBoardArchiveExportDependencies {
  saveAsset: (input: {
    name: string;
    dataUrl: string;
    width: number;
    height: number;
    kind?: string;
  }) => Promise<StudioAssetWithContentHash>;
  deleteAsset: (id: string) => Promise<void>;
  decodeImageDimensions: (blob: Blob) => Promise<{ width: number; height: number } | null>;
}

export interface RestoreStudioReferenceBoardArchiveImportResult {
  document: StudioReferenceBoardDocument;
  project: StudioProjectFile;
  canonicalProject: StudioProjectFile;
  installed: Array<{ sha256: StudioReferenceBoardSha256; assetId: string }>;
  reused: Array<{ sha256: StudioReferenceBoardSha256; assetId: string }>;
  unresolved: StudioReferenceBoardSha256[];
  diagnostics: StudioReferenceBoardArchiveDiagnostic[];
}

interface VerifiedLocalAsset {
  asset: StudioAssetWithContentHash;
  blob: Blob;
}

interface ResolveLocalAssetResult {
  match: VerifiedLocalAsset | null;
  reason: StudioReferenceBoardArchiveMissingAsset["reason"];
}

const MAX_IMAGE_DIMENSION = 100_000;

function referencesByHash(
  references: readonly StudioReferenceBoardArchiveReference[]
): Map<StudioReferenceBoardSha256, StudioReferenceBoardArchiveReference[]> {
  const grouped = new Map<StudioReferenceBoardSha256, StudioReferenceBoardArchiveReference[]>();
  for (const reference of references) {
    const existing = grouped.get(reference.sha256);
    if (existing) existing.push(reference);
    else grouped.set(reference.sha256, [reference]);
  }
  return grouped;
}

/** Collects reference-board hashes in stable z-order and emits their exact project JSON pointers. */
export function collectStudioReferenceBoardArchiveReferences(
  project: StudioProjectFile | unknown
): StudioReferenceBoardArchiveReference[] {
  let parsed: StudioProjectFile;
  try {
    parsed = parseStudioProjectFile(project);
  } catch {
    return [];
  }
  const document = parseStudioReferenceBoardDocument(parsed.referenceBoard);
  if (!document) return [];
  return document.items.map((item, itemIndex) => ({
    sha256: item.asset.sha256,
    pointer: `/referenceBoard/items/${itemIndex}/asset/sha256`,
    itemId: item.id,
    itemIndex,
    asset: item.asset,
  }));
}

function base64Bytes(payload: string): Uint8Array {
  const normalized = payload.replace(/[\t\n\f\r ]/gu, "");
  if (
    normalized.length === 0
    || normalized.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(normalized)
  ) {
    throw new TypeError("참고 이미지 Base64 데이터가 올바르지 않습니다.");
  }
  let decoded: string;
  try {
    decoded = globalThis.atob(normalized);
  } catch {
    throw new TypeError("참고 이미지 Base64 데이터를 해석하지 못했습니다.");
  }
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function percentEncodedBytes(payload: string): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  let textStart = 0;
  const appendText = (end: number) => {
    if (end <= textStart) return;
    bytes.push(...encoder.encode(payload.slice(textStart, end)));
  };
  for (let index = 0; index < payload.length; index += 1) {
    if (payload[index] !== "%") continue;
    appendText(index);
    const encodedByte = payload.slice(index + 1, index + 3);
    if (!/^[a-f0-9]{2}$/iu.test(encodedByte)) {
      throw new TypeError("참고 이미지 percent encoding이 올바르지 않습니다.");
    }
    bytes.push(Number.parseInt(encodedByte, 16));
    index += 2;
    textStart = index + 1;
  }
  appendText(payload.length);
  return Uint8Array.from(bytes);
}

function studioAssetDataUrlToBlob(dataUrl: string): Blob {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new TypeError("참고 이미지 에셋은 data URL이어야 합니다.");
  }
  const separator = dataUrl.indexOf(",");
  if (separator < 5) throw new TypeError("참고 이미지 data URL 형식이 올바르지 않습니다.");
  const metadata = dataUrl.slice(5, separator);
  const metadataParts = metadata.split(";");
  const mimeType = (metadataParts[0] || "application/octet-stream").trim().toLowerCase();
  const isBase64 = metadataParts.slice(1).some((part) => part.trim().toLowerCase() === "base64");
  const payload = dataUrl.slice(separator + 1);
  const bytes = isBase64 ? base64Bytes(payload) : percentEncodedBytes(payload);
  const buffer = bytes.slice().buffer as ArrayBuffer;
  return new Blob([buffer], { type: mimeType });
}

async function defaultDigestBlob(blob: Blob): Promise<StudioReferenceBoardSha256> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("이 브라우저에서는 참고 이미지 무결성을 확인할 수 없습니다.");
  const digest = await subtle.digest("SHA-256", await blob.arrayBuffer());
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

const defaultExportDependencies: StudioReferenceBoardArchiveExportDependencies = {
  listAssets,
  ensureContentHash: ensureStudioAssetContentHash,
  digestBlob: defaultDigestBlob,
};

function orderedAssetCandidates(
  assets: readonly StudioAsset[],
  sha256: StudioReferenceBoardSha256,
  assetIdHints: ReadonlySet<string>
): StudioAsset[] {
  const hashMatches: StudioAsset[] = [];
  const hinted: StudioAsset[] = [];
  const remaining: StudioAsset[] = [];
  for (const asset of assets) {
    if (canonicalizeStudioAssetContentHash(asset.contentHash) === sha256) hashMatches.push(asset);
    else if (assetIdHints.has(asset.id)) hinted.push(asset);
    else remaining.push(asset);
  }
  return [...hashMatches, ...hinted, ...remaining];
}

async function resolveVerifiedLocalAsset(
  assets: readonly StudioAsset[],
  sha256: StudioReferenceBoardSha256,
  assetIdHints: ReadonlySet<string>,
  dependencies: StudioReferenceBoardArchiveExportDependencies
): Promise<ResolveLocalAssetResult> {
  let sawInvalidData = false;
  let sawHashMismatch = false;
  for (const candidate of orderedAssetCandidates(assets, sha256, assetIdHints)) {
    let ensured: StudioAssetWithContentHash;
    try {
      ensured = await dependencies.ensureContentHash(candidate);
    } catch {
      sawInvalidData = true;
      continue;
    }
    if (canonicalizeStudioAssetContentHash(ensured.contentHash) !== sha256) continue;
    let blob: Blob;
    try {
      blob = studioAssetDataUrlToBlob(ensured.dataUrl);
      if (await dependencies.digestBlob(blob) !== sha256) {
        sawHashMismatch = true;
        continue;
      }
    } catch {
      sawInvalidData = true;
      continue;
    }
    return { match: { asset: ensured, blob }, reason: "not-found" };
  }
  return {
    match: null,
    reason: sawHashMismatch ? "hash-mismatch" : sawInvalidData ? "invalid-data" : "not-found",
  };
}

function diagnosticForMissing(
  missing: StudioReferenceBoardArchiveMissingAsset
): StudioReferenceBoardArchiveDiagnostic {
  if (missing.reason === "hash-mismatch") {
    return {
      code: "ASSET_HASH_MISMATCH",
      message: "로컬 에셋의 실제 바이트 해시가 참고 보드의 SHA-256과 달라 archive에 포함하지 않았습니다.",
      ...missing,
    };
  }
  if (missing.reason === "invalid-data") {
    return {
      code: "ASSET_DATA_INVALID",
      message: "로컬 참고 이미지 데이터를 안전하게 읽을 수 없어 archive에 포함하지 않았습니다.",
      ...missing,
    };
  }
  return {
    code: "ASSET_NOT_FOUND",
    message: "참고 보드가 가리키는 SHA-256 에셋을 이 기기의 라이브러리에서 찾지 못했습니다.",
    ...missing,
  };
}

/**
 * Resolves and verifies every reference-board asset, deduping equal hashes into one archive input.
 * Missing or tampered local assets are reported and never substituted through an assetId hint.
 */
export async function prepareStudioReferenceBoardArchiveExport(
  project: StudioProjectFile | unknown,
  dependencyOverrides: Partial<StudioReferenceBoardArchiveExportDependencies> = {}
): Promise<PrepareStudioReferenceBoardArchiveExportResult> {
  const dependencies = { ...defaultExportDependencies, ...dependencyOverrides };
  const grouped = referencesByHash(collectStudioReferenceBoardArchiveReferences(project));
  if (grouped.size === 0) {
    return { attachments: [], missing: [], diagnostics: [], isComplete: true };
  }
  let assets: StudioAsset[];
  try {
    assets = await dependencies.listAssets();
  } catch {
    assets = [];
  }
  const attachments: StudioProjectArchiveAttachmentInput[] = [];
  const missing: StudioReferenceBoardArchiveMissingAsset[] = [];
  for (const [sha256, references] of grouped) {
    const hints = new Set(references.flatMap(({ asset }) => asset.assetId ? [asset.assetId] : []));
    const resolved = await resolveVerifiedLocalAsset(assets, sha256, hints, dependencies);
    const pointers = references.map(({ pointer }) => pointer);
    if (!resolved.match) {
      missing.push({ sha256, pointers, reason: resolved.reason });
      continue;
    }
    const documentReferences: StudioProjectArchiveDocumentReference[] = pointers.map((pointer) => ({
      pointer,
      usage: "reference",
      mode: "sha256-prefixed",
    }));
    attachments.push({
      kind: "reference",
      data: resolved.match.blob,
      mimeType: resolved.match.blob.type,
      documentReferences,
    });
  }
  const diagnostics = missing.map(diagnosticForMissing);
  return { attachments, missing, diagnostics, isComplete: missing.length === 0 };
}

function bytesToDataUrl(blob: Blob, bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${globalThis.btoa(chunks.join(""))}`;
}

function validDimensions(
  value: { width: number; height: number } | null | undefined
): value is { width: number; height: number } {
  return Boolean(
    value
    && Number.isSafeInteger(value.width)
    && value.width >= 1
    && value.width <= MAX_IMAGE_DIMENSION
    && Number.isSafeInteger(value.height)
    && value.height >= 1
    && value.height <= MAX_IMAGE_DIMENSION
  );
}

async function defaultDecodeImageDimensions(
  blob: Blob
): Promise<{ width: number; height: number } | null> {
  if (typeof globalThis.createImageBitmap !== "function") return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await globalThis.createImageBitmap(blob);
    const decoded = { width: bitmap.width, height: bitmap.height };
    return validDimensions(decoded) ? decoded : null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

const defaultImportDependencies: StudioReferenceBoardArchiveImportDependencies = {
  ...defaultExportDependencies,
  saveAsset,
  deleteAsset,
  decodeImageDimensions: defaultDecodeImageDimensions,
};

function archiveReferenceCoversPointers(
  sha256: StudioReferenceBoardSha256,
  pointers: readonly string[],
  archive: ImportStudioProjectArchiveResult
): "missing" | "not-reference" | "covered" {
  const attachment = archive.attachments.get(sha256.slice("sha256:".length));
  if (!attachment) return "missing";
  if (!attachment.metadata.kinds.includes("reference")) return "not-reference";
  const pointerSet = new Set(pointers);
  const hasAuthenticatedReference = attachment.metadata.documentReferences.some((reference) =>
    pointerSet.has(reference.pointer)
    && reference.usage === "reference"
    && reference.mode === "sha256-prefixed"
  );
  return hasAuthenticatedReference ? "covered" : "not-reference";
}

function replaceReferenceBoardAssetIds(
  document: StudioReferenceBoardDocument,
  localIds: ReadonlyMap<StudioReferenceBoardSha256, string>
): StudioReferenceBoardDocument {
  let changed = false;
  const items = document.items.map((item) => {
    const assetId = localIds.get(item.asset.sha256);
    if (!assetId || item.asset.assetId === assetId) return item;
    changed = true;
    return { ...item, asset: { ...item.asset, assetId } };
  });
  return changed ? { ...document, items } : document;
}

/**
 * Installs only authenticated `reference` attachments actually used by the imported board. Equal
 * local hashes are reused, and the returned project changes only device-local assetId hints.
 */
export async function restoreStudioReferenceBoardArchiveImport(
  archive: ImportStudioProjectArchiveResult,
  dependencyOverrides: Partial<StudioReferenceBoardArchiveImportDependencies> = {}
): Promise<RestoreStudioReferenceBoardArchiveImportResult> {
  const dependencies = { ...defaultImportDependencies, ...dependencyOverrides };
  const sourceDocument = parseStudioReferenceBoardDocument(archive.project.referenceBoard)
    ?? createDefaultStudioReferenceBoardDocument();
  const grouped = referencesByHash(collectStudioReferenceBoardArchiveReferences(archive.project));
  const diagnostics: StudioReferenceBoardArchiveDiagnostic[] = [];
  const installed: Array<{ sha256: StudioReferenceBoardSha256; assetId: string }> = [];
  const reused: Array<{ sha256: StudioReferenceBoardSha256; assetId: string }> = [];
  const unresolved: StudioReferenceBoardSha256[] = [];
  const localIds = new Map<StudioReferenceBoardSha256, string>();
  let assets: StudioAsset[];
  try {
    assets = await dependencies.listAssets();
  } catch {
    assets = [];
  }

  for (const [sha256, references] of grouped) {
    const pointers = references.map(({ pointer }) => pointer);
    const hints = new Set(references.flatMap(({ asset }) => asset.assetId ? [asset.assetId] : []));
    const existing = await resolveVerifiedLocalAsset(assets, sha256, hints, dependencies);
    if (existing.match) {
      localIds.set(sha256, existing.match.asset.id);
      reused.push({ sha256, assetId: existing.match.asset.id });
      continue;
    }

    const coverage = archiveReferenceCoversPointers(sha256, pointers, archive);
    const importedAttachment = archive.attachments.get(sha256.slice("sha256:".length));
    if (coverage !== "covered" || !importedAttachment) {
      unresolved.push(sha256);
      diagnostics.push({
        code: coverage === "missing" ? "ATTACHMENT_MISSING" : "ATTACHMENT_NOT_REFERENCE",
        message: coverage === "missing"
          ? "가져온 archive에 참고 보드 이미지 attachment가 없습니다."
          : "가져온 attachment가 참고 보드 hash pointer와 안전하게 연결되지 않았습니다.",
        sha256,
        pointers,
      });
      continue;
    }

    const descriptor = references[0]?.asset;
    const descriptorDimensions = descriptor?.width !== undefined && descriptor.height !== undefined
      ? { width: descriptor.width, height: descriptor.height }
      : null;
    let dimensions = validDimensions(descriptorDimensions) ? descriptorDimensions : null;
    if (!dimensions) {
      dimensions = await dependencies.decodeImageDimensions(importedAttachment.blob);
    }
    if (!validDimensions(dimensions)) {
      dimensions = { width: 1, height: 1 };
      diagnostics.push({
        code: "DIMENSION_FALLBACK",
        message: "참고 이미지 크기를 해석하지 못해 안전한 1×1 fallback 메타데이터를 사용했습니다.",
        sha256,
        pointers,
      });
    }

    let saved: StudioAssetWithContentHash;
    try {
      const bytes = new Uint8Array(await importedAttachment.blob.arrayBuffer());
      const dataUrl = bytesToDataUrl(importedAttachment.blob, bytes);
      saved = await dependencies.saveAsset({
        name: descriptor?.name ?? "참고 이미지",
        dataUrl,
        width: dimensions.width,
        height: dimensions.height,
      });
      const canonicalSavedHash = canonicalizeStudioAssetContentHash(saved.contentHash);
      if (canonicalSavedHash !== sha256) {
        try {
          await dependencies.deleteAsset(saved.id);
        } catch {
          // Best effort rollback. A mismatching row is never linked into the document.
        }
        throw new Error("saved hash mismatch");
      }
    } catch {
      unresolved.push(sha256);
      diagnostics.push({
        code: "ASSET_SAVE_FAILED",
        message: "archive의 참고 이미지를 이 기기의 에셋 라이브러리에 저장하지 못했습니다.",
        sha256,
        pointers,
      });
      continue;
    }
    localIds.set(sha256, saved.id);
    installed.push({ sha256, assetId: saved.id });
    assets = [...assets, saved];
  }

  const document = replaceReferenceBoardAssetIds(sourceDocument, localIds);
  const project = parseStudioProjectFile({ ...archive.project, referenceBoard: document });
  const canonicalProject = parseStudioProjectFile({
    ...archive.canonicalProject,
    referenceBoard: document,
  });
  return { document, project, canonicalProject, installed, reused, unresolved, diagnostics };
}
