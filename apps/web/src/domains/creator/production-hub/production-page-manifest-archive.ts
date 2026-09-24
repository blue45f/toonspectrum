import {
  buildStudioPackageArchiveBlob,
  type StudioPackageArchiveBuildOptions,
  type StudioPackageArchiveEntry,
} from "../studio-package-archive";
import { sha256HexPortable } from "../studio-sha256";
import { getStudioVirtualSpaceReviewPreview } from "../virtual-space/studio-virtual-space-review-preview";
import { manifestPageFromPreview, type ProductionManifestPage, type ProductionReviewCandidate } from "./production-manuscript-competitive-model";

const encoder = new TextEncoder();

export const PRODUCTION_PAGE_MANIFEST_SCHEMA = "toonspectrum.page-manifest.v1";
export const PRODUCTION_PAGE_MANIFEST_MIME = "application/vnd.comicbook+zip";

export interface ProductionPageManifestArchiveInput {
  readonly projectId: string;
  readonly workId: string;
  readonly artifactId: string;
  readonly title: string;
  readonly pages: readonly ProductionManifestPage[];
  readonly now?: Date;
  readonly signal?: AbortSignal;
  readonly onProgress?: StudioPackageArchiveBuildOptions["onProgress"];
  readonly fetcher?: typeof fetch;
  readonly archiveBuilder?: typeof buildStudioPackageArchiveBlob;
}

export interface ProductionPageManifestArchiveResult {
  readonly blob: Blob;
  readonly fileName: string;
  readonly manifest: {
    readonly schema: typeof PRODUCTION_PAGE_MANIFEST_SCHEMA;
    readonly projectId: string;
    readonly workId: string;
    readonly artifactId: string;
    readonly title: string;
    readonly createdAt: string;
    readonly pageCount: number;
    readonly contentBytes: number;
    readonly pages: readonly {
      readonly ordinal: number;
      readonly path: string;
      readonly sha256: string;
      readonly mediaType: string;
      readonly byteLength: number;
      readonly sourceReviewId: string;
      readonly sourceRevisionId: string;
      readonly sourceArtifactId: string;
      readonly sourceOrdinal: number;
      readonly mapping: ProductionManifestPage["mapping"];
    }[];
  };
}

export class ProductionPageManifestArchiveError extends Error {
  readonly code:
    | "EMPTY_MANIFEST"
    | "LEASE_EXPIRED"
    | "SOURCE_UNAVAILABLE"
    | "SOURCE_SIZE_MISMATCH"
    | "SOURCE_HASH_MISMATCH"
    | "SOURCE_MEDIA_MISMATCH";
  readonly pageIndex?: number;

  constructor(
    code: ProductionPageManifestArchiveError["code"],
    message: string,
    pageIndex?: number,
  ) {
    super(message);
    this.name = "ProductionPageManifestArchiveError";
    this.code = code;
    if (pageIndex !== undefined) this.pageIndex = pageIndex;
  }
}

function safeFileBase(value: string): string {
  const withoutControls = Array.from(value.normalize("NFKC"), (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? "-" : character;
  }).join("");
  const normalized = withoutControls
    .replace(/[<>:"/\\|?*]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[. ]+$/gu, "")
    .slice(0, 80);
  return normalized || "toonstudio-manuscript";
}

function extension(mediaType: ProductionManifestPage["mediaType"]): "png" | "jpg" | "webp" {
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return "png";
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function normalizeContentType(value: string | null): string | null {
  if (!value) return null;
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}

async function fetchVerifiedPage(
  page: ProductionManifestPage,
  index: number,
  now: number,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<Blob> {
  if (page.expiresAt <= now) {
    throw new ProductionPageManifestArchiveError(
      "LEASE_EXPIRED",
      `${index + 1}페이지의 고정 미리보기 권한 시간이 지났습니다. 페이지 목록을 새로 확인해 주세요.`,
      index,
    );
  }
  const response = await fetcher(page.url, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    signal,
  });
  if (!response.ok) {
    throw new ProductionPageManifestArchiveError(
      "SOURCE_UNAVAILABLE",
      `${index + 1}페이지의 고정 원고를 불러오지 못했습니다.`,
      index,
    );
  }
  const contentType = normalizeContentType(response.headers.get("content-type"));
  if (contentType && contentType !== page.mediaType) {
    throw new ProductionPageManifestArchiveError(
      "SOURCE_MEDIA_MISMATCH",
      `${index + 1}페이지의 파일 형식이 고정 검수 정보와 다릅니다.`,
      index,
    );
  }
  const blob = await response.blob();
  if (blob.size !== page.byteLength) {
    throw new ProductionPageManifestArchiveError(
      "SOURCE_SIZE_MISMATCH",
      `${index + 1}페이지의 파일 크기가 고정 검수 정보와 다릅니다.`,
      index,
    );
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (sha256HexPortable(bytes) !== page.sha256) {
    throw new ProductionPageManifestArchiveError(
      "SOURCE_HASH_MISMATCH",
      `${index + 1}페이지의 무결성 검증에 실패했습니다.`,
      index,
    );
  }
  return new Blob([bytes], { type: page.mediaType });
}

export async function collectProductionReviewManifestPages(
  candidate: ProductionReviewCandidate,
  options: {
    readonly signal?: AbortSignal;
    readonly loader?: typeof getStudioVirtualSpaceReviewPreview;
    readonly maxPages?: number;
  } = {},
): Promise<readonly ProductionManifestPage[]> {
  const loader = options.loader ?? getStudioVirtualSpaceReviewPreview;
  const maxPages = Math.max(1, Math.min(1_100, options.maxPages ?? 1_000));
  const pages: ProductionManifestPage[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    options.signal?.throwIfAborted();
    const result = await loader(candidate.subject, cursor);
    if (!result.ok) {
      throw new ProductionPageManifestArchiveError(
        "SOURCE_UNAVAILABLE",
        "고정 검수본의 전체 페이지 목록을 확인하지 못했습니다.",
      );
    }
    for (const preview of result.previews) {
      pages.push(manifestPageFromPreview(candidate, preview));
      if (pages.length > maxPages) {
        throw new ProductionPageManifestArchiveError(
          "SOURCE_UNAVAILABLE",
          `빠른 출력은 한 번에 ${maxPages.toLocaleString("ko-KR")}페이지까지 지원합니다.`,
        );
      }
    }
    cursor = result.nextCursor;
    if (cursor) {
      if (cursors.has(cursor)) {
        throw new ProductionPageManifestArchiveError("SOURCE_UNAVAILABLE", "페이지 목록 커서가 반복되어 출력을 중단했습니다.");
      }
      cursors.add(cursor);
    }
  } while (cursor);
  return Object.freeze(pages);
}

export async function buildProductionPageManifestArchive(
  input: ProductionPageManifestArchiveInput,
): Promise<ProductionPageManifestArchiveResult> {
  if (input.pages.length === 0) {
    throw new ProductionPageManifestArchiveError("EMPTY_MANIFEST", "버전에 포함할 페이지를 한 장 이상 선택해 주세요.");
  }
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const fetcher = input.fetcher ?? fetch;
  const archiveBuilder = input.archiveBuilder ?? buildStudioPackageArchiveBlob;
  const pageEntries: StudioPackageArchiveEntry[] = [];
  const pageManifest: ProductionPageManifestArchiveResult["manifest"]["pages"][number][] = [];
  let contentBytes = 0;

  for (const [index, page] of input.pages.entries()) {
    input.signal?.throwIfAborted();
    const blob = await fetchVerifiedPage(page, index, nowMs, fetcher, input.signal);
    const path = `pages/${String(index + 1).padStart(4, "0")}.${extension(page.mediaType)}`;
    pageEntries.push({ path, data: blob });
    contentBytes += blob.size;
    pageManifest.push({
      ordinal: index,
      path,
      sha256: page.sha256,
      mediaType: page.mediaType,
      byteLength: page.byteLength,
      sourceReviewId: page.sourceReviewId,
      sourceRevisionId: page.sourceRevisionId,
      sourceArtifactId: page.sourceArtifactId,
      sourceOrdinal: page.sourceOrdinal,
      mapping: page.mapping,
    });
  }

  const manifest = Object.freeze({
    schema: PRODUCTION_PAGE_MANIFEST_SCHEMA,
    projectId: input.projectId,
    workId: input.workId,
    artifactId: input.artifactId,
    title: input.title,
    createdAt: now.toISOString(),
    pageCount: pageManifest.length,
    contentBytes,
    pages: Object.freeze(pageManifest),
  });
  const manifestBytes = encoder.encode(canonicalJson(manifest));
  const blob = await archiveBuilder([
    { path: "toonspectrum-page-manifest.json", data: manifestBytes },
    ...pageEntries,
  ], {
    mimeType: PRODUCTION_PAGE_MANIFEST_MIME,
    modifiedAt: now,
    crc32ExecutionMode: "worker",
    signal: input.signal,
    onProgress: input.onProgress,
    limits: {
      maxFiles: Math.min(1_100, pageEntries.length + 1),
      maxTotalBytes: 512_000_000,
      maxArchiveBytes: 520_000_000,
    },
  });
  return Object.freeze({
    blob,
    fileName: `${safeFileBase(input.title)}-page-manifest.cbz`,
    manifest,
  });
}

export function downloadProductionPageManifestArchive(result: ProductionPageManifestArchiveResult): void {
  const url = URL.createObjectURL(result.blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
