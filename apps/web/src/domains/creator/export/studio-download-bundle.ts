import {
  buildStudioPackageArchiveBlob,
  type StudioPackageArchiveEntry,
} from "../studio-package-archive";

import type { StudioCrc32ExecutionMode } from "../studio-crc32-worker-client";

import {
  createStudioDownloadFileName,
  dedupeStudioDownloadFileNames,
  sanitizeStudioDownloadFileName,
} from "./studio-download-file-name";

export const STUDIO_DOWNLOAD_BUNDLE_MIME = "application/zip" as const;
export const STUDIO_DOWNLOAD_BUNDLE_MANIFEST_PATH = "manifest.json" as const;

export interface StudioDownloadBundleSource {
  blob: Blob;
  fileName: string;
}

export interface StudioDownloadBundleProgress {
  completedFiles: number;
  totalFiles: number;
  fileName: string;
}

export interface StudioDownloadBundleInput {
  title: string;
  files: readonly StudioDownloadBundleSource[];
  generatedAt?: Date | number | string;
  signal?: AbortSignal;
  crc32ExecutionMode?: StudioCrc32ExecutionMode;
  onProgress?: (progress: StudioDownloadBundleProgress) => void;
}

export interface StudioDownloadBundleManifestFile {
  ordinal: number;
  path: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
}

export interface StudioDownloadBundleManifest {
  schema: "toonstudio.download-bundle/v1";
  title: string;
  generatedAt: string;
  integrity: "zip-crc32";
  fileCount: number;
  totalBytes: number;
  files: readonly StudioDownloadBundleManifestFile[];
}

export interface StudioDownloadBundleResult {
  blob: Blob;
  fileName: string;
  manifest: StudioDownloadBundleManifest;
}

export interface PlannedStudioDownloadBundleFile extends StudioDownloadBundleSource {
  archivePath: string;
}

function normalizeGeneratedAt(value: Date | number | string | undefined): Date {
  const generatedAt = value instanceof Date
    ? new Date(value.getTime())
    : value === undefined
      ? new Date()
      : new Date(value);
  const time = generatedAt.getTime();
  const year = generatedAt.getUTCFullYear();
  if (!Number.isFinite(time) || year < 1980 || year > 2107) {
    throw new Error("다운로드 묶음 생성 시각이 올바르지 않습니다.");
  }
  return generatedAt;
}

export function planStudioDownloadBundleFiles(
  files: readonly StudioDownloadBundleSource[],
): PlannedStudioDownloadBundleFile[] {
  if (files.length === 0) {
    throw new Error("다운로드 묶음에 포함할 파일이 없습니다.");
  }
  const uniqueNames = dedupeStudioDownloadFileNames(
    files.map((file) => sanitizeStudioDownloadFileName(file.fileName)),
  );
  return files.map((file, index) => {
    if (!Number.isSafeInteger(file.blob.size) || file.blob.size < 0) {
      throw new Error("다운로드 파일 크기가 올바르지 않습니다.");
    }
    const fileName = uniqueNames[index]!;
    return {
      blob: file.blob,
      fileName,
      archivePath: `files/${fileName}`,
    };
  });
}

/**
 * Packages multiple generated outputs into one bounded ZIP32 delivery. The existing package
 * writer supplies path validation, duplicate rejection, CRC-32 integrity, cancellation, and
 * browser memory limits, so browsers request one download permission instead of one per part.
 */
export async function buildStudioDownloadBundle(
  input: StudioDownloadBundleInput,
): Promise<StudioDownloadBundleResult> {
  const files = planStudioDownloadBundleFiles(input.files);
  const generatedAt = normalizeGeneratedAt(input.generatedAt);
  const totalBytes = files.reduce((total, file) => total + file.blob.size, 0);
  if (!Number.isSafeInteger(totalBytes)) {
    throw new Error("다운로드 묶음의 전체 크기가 안전한 정수 범위를 넘었습니다.");
  }
  const title = input.title.trim() || "Toon Studio export";
  const manifest: StudioDownloadBundleManifest = {
    schema: "toonstudio.download-bundle/v1",
    title,
    generatedAt: generatedAt.toISOString(),
    integrity: "zip-crc32",
    fileCount: files.length,
    totalBytes,
    files: files.map((file, index) => ({
      ordinal: index + 1,
      path: file.archivePath,
      fileName: file.fileName,
      mimeType: file.blob.type || "application/octet-stream",
      byteLength: file.blob.size,
    })),
  };
  const manifestBlob = new Blob([`${JSON.stringify(manifest, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const entries: StudioPackageArchiveEntry[] = [
    { path: STUDIO_DOWNLOAD_BUNDLE_MANIFEST_PATH, data: manifestBlob },
    ...files.map((file) => ({ path: file.archivePath, data: file.blob })),
  ];
  const blob = await buildStudioPackageArchiveBlob(entries, {
    modifiedAt: generatedAt,
    mimeType: STUDIO_DOWNLOAD_BUNDLE_MIME,
    signal: input.signal,
    crc32ExecutionMode: input.crc32ExecutionMode ?? "worker",
    onProgress: (progress) => {
      if (progress.path === STUDIO_DOWNLOAD_BUNDLE_MANIFEST_PATH) return;
      input.onProgress?.({
        completedFiles: Math.max(0, progress.completedFiles - 1),
        totalFiles: files.length,
        fileName: progress.path.slice("files/".length),
      });
    },
  });
  return {
    blob,
    fileName: createStudioDownloadFileName({
      title: input.title,
      fallbackTitle: "toonspectrum-webtoon",
      suffix: "strip-bundle",
      extension: "zip",
    }),
    manifest,
  };
}
