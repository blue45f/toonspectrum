import {
  buildStudioPackageArchiveBlob,
  type StudioPackageArchiveBuildOptions,
  type StudioPackageArchiveProgress,
} from "../studio-package-archive";
import { sha256HexPortable } from "../studio-sha256";

import type { ExportFormat } from "./studio-export";

export const STUDIO_DOWNLOAD_PACKAGE_SCHEMA =
  "https://toonstudio.cloud/schemas/studio-download-package/v1" as const;
export const STUDIO_DOWNLOAD_PACKAGE_MIME = "application/zip" as const;
export const STUDIO_DOWNLOAD_PACKAGE_MAX_PAGES = 1_000;
export const STUDIO_DOWNLOAD_PACKAGE_MAX_PAGE_BYTES = 256_000_000;
export const STUDIO_DOWNLOAD_PACKAGE_MAX_TOTAL_PAGE_BYTES = 500_000_000;

const textEncoder = new TextEncoder();
const WINDOWS_RESERVED_NAME =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const UNSAFE_FILE_CHARACTER = /[<>:"/\\|?*\u0000-\u001f\u007f]/gu;
const UNSAFE_BIDI_CHARACTER = /[\u202a-\u202e\u2066-\u2069]/gu;

export interface StudioDownloadPackagePageInput {
  /** Zero-based document page index. */
  index: number;
  label?: string;
  width: number;
  height: number;
  image: Blob;
}

export interface StudioDownloadPackageInput {
  title: string;
  format: ExportFormat;
  scale: number;
  transparentRequested: boolean;
  pages: readonly StudioDownloadPackagePageInput[];
  /** Injectable for deterministic tests; defaults to the current instant. */
  createdAt?: Date | number | string;
}

export type StudioDownloadPackageProgressPhase = "hashing" | "archiving";

export interface StudioDownloadPackageProgress {
  phase: StudioDownloadPackageProgressPhase;
  completed: number;
  total: number;
  processedBytes: number;
  totalBytes: number;
  path?: string;
}

export interface StudioDownloadPackageBuildOptions {
  signal?: AbortSignal;
  onProgress?: (progress: StudioDownloadPackageProgress) => void;
  crc32ExecutionMode?: StudioPackageArchiveBuildOptions["crc32ExecutionMode"];
}

export interface StudioDownloadPackageManifestPage {
  pageNumber: number;
  sourceIndex: number;
  label: string;
  path: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

export interface StudioDownloadPackageManifest {
  schema: typeof STUDIO_DOWNLOAD_PACKAGE_SCHEMA;
  schemaVersion: 1;
  generator: {
    name: "ToonSpectrum Studio";
    feature: "verified-page-download-package";
  };
  createdAt: string;
  title: string;
  format: ExportFormat;
  scale: number;
  transparentRequested: boolean;
  captureMode: "flattened-page";
  checksum: "SHA-256";
  pageCount: number;
  totalPageBytes: number;
  pages: readonly StudioDownloadPackageManifestPage[];
}

export interface StudioDownloadPackageResult {
  blob: Blob;
  fileName: string;
  manifest: StudioDownloadPackageManifest;
}

export type StudioDownloadPackageErrorCode =
  | "ABORTED"
  | "EMPTY"
  | "MIME_MISMATCH"
  | "PAGE_INVALID"
  | "PAGE_LIMIT"
  | "SIZE_LIMIT"
  | "TIMESTAMP_INVALID";

export class StudioDownloadPackageError extends Error {
  readonly code: StudioDownloadPackageErrorCode;
  readonly pageIndex?: number;

  constructor(
    code: StudioDownloadPackageErrorCode,
    message: string,
    pageIndex?: number,
  ) {
    super(message);
    this.name = "StudioDownloadPackageError";
    this.code = code;
    if (pageIndex !== undefined) this.pageIndex = pageIndex;
  }
}

interface PreparedPage {
  source: StudioDownloadPackagePageInput;
  label: string;
  path: string;
  mimeType: string;
}

function packageError(
  code: StudioDownloadPackageErrorCode,
  message: string,
  pageIndex?: number,
): StudioDownloadPackageError {
  return new StudioDownloadPackageError(code, message, pageIndex);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw packageError("ABORTED", "다운로드 패키지 생성을 취소했어요.");
}

function expectedMimeType(format: ExportFormat): string {
  if (format === "jpg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

function isMatchingMimeType(actual: string, expected: string): boolean {
  const normalized = actual.trim().toLowerCase();
  if (expected === "image/jpeg") {
    return normalized === "image/jpeg" || normalized === "image/jpg";
  }
  return normalized === expected;
}

function truncateUnicode(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join("");
}

export function sanitizeStudioDownloadFileStem(
  value: string,
  fallback = "toonspectrum-comic",
): string {
  const normalized = value
    .normalize("NFKC")
    .replace(UNSAFE_BIDI_CHARACTER, "")
    .replace(UNSAFE_FILE_CHARACTER, "-")
    .replace(/\s+/gu, " ")
    .replace(/[-_. ]{2,}/gu, "-")
    .replace(/^[. -]+|[. -]+$/gu, "")
    .trim();
  let stem = truncateUnicode(normalized, 80).replace(/[. ]+$/gu, "");
  if (!stem || WINDOWS_RESERVED_NAME.test(stem)) stem = fallback;
  return stem;
}

export function studioDownloadPackageFileName(title: string): string {
  return `${sanitizeStudioDownloadFileStem(title)}-verified-pages.zip`;
}

function resolveCreatedAt(value: StudioDownloadPackageInput["createdAt"]): Date {
  const date =
    value === undefined
      ? new Date()
      : value instanceof Date
        ? new Date(value.getTime())
        : new Date(value);
  const time = date.getTime();
  const year = date.getUTCFullYear();
  if (!Number.isFinite(time) || year < 1980 || year > 2107) {
    throw packageError(
      "TIMESTAMP_INVALID",
      "다운로드 패키지 생성 시각이 ZIP 지원 범위를 벗어났어요.",
    );
  }
  return date;
}

function assertSafeInteger(
  value: number,
  label: string,
  pageIndex: number,
  minimum = 0,
): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw packageError(
      "PAGE_INVALID",
      `${pageIndex + 1}페이지의 ${label} 값이 올바르지 않아요.`,
      pageIndex,
    );
  }
}

function preparePages(
  input: StudioDownloadPackageInput,
): readonly PreparedPage[] {
  if (!Array.isArray(input.pages) || input.pages.length === 0) {
    throw packageError("EMPTY", "다운로드할 페이지가 없어요.");
  }
  if (input.pages.length > STUDIO_DOWNLOAD_PACKAGE_MAX_PAGES) {
    throw packageError(
      "PAGE_LIMIT",
      `한 패키지에는 최대 ${STUDIO_DOWNLOAD_PACKAGE_MAX_PAGES.toLocaleString("ko-KR")}페이지를 담을 수 있어요.`,
    );
  }
  if (!Number.isFinite(input.scale) || input.scale <= 0 || input.scale > 16) {
    throw packageError("PAGE_INVALID", "내보내기 배율이 올바르지 않아요.");
  }

  const mimeType = expectedMimeType(input.format);
  const seenIndices = new Set<number>();
  const ordered = [...input.pages].sort((left, right) => left.index - right.index);
  const digits = Math.max(4, String(ordered.length).length);
  let totalBytes = 0;

  return ordered.map((page, position) => {
    assertSafeInteger(page.index, "문서 순서", page.index);
    assertSafeInteger(page.width, "너비", page.index, 1);
    assertSafeInteger(page.height, "높이", page.index, 1);
    if (seenIndices.has(page.index)) {
      throw packageError(
        "PAGE_INVALID",
        `${page.index + 1}페이지가 패키지 입력에 중복되었어요.`,
        page.index,
      );
    }
    seenIndices.add(page.index);
    if (!(page.image instanceof Blob) || page.image.size <= 0) {
      throw packageError(
        "PAGE_INVALID",
        `${page.index + 1}페이지 이미지가 비어 있어요.`,
        page.index,
      );
    }
    if (!isMatchingMimeType(page.image.type, mimeType)) {
      throw packageError(
        "MIME_MISMATCH",
        `${page.index + 1}페이지의 실제 형식(${page.image.type || "unknown"})이 ${mimeType}과 일치하지 않아요.`,
        page.index,
      );
    }
    if (page.image.size > STUDIO_DOWNLOAD_PACKAGE_MAX_PAGE_BYTES) {
      throw packageError(
        "SIZE_LIMIT",
        `${page.index + 1}페이지가 개별 파일 크기 한도를 넘었어요.`,
        page.index,
      );
    }
    totalBytes += page.image.size;
    if (
      !Number.isSafeInteger(totalBytes) ||
      totalBytes > STUDIO_DOWNLOAD_PACKAGE_MAX_TOTAL_PAGE_BYTES
    ) {
      throw packageError(
        "SIZE_LIMIT",
        "페이지 이미지 합계가 브라우저 안전 한도를 넘었어요. 배율이나 페이지 범위를 줄여주세요.",
        page.index,
      );
    }

    const label = sanitizeStudioDownloadFileStem(
      page.label?.trim() || `${page.index + 1}페이지`,
      "page",
    );
    const pageNumber = String(position + 1).padStart(digits, "0");
    return {
      source: page,
      label,
      path: `pages/${pageNumber}-${label}.${input.format}`,
      mimeType,
    };
  });
}

function readmeText(manifest: StudioDownloadPackageManifest): string {
  return [
    "ToonSpectrum Studio verified page download package",
    "",
    `Title: ${manifest.title}`,
    `Created: ${manifest.createdAt}`,
    `Pages: ${manifest.pageCount}`,
    `Format: ${manifest.format.toUpperCase()}`,
    `Scale: ${manifest.scale}x`,
    "",
    "Integrity",
    "- manifest.json contains one SHA-256 digest per page image.",
    "- Verify the bytes before upload, delivery, or long-term archiving.",
    "- Read pages by manifest pageNumber/sourceIndex rather than filesystem locale order.",
    "",
    "Contents",
    "- pages/: flattened page images in document order",
    "- manifest.json: dimensions, byte sizes, ordering, and SHA-256 checksums",
    "- README.txt: this handoff note",
    "",
  ].join("\n");
}

function archiveProgress(
  progress: StudioPackageArchiveProgress,
): StudioDownloadPackageProgress {
  return {
    phase: "archiving",
    completed: progress.completedFiles,
    total: progress.totalFiles,
    processedBytes: progress.processedBytes,
    totalBytes: progress.totalBytes,
    path: progress.path,
  };
}

export async function buildStudioDownloadPackage(
  input: StudioDownloadPackageInput,
  options: StudioDownloadPackageBuildOptions = {},
): Promise<StudioDownloadPackageResult> {
  throwIfAborted(options.signal);
  const createdAt = resolveCreatedAt(input.createdAt);
  const prepared = preparePages(input);
  const totalPageBytes = prepared.reduce(
    (sum, page) => sum + page.source.image.size,
    0,
  );
  let processedBytes = 0;
  const manifestPages: StudioDownloadPackageManifestPage[] = [];

  for (let position = 0; position < prepared.length; position += 1) {
    throwIfAborted(options.signal);
    const page = prepared[position]!;
    const bytes = new Uint8Array(await page.source.image.arrayBuffer());
    throwIfAborted(options.signal);
    let sha256: string;
    const subtle = globalThis.crypto?.subtle;
    if (subtle && typeof subtle.digest === "function") {
      try {
        const digest = await subtle.digest("SHA-256", bytes);
        sha256 = Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      } catch {
        sha256 = sha256HexPortable(bytes);
      }
    } else {
      sha256 = sha256HexPortable(bytes);
    }
    processedBytes += bytes.byteLength;
    manifestPages.push({
      pageNumber: position + 1,
      sourceIndex: page.source.index,
      label: page.source.label?.trim() || `${page.source.index + 1}페이지`,
      path: page.path,
      mimeType: page.mimeType,
      width: page.source.width,
      height: page.source.height,
      bytes: page.source.image.size,
      sha256,
    });
    options.onProgress?.({
      phase: "hashing",
      completed: position + 1,
      total: prepared.length,
      processedBytes,
      totalBytes: totalPageBytes,
      path: page.path,
    });
  }

  const title = sanitizeStudioDownloadFileStem(input.title);
  const manifest: StudioDownloadPackageManifest = {
    schema: STUDIO_DOWNLOAD_PACKAGE_SCHEMA,
    schemaVersion: 1,
    generator: {
      name: "ToonSpectrum Studio",
      feature: "verified-page-download-package",
    },
    createdAt: createdAt.toISOString(),
    title,
    format: input.format,
    scale: input.scale,
    transparentRequested: input.transparentRequested,
    captureMode: "flattened-page",
    checksum: "SHA-256",
    pageCount: manifestPages.length,
    totalPageBytes,
    pages: manifestPages,
  };
  const manifestBytes = textEncoder.encode(
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const readmeBytes = textEncoder.encode(readmeText(manifest));
  const entries = [
    { path: "manifest.json", data: manifestBytes },
    { path: "README.txt", data: readmeBytes },
    ...prepared.map((page) => ({
      path: page.path,
      data: page.source.image,
    })),
  ];

  const blob = await buildStudioPackageArchiveBlob(entries, {
    modifiedAt: createdAt,
    mimeType: STUDIO_DOWNLOAD_PACKAGE_MIME,
    signal: options.signal,
    crc32ExecutionMode: options.crc32ExecutionMode,
    limits: {
      maxFiles: STUDIO_DOWNLOAD_PACKAGE_MAX_PAGES + 2,
      maxEntryBytes: STUDIO_DOWNLOAD_PACKAGE_MAX_PAGE_BYTES,
      maxTotalBytes: 512_000_000,
      maxArchiveBytes: 520_000_000,
      maxPathBytes: 1_024,
    },
    onProgress: (progress) => {
      options.onProgress?.(archiveProgress(progress));
    },
  });
  throwIfAborted(options.signal);

  return {
    blob,
    fileName: studioDownloadPackageFileName(title),
    manifest,
  };
}
