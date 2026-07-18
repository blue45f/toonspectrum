import { buildStudioPackageArchiveBlob } from "./studio-package-archive";

export const STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS = 64;
export const STUDIO_BG3D_SHOT_BATCH_MAX_IMAGE_BYTES = 24 * 1024 * 1024;
export const STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES = 384 * 1024 * 1024;

export interface StudioBg3dShotBatchImage {
  readonly shotId: string;
  readonly shotName: string;
  readonly width: number;
  readonly height: number;
  readonly output?: "beauty" | "lt-composite";
  readonly png: Blob;
}

export interface StudioBg3dShotBatchProgress {
  readonly completedFiles: number;
  readonly totalFiles: number;
}

export interface StudioBg3dShotBatchBuildOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: StudioBg3dShotBatchProgress) => void;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;
const UNSAFE_TEXT_PATTERN = /\p{Cc}/u;
const EXTERNAL_REFERENCE_PATTERN = /(?:\b(?:blob|data|file|https?):|:\/\/|\bwww\.)/iu;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_DIMENSION = 4_096;
const MAX_NAME_LENGTH = 80;

function abortError(): Error {
  const error = new Error("컷 일괄 렌더를 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function validShotName(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 &&
    Array.from(normalized).length <= MAX_NAME_LENGTH &&
    normalized === value &&
    !UNSAFE_TEXT_PATTERN.test(normalized) &&
    !EXTERNAL_REFERENCE_PATTERN.test(normalized);
}

async function validatePng(image: StudioBg3dShotBatchImage): Promise<void> {
  if (
    !ID_PATTERN.test(image.shotId) ||
    !validShotName(image.shotName) ||
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width > MAX_DIMENSION ||
    image.height > MAX_DIMENSION ||
    (image.output !== undefined && image.output !== "beauty" && image.output !== "lt-composite") ||
    !(image.png instanceof Blob) ||
    image.png.type !== "image/png" ||
    image.png.size < PNG_SIGNATURE.length ||
    image.png.size > STUDIO_BG3D_SHOT_BATCH_MAX_IMAGE_BYTES
  ) {
    throw new TypeError("컷 일괄 렌더 PNG 항목이 안전한 형식 또는 예산을 벗어났습니다.");
  }
  const signature = new Uint8Array(await image.png.slice(0, PNG_SIGNATURE.length).arrayBuffer());
  if (signature.some((byte, index) => byte !== PNG_SIGNATURE[index])) {
    throw new TypeError("컷 일괄 렌더 항목의 PNG 시그니처가 올바르지 않습니다.");
  }
}

/** Builds a deterministic, bounded PNG ZIP with a small engine-neutral manifest. */
export async function buildStudioBg3dShotBatchArchive(
  images: readonly StudioBg3dShotBatchImage[],
  options: StudioBg3dShotBatchBuildOptions = {},
): Promise<Blob> {
  if (!Array.isArray(images) || images.length < 1 || images.length > STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) {
    throw new RangeError(`컷 일괄 렌더는 1~${STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS}개 이미지만 포함할 수 있습니다.`);
  }
  throwIfAborted(options.signal);
  const seenIds = new Set<string>();
  let totalImageBytes = 0;
  for (const image of images) {
    throwIfAborted(options.signal);
    await validatePng(image);
    if (seenIds.has(image.shotId)) throw new TypeError("컷 일괄 렌더에 중복 shot ID가 있습니다.");
    seenIds.add(image.shotId);
    totalImageBytes += image.png.size;
    if (totalImageBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES) {
      throw new RangeError("컷 일괄 렌더 이미지 합계가 브라우저 메모리 예산을 벗어났습니다.");
    }
  }

  const files = images.map((image, index) => ({
    shotId: image.shotId,
    name: image.shotName,
    path: `shots/${String(index + 1).padStart(3, "0")}.png`,
    width: image.width,
    height: image.height,
    output: image.output ?? "beauty",
  }));
  const manifest = new TextEncoder().encode(JSON.stringify({
    kind: "toonspectrum-bg3d-shot-batch",
    version: 1,
    files,
  }, null, 2));
  throwIfAborted(options.signal);
  return buildStudioPackageArchiveBlob([
    { path: "manifest.json", data: manifest },
    ...images.map((image, index) => ({
      path: files[index]?.path ?? `shots/${String(index + 1).padStart(3, "0")}.png`,
      data: image.png,
    })),
  ], {
    mimeType: "application/zip",
    limits: {
      maxFiles: STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS + 1,
      maxEntryBytes: STUDIO_BG3D_SHOT_BATCH_MAX_IMAGE_BYTES,
      // The image budget was already checked above. Leave a small bounded allowance for the
      // manifest and ZIP bookkeeping instead of accidentally rejecting an exact-budget image set.
      maxTotalBytes: STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES + 256 * 1024,
      maxArchiveBytes: 400 * 1024 * 1024,
      maxPathBytes: 256,
    },
    onProgress: (progress) => {
      throwIfAborted(options.signal);
      options.onProgress?.({
        completedFiles: progress.completedFiles,
        totalFiles: progress.totalFiles,
      });
    },
  });
}
