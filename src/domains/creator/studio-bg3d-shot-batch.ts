import {
  STUDIO_BG3D_SHOT_BATCH_MAX_FILES,
  STUDIO_BG3D_SHOT_BATCH_PASSES,
  type StudioBg3dShotBatchPass,
} from "./studio-bg3d-shot-batch-plan";
import {
  STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_OUTPUT_BYTES,
  STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_SHOTS,
  STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_TOTAL_OUTPUT_BYTES,
  readStudioBg3dShotContactSheetPngDimensions,
  type StudioBg3dShotContactSheetOutput,
} from "./studio-bg3d-shot-contact-sheet-contract";
import {
  STUDIO_BG3D_SHOT_PSD_MAX_OUTPUT_BYTES,
  STUDIO_BG3D_SHOT_PSD_MIME,
} from "./studio-bg3d-shot-psd-contract";
import { buildStudioPackageArchiveBlob } from "./studio-package-archive";

export const STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS = 64;
export const STUDIO_BG3D_SHOT_BATCH_MAX_ARTIFACTS = STUDIO_BG3D_SHOT_BATCH_MAX_FILES;
export const STUDIO_BG3D_SHOT_BATCH_MAX_ARCHIVE_ARTIFACTS =
  STUDIO_BG3D_SHOT_BATCH_MAX_ARTIFACTS + STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS * 2;
export const STUDIO_BG3D_SHOT_BATCH_MAX_IMAGE_BYTES = 24 * 1024 * 1024;
export const STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES = 384 * 1024 * 1024;
export const STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION = 4_096;

export interface StudioBg3dShotBatchImage {
  readonly shotId: string;
  readonly shotName: string;
  readonly width: number;
  readonly height: number;
  /** Explicit v2 artifact identity. Omit only for a backwards-compatible v1 archive. */
  readonly pass?: StudioBg3dShotBatchPass;
  /** @deprecated v1 compatibility alias. New callers must use `pass`. */
  readonly output?: "beauty" | "lt-composite";
  /** Requested maximum height before device/raster budgets are applied. */
  readonly requestedHeight?: number;
  /** True when the actual artifact height is lower than `requestedHeight`. */
  readonly wasReduced?: boolean;
  readonly png: Blob;
}

export interface StudioBg3dShotBatchSkippedArtifact {
  readonly shotId: string;
  readonly shotName: string;
  readonly pass: StudioBg3dShotBatchPass;
  readonly reason: "disabled" | "unavailable";
}

export interface StudioBg3dShotBatchLayeredPsd {
  readonly shotId: string;
  readonly shotName: string;
  readonly width: number;
  readonly height: number;
  readonly psd: Blob;
}

export interface StudioBg3dShotBatchPsdFallback {
  readonly shotId: string;
  readonly shotName: string;
  readonly reason: "budget" | "unavailable" | "worker-failed";
}

export type StudioBg3dShotBatchContactSheet = StudioBg3dShotContactSheetOutput;

export type StudioBg3dShotBatchContactSheetFallback =
  | "budget"
  | "source-unavailable"
  | "unavailable"
  | "worker-failed";

export interface StudioBg3dShotBatchManifestContext {
  readonly resumeKey?: string;
  readonly shots?: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly requestedPasses?: readonly StudioBg3dShotBatchPass[];
  readonly resolution?:
    | { readonly mode: "per-shot-maximum" }
    | { readonly mode: "maximum-height"; readonly height: number };
  readonly skippedArtifacts?: readonly StudioBg3dShotBatchSkippedArtifact[];
  readonly psdFallbacks?: readonly StudioBg3dShotBatchPsdFallback[];
  readonly layeredPsdRequested?: boolean;
  readonly contactSheetRequested?: boolean;
  readonly contactSheetFallback?: StudioBg3dShotBatchContactSheetFallback;
}

export interface StudioBg3dShotBatchProgress {
  readonly completedFiles: number;
  readonly totalFiles: number;
}

export interface StudioBg3dShotBatchBuildOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: StudioBg3dShotBatchProgress) => void;
  readonly manifest?: StudioBg3dShotBatchManifestContext;
  readonly layeredPsds?: readonly StudioBg3dShotBatchLayeredPsd[];
  readonly contactSheets?: readonly StudioBg3dShotBatchContactSheet[];
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;
const UNSAFE_TEXT_PATTERN = /\p{Cc}/u;
const EXTERNAL_REFERENCE_PATTERN = /(?:\b(?:blob|data|file|https?):|:\/\/|\bwww\.)/iu;
const MAX_DIMENSION = STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION;
const MAX_NAME_LENGTH = 80;
const RESUME_KEY_PATTERN = /^bg3d-batch-[0-9a-f]{8}$/u;
const PASS_SET = new Set<string>(STUDIO_BG3D_SHOT_BATCH_PASSES);

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
    (image.pass !== undefined && !PASS_SET.has(image.pass)) ||
    (image.output !== undefined && image.output !== "beauty" && image.output !== "lt-composite") ||
    (image.pass !== undefined && image.output !== undefined && image.pass !== image.output) ||
    ((image.requestedHeight === undefined) !== (image.wasReduced === undefined)) ||
    (image.requestedHeight !== undefined && (
      !Number.isSafeInteger(image.requestedHeight) ||
      image.requestedHeight < 256 || image.requestedHeight > MAX_DIMENSION ||
      image.height > image.requestedHeight ||
      typeof image.wasReduced !== "boolean" ||
      image.wasReduced !== (image.height < image.requestedHeight)
    )) ||
    !(image.png instanceof Blob) ||
    image.png.type !== "image/png" ||
    image.png.size < 24 ||
    image.png.size > STUDIO_BG3D_SHOT_BATCH_MAX_IMAGE_BYTES
  ) {
    throw new TypeError("컷 일괄 렌더 PNG 항목이 안전한 형식 또는 예산을 벗어났습니다.");
  }
  const dimensions = await readStudioBg3dShotContactSheetPngDimensions(
    image.png,
    STUDIO_BG3D_SHOT_BATCH_MAX_IMAGE_BYTES,
  );
  if (dimensions.width !== image.width || dimensions.height !== image.height) {
    throw new TypeError("컷 일괄 렌더 PNG IHDR와 선언된 해상도가 일치하지 않습니다.");
  }
}

async function validateLayeredPsd(artifact: StudioBg3dShotBatchLayeredPsd): Promise<void> {
  if (
    !ID_PATTERN.test(artifact.shotId) ||
    !validShotName(artifact.shotName) ||
    !Number.isSafeInteger(artifact.width) || artifact.width < 1 || artifact.width > MAX_DIMENSION ||
    !Number.isSafeInteger(artifact.height) || artifact.height < 1 || artifact.height > MAX_DIMENSION ||
    !(artifact.psd instanceof Blob) ||
    artifact.psd.type !== STUDIO_BG3D_SHOT_PSD_MIME ||
    artifact.psd.size < 26 ||
    artifact.psd.size > STUDIO_BG3D_SHOT_PSD_MAX_OUTPUT_BYTES
  ) {
    throw new TypeError("컷 일괄 렌더 PSD artifact가 안전한 형식 또는 예산을 벗어났습니다.");
  }
  const bytes = new Uint8Array(await artifact.psd.slice(0, 26).arrayBuffer());
  if (
    bytes[0] !== 0x38 || bytes[1] !== 0x42 || bytes[2] !== 0x50 || bytes[3] !== 0x53 ||
    bytes[4] !== 0 || bytes[5] !== 1 ||
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(14, false) !== artifact.height ||
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(18, false) !== artifact.width
  ) {
    throw new TypeError("컷 일괄 렌더 PSD signature, version 또는 canvas 크기가 올바르지 않습니다.");
  }
}

function artifactPass(image: StudioBg3dShotBatchImage): StudioBg3dShotBatchPass {
  return image.pass ?? image.output ?? "beauty";
}

function validateManifestContext(
  value: StudioBg3dShotBatchManifestContext | undefined,
): StudioBg3dShotBatchManifestContext {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("컷 일괄 렌더 manifest 문맥이 올바르지 않습니다.");
  }
  if (value.resumeKey !== undefined && !RESUME_KEY_PATTERN.test(value.resumeKey)) {
    throw new TypeError("컷 일괄 렌더 resume key가 올바르지 않습니다.");
  }
  if (
    (value.layeredPsdRequested !== undefined && typeof value.layeredPsdRequested !== "boolean") ||
    (value.contactSheetRequested !== undefined && typeof value.contactSheetRequested !== "boolean")
  ) {
    throw new TypeError("컷 일괄 렌더 선택 artifact 요청 문맥이 올바르지 않습니다.");
  }
  const shots = value.shots ?? [];
  if (
    !Array.isArray(shots) ||
    (value.shots !== undefined && shots.length < 1) ||
    shots.length > STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS
  ) {
    throw new RangeError("컷 일괄 렌더 manifest 컷 목록이 안전 한도를 벗어났습니다.");
  }
  const shotIds = new Set<string>();
  for (const shot of shots) {
    if (
      typeof shot !== "object" || shot === null || Array.isArray(shot) ||
      !ID_PATTERN.test(shot.id) || !validShotName(shot.name) || shotIds.has(shot.id)
    ) {
      throw new TypeError("컷 일괄 렌더 manifest 컷 목록이 올바르지 않습니다.");
    }
    shotIds.add(shot.id);
  }
  const requested = value.requestedPasses ?? [];
  if (
    !Array.isArray(requested) ||
    (value.requestedPasses !== undefined && requested.length < 1) ||
    requested.some((pass) => !PASS_SET.has(pass))
  ) {
    throw new TypeError("컷 일괄 렌더 요청 패스가 올바르지 않습니다.");
  }
  if (new Set(requested).size !== requested.length) {
    throw new TypeError("컷 일괄 렌더 요청 패스가 중복되었습니다.");
  }
  if (value.resolution !== undefined) {
    if (typeof value.resolution !== "object" || value.resolution === null || Array.isArray(value.resolution)) {
      throw new TypeError("컷 일괄 렌더 해상도 문맥이 올바르지 않습니다.");
    }
    if (value.resolution.mode === "per-shot-maximum") {
      if (Object.keys(value.resolution).some((key) => key !== "mode")) {
        throw new TypeError("컷 일괄 렌더 컷별 최대 해상도 문맥에 알 수 없는 필드가 있습니다.");
      }
    } else if (
      value.resolution.mode !== "maximum-height" ||
      !Number.isSafeInteger(value.resolution.height) ||
      value.resolution.height < 256 || value.resolution.height > MAX_DIMENSION ||
      Object.keys(value.resolution).some((key) => key !== "mode" && key !== "height")
    ) {
      throw new TypeError("컷 일괄 렌더 최대 해상도 문맥이 올바르지 않습니다.");
    }
  }
  const skipped = value.skippedArtifacts ?? [];
  if (!Array.isArray(skipped) || skipped.length > STUDIO_BG3D_SHOT_BATCH_MAX_ARTIFACTS) {
    throw new RangeError("컷 일괄 렌더 생략 artifact가 안전 한도를 벗어났습니다.");
  }
  const skippedKeys = new Set<string>();
  for (const artifact of skipped) {
    if (
      typeof artifact !== "object" || artifact === null || Array.isArray(artifact) ||
      !ID_PATTERN.test(artifact.shotId) ||
      !validShotName(artifact.shotName) ||
      !PASS_SET.has(artifact.pass) ||
      (artifact.reason !== "disabled" && artifact.reason !== "unavailable")
    ) {
      throw new TypeError("컷 일괄 렌더 생략 artifact가 올바르지 않습니다.");
    }
    const key = `${artifact.shotId}:${artifact.pass}`;
    if (skippedKeys.has(key)) {
      throw new TypeError("컷 일괄 렌더 생략 artifact가 중복되었습니다.");
    }
    skippedKeys.add(key);
  }
  const psdFallbacks = value.psdFallbacks ?? [];
  if (!Array.isArray(psdFallbacks) || psdFallbacks.length > STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) {
    throw new RangeError("컷 일괄 렌더 PSD fallback 목록이 안전 한도를 벗어났습니다.");
  }
  const fallbackIds = new Set<string>();
  for (const fallback of psdFallbacks) {
    if (
      typeof fallback !== "object" || fallback === null || Array.isArray(fallback) ||
      !ID_PATTERN.test(fallback.shotId) || !validShotName(fallback.shotName) ||
      !["budget", "unavailable", "worker-failed"].includes(fallback.reason) ||
      fallbackIds.has(fallback.shotId)
    ) {
      throw new TypeError("컷 일괄 렌더 PSD fallback이 올바르지 않습니다.");
    }
    fallbackIds.add(fallback.shotId);
  }
  if (
    value.contactSheetFallback !== undefined &&
    !["budget", "source-unavailable", "unavailable", "worker-failed"].includes(
      value.contactSheetFallback,
    )
  ) {
    throw new TypeError("컷 일괄 렌더 콘택트 시트 fallback이 올바르지 않습니다.");
  }
  return value;
}

export function isStudioBg3dShotBatchManifestContext(
  value: unknown,
): value is StudioBg3dShotBatchManifestContext | undefined {
  try {
    validateManifestContext(value as StudioBg3dShotBatchManifestContext | undefined);
    return true;
  } catch {
    return false;
  }
}

/** Builds a deterministic, bounded PNG ZIP with a small engine-neutral manifest. */
export async function buildStudioBg3dShotBatchArchive(
  images: readonly StudioBg3dShotBatchImage[],
  options: StudioBg3dShotBatchBuildOptions = {},
): Promise<Blob> {
  if (!Array.isArray(images) || images.length < 1 || images.length > STUDIO_BG3D_SHOT_BATCH_MAX_ARTIFACTS) {
    throw new RangeError(`컷 일괄 렌더는 1~${STUDIO_BG3D_SHOT_BATCH_MAX_ARTIFACTS}개 artifact만 포함할 수 있습니다.`);
  }
  throwIfAborted(options.signal);
  const manifestContext = validateManifestContext(options.manifest);
  const layeredPsds = options.layeredPsds ?? [];
  if (!Array.isArray(layeredPsds) || layeredPsds.length > STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) {
    throw new RangeError("컷 일괄 렌더 PSD 수가 안전 한도를 벗어났습니다.");
  }
  const contactSheets = options.contactSheets ?? [];
  if (
    !Array.isArray(contactSheets) ||
    contactSheets.length > STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_SHOTS
  ) {
    throw new RangeError("컷 일괄 렌더 콘택트 시트 수가 안전 한도를 벗어났습니다.");
  }
  const seenArtifactKeys = new Set<string>();
  const requestedPassSet = manifestContext.requestedPasses
    ? new Set(manifestContext.requestedPasses)
    : null;
  const shots = new Map<string, { readonly name: string; readonly index: number }>();
  const shotRasterShape = new Map<string, {
    readonly width: number;
    readonly height: number;
    readonly requestedHeight?: number;
    readonly wasReduced?: boolean;
  }>();
  for (const shot of manifestContext.shots ?? []) {
    shots.set(shot.id, { name: shot.name, index: shots.size + 1 });
  }
  let totalImageBytes = 0;
  for (const image of images) {
    throwIfAborted(options.signal);
    await validatePng(image);
    if (
      requestedPassSet &&
      (image.pass === undefined || !requestedPassSet.has(image.pass))
    ) {
      throw new TypeError("완료 PNG artifact가 manifest 요청 패스에 없습니다.");
    }
    const existingShot = shots.get(image.shotId);
    if (manifestContext.shots && !existingShot) {
      throw new TypeError("완료 artifact가 요청 컷 목록에 없습니다.");
    }
    if (existingShot && existingShot.name !== image.shotName) {
      throw new TypeError("같은 컷 ID의 이름이 artifact 사이에서 일치하지 않습니다.");
    }
    if (!existingShot) {
      if (shots.size >= STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) {
        throw new RangeError(`컷 일괄 렌더는 최대 ${STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS}개 컷만 포함할 수 있습니다.`);
      }
      shots.set(image.shotId, { name: image.shotName, index: shots.size + 1 });
    }
    const key = `${image.shotId}:${artifactPass(image)}`;
    if (seenArtifactKeys.has(key)) {
      throw new TypeError("컷 일괄 렌더에 중복 shot/pass artifact가 있습니다.");
    }
    seenArtifactKeys.add(key);
    const existingShape = shotRasterShape.get(image.shotId);
    if (
      existingShape && (
        existingShape.width !== image.width ||
        existingShape.height !== image.height ||
        existingShape.requestedHeight !== image.requestedHeight ||
        existingShape.wasReduced !== image.wasReduced
      )
    ) {
      throw new TypeError("같은 컷의 pass artifact 해상도 또는 축소 문맥이 일치하지 않습니다.");
    }
    if (!existingShape) {
      shotRasterShape.set(image.shotId, {
        width: image.width,
        height: image.height,
        ...(image.requestedHeight === undefined ? {} : {
          requestedHeight: image.requestedHeight,
          wasReduced: image.wasReduced,
        }),
      });
    }
    if (
      manifestContext.resolution !== undefined && (
        image.requestedHeight === undefined ||
        (manifestContext.resolution.mode === "maximum-height" &&
          image.requestedHeight !== manifestContext.resolution.height)
      )
    ) {
      throw new TypeError("컷 pass artifact의 요청 높이가 manifest 최대 해상도 문맥과 일치하지 않습니다.");
    }
    totalImageBytes += image.png.size;
    if (totalImageBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES) {
      throw new RangeError("컷 일괄 렌더 이미지 합계가 브라우저 메모리 예산을 벗어났습니다.");
    }
  }

  const seenPsdShotIds = new Set<string>();
  for (const artifact of layeredPsds) {
    throwIfAborted(options.signal);
    await validateLayeredPsd(artifact);
    const existingShot = shots.get(artifact.shotId);
    if (manifestContext.shots && !existingShot) {
      throw new TypeError("PSD artifact가 요청 컷 목록에 없습니다.");
    }
    if (existingShot && existingShot.name !== artifact.shotName) {
      throw new TypeError("같은 컷 ID의 이름이 PSD artifact와 일치하지 않습니다.");
    }
    const rasterShape = shotRasterShape.get(artifact.shotId);
    if (rasterShape && (rasterShape.width !== artifact.width || rasterShape.height !== artifact.height)) {
      throw new TypeError("같은 컷의 PSD와 PNG pass 해상도가 일치하지 않습니다.");
    }
    if (!existingShot) {
      if (shots.size >= STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) {
        throw new RangeError(`컷 일괄 렌더는 최대 ${STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS}개 컷만 포함할 수 있습니다.`);
      }
      shots.set(artifact.shotId, { name: artifact.shotName, index: shots.size + 1 });
    }
    if (seenPsdShotIds.has(artifact.shotId)) {
      throw new TypeError("컷 일괄 렌더에 중복 layered PSD가 있습니다.");
    }
    seenPsdShotIds.add(artifact.shotId);
    totalImageBytes += artifact.psd.size;
    if (totalImageBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES) {
      throw new RangeError("컷 일괄 렌더 artifact 합계가 브라우저 메모리 예산을 벗어났습니다.");
    }
  }

  let totalContactSheetBytes = 0;
  const contactShotIds = new Set<string>();
  for (const [index, artifact] of contactSheets.entries()) {
    throwIfAborted(options.signal);
    if (
      artifact.sheetNumber !== index + 1 ||
      artifact.fileName !== `contact-sheet-${String(index + 1).padStart(3, "0")}.png` ||
      !Number.isSafeInteger(artifact.width) || artifact.width < 1 || artifact.width > 8_192 ||
      !Number.isSafeInteger(artifact.height) || artifact.height < 1 || artifact.height > 8_192 ||
      !Array.isArray(artifact.shotIds) || artifact.shotIds.length < 1 ||
      artifact.shotIds.some((shotId: string) => (
        !ID_PATTERN.test(shotId) || !shots.has(shotId) || contactShotIds.has(shotId)
      )) ||
      new Set(artifact.shotIds).size !== artifact.shotIds.length ||
      !(artifact.png instanceof Blob) || artifact.png.type !== "image/png" ||
      artifact.png.size < 24 || artifact.png.size > STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_OUTPUT_BYTES
    ) {
      throw new TypeError("컷 일괄 렌더 콘택트 시트 artifact가 올바르지 않습니다.");
    }
    const dimensions = await readStudioBg3dShotContactSheetPngDimensions(
      artifact.png,
      STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_OUTPUT_BYTES,
    );
    if (dimensions.width !== artifact.width || dimensions.height !== artifact.height) {
      throw new TypeError("컷 일괄 렌더 콘택트 시트 PNG 크기가 manifest와 일치하지 않습니다.");
    }
    artifact.shotIds.forEach((shotId: string) => contactShotIds.add(shotId));
    totalContactSheetBytes += artifact.png.size;
    totalImageBytes += artifact.png.size;
    if (
      totalContactSheetBytes > STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_TOTAL_OUTPUT_BYTES ||
      totalImageBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES
    ) {
      throw new RangeError("컷 일괄 렌더 콘택트 시트 합계가 브라우저 메모리 예산을 벗어났습니다.");
    }
  }
  if (contactSheets.length > 0 && contactShotIds.size !== shots.size) {
    throw new TypeError("컷 일괄 렌더 콘택트 시트가 요청한 모든 컷을 포함하지 않습니다.");
  }
  if (contactSheets.length > 0 && manifestContext.contactSheetFallback !== undefined) {
    throw new TypeError("완료 콘택트 시트와 fallback이 충돌합니다.");
  }

  const seenSkippedArtifactKeys = new Set<string>();
  for (const skipped of manifestContext.skippedArtifacts ?? []) {
    const existingShot = shots.get(skipped.shotId);
    if (manifestContext.shots && !existingShot) {
      throw new TypeError("생략 artifact가 요청 컷 목록에 없습니다.");
    }
    if (existingShot && existingShot.name !== skipped.shotName) {
      throw new TypeError("같은 컷 ID의 이름이 생략 artifact와 일치하지 않습니다.");
    }
    if (!existingShot) {
      if (shots.size >= STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) {
        throw new RangeError(`컷 일괄 렌더는 최대 ${STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS}개 컷만 포함할 수 있습니다.`);
      }
      shots.set(skipped.shotId, { name: skipped.shotName, index: shots.size + 1 });
    }
    if (seenArtifactKeys.has(`${skipped.shotId}:${skipped.pass}`)) {
      throw new TypeError("완료 artifact와 생략 artifact가 충돌합니다.");
    }
    if (requestedPassSet && !requestedPassSet.has(skipped.pass)) {
      throw new TypeError("생략 artifact가 manifest 요청 패스에 없습니다.");
    }
    seenSkippedArtifactKeys.add(`${skipped.shotId}:${skipped.pass}`);
  }
  const seenPsdFallbackShotIds = new Set<string>();
  for (const fallback of manifestContext.psdFallbacks ?? []) {
    const existingShot = shots.get(fallback.shotId);
    if (!existingShot || existingShot.name !== fallback.shotName) {
      throw new TypeError("PSD fallback이 요청 컷 목록과 일치하지 않습니다.");
    }
    if (seenPsdShotIds.has(fallback.shotId)) {
      throw new TypeError("완료 PSD와 PSD fallback이 충돌합니다.");
    }
    seenPsdFallbackShotIds.add(fallback.shotId);
  }
  if (manifestContext.layeredPsdRequested === true) {
    for (const shot of manifestContext.shots ?? []) {
      if (!seenPsdShotIds.has(shot.id) && !seenPsdFallbackShotIds.has(shot.id)) {
        throw new TypeError("요청한 컷 PSD가 완료 또는 fallback으로 정확히 설명되지 않았습니다.");
      }
    }
  } else if (
    manifestContext.layeredPsdRequested === false &&
    (layeredPsds.length > 0 || (manifestContext.psdFallbacks?.length ?? 0) > 0)
  ) {
    throw new TypeError("요청하지 않은 PSD artifact 또는 fallback이 포함되었습니다.");
  }
  if (manifestContext.contactSheetRequested === true) {
    if (contactSheets.length === 0 && manifestContext.contactSheetFallback === undefined) {
      throw new TypeError("요청한 콘택트 시트가 완료 또는 fallback으로 설명되지 않았습니다.");
    }
  } else if (
    manifestContext.contactSheetRequested === false &&
    (contactSheets.length > 0 || manifestContext.contactSheetFallback !== undefined)
  ) {
    throw new TypeError("요청하지 않은 콘택트 시트 artifact 또는 fallback이 포함되었습니다.");
  }
  if (requestedPassSet && manifestContext.shots) {
    for (const shot of manifestContext.shots) {
      for (const pass of requestedPassSet) {
        const key = `${shot.id}:${pass}`;
        if (!seenArtifactKeys.has(key) && !seenSkippedArtifactKeys.has(key)) {
          throw new TypeError("요청한 shot/pass가 완료 또는 생략 artifact로 정확히 설명되지 않았습니다.");
        }
      }
    }
  }
  if (
    images.length +
    layeredPsds.length +
    contactSheets.length +
    (manifestContext.skippedArtifacts?.length ?? 0) +
    (manifestContext.psdFallbacks?.length ?? 0) +
    (manifestContext.contactSheetFallback === undefined ? 0 : 1) >
      STUDIO_BG3D_SHOT_BATCH_MAX_ARCHIVE_ARTIFACTS
  ) {
    throw new RangeError("컷 일괄 렌더 artifact 합계가 안전 한도를 벗어났습니다.");
  }

  const legacyV1 = layeredPsds.length === 0 &&
    contactSheets.length === 0 &&
    images.every((image) => image.pass === undefined) &&
    images.length === shots.size &&
    manifestContext.resumeKey === undefined &&
    manifestContext.shots === undefined &&
    manifestContext.requestedPasses === undefined &&
    manifestContext.resolution === undefined &&
    manifestContext.skippedArtifacts === undefined &&
    manifestContext.psdFallbacks === undefined &&
    manifestContext.layeredPsdRequested === undefined &&
    manifestContext.contactSheetRequested === undefined &&
    manifestContext.contactSheetFallback === undefined;
  const files = images.map((image, index) => {
    const shot = shots.get(image.shotId)!;
    const pass = artifactPass(image);
    return {
      shotId: image.shotId,
      name: image.shotName,
      path: legacyV1
        ? `shots/${String(index + 1).padStart(3, "0")}.png`
        : `shots/${String(shot.index).padStart(3, "0")}/${pass}.png`,
      width: image.width,
      height: image.height,
      ...(legacyV1 ? { output: image.output ?? "beauty" } : {
        pass,
        status: "completed" as const,
        encoding: pass === "depth"
          ? "normalized-device-depth-u8"
          : "srgb-straight-alpha-rgba8",
        ...(pass === "depth" ? { nearIs: "black", farIs: "white" } : {}),
        ...(image.requestedHeight === undefined ? {} : {
          requestedHeight: image.requestedHeight,
          wasReduced: image.wasReduced,
        }),
      }),
    };
  });
  const requestedPasses = manifestContext.requestedPasses ??
    STUDIO_BG3D_SHOT_BATCH_PASSES.filter((pass) => images.some((image) => artifactPass(image) === pass));
  const manifestPayload = legacyV1
    ? {
        kind: "toonspectrum-bg3d-shot-batch",
        version: 1,
        files,
      }
    : {
        kind: "toonspectrum-bg3d-shot-batch",
        version: 2,
        ...(manifestContext.resumeKey ? { resumeKey: manifestContext.resumeKey } : {}),
        requestedPasses,
        resolution: manifestContext.resolution ?? { mode: "per-shot-maximum" as const },
        producedPasses: STUDIO_BG3D_SHOT_BATCH_PASSES.filter((pass) =>
          images.some((image) => artifactPass(image) === pass)),
        shots: [...shots].map(([shotId, shot]) => ({
          id: shotId,
          name: shot.name,
          index: shot.index,
        })),
        artifacts: [
          ...files,
          ...layeredPsds.map((artifact) => {
            const shot = shots.get(artifact.shotId)!;
            return {
              shotId: artifact.shotId,
              name: artifact.shotName,
              kind: "layered-psd" as const,
              path: `shots/${String(shot.index).padStart(3, "0")}/layers.psd`,
              width: artifact.width,
              height: artifact.height,
              status: "completed" as const,
              encoding: "psd-v1-rle-rgba8",
            };
          }),
          ...contactSheets.map((artifact) => ({
            kind: "contact-sheet" as const,
            path: `contact/${artifact.fileName}`,
            sheetNumber: artifact.sheetNumber,
            width: artifact.width,
            height: artifact.height,
            shotIds: artifact.shotIds,
            status: "completed" as const,
            encoding: "srgb-opaque-rgba8",
          })),
          ...(manifestContext.skippedArtifacts ?? []).map((artifact) => ({
            shotId: artifact.shotId,
            name: artifact.shotName,
            pass: artifact.pass,
            status: "skipped" as const,
            reason: artifact.reason,
          })),
        ],
        layeredPsdRequested: manifestContext.layeredPsdRequested ?? layeredPsds.length > 0,
        psdFallbacks: manifestContext.psdFallbacks ?? [],
        contactSheetRequested: manifestContext.contactSheetRequested ?? contactSheets.length > 0,
        contactSheetFallback: manifestContext.contactSheetFallback ?? null,
      };
  const manifest = new TextEncoder().encode(JSON.stringify(manifestPayload, null, 2));
  throwIfAborted(options.signal);
  return buildStudioPackageArchiveBlob([
    { path: "manifest.json", data: manifest },
    ...images.map((image, index) => ({
      path: files[index]?.path ?? `shots/${String(index + 1).padStart(3, "0")}.png`,
      data: image.png,
    })),
    ...layeredPsds.map((artifact) => ({
      path: `shots/${String(shots.get(artifact.shotId)!.index).padStart(3, "0")}/layers.psd`,
      data: artifact.psd,
    })),
    ...contactSheets.map((artifact) => ({
      path: `contact/${artifact.fileName}`,
      data: artifact.png,
    })),
  ], {
    mimeType: "application/zip",
    limits: {
      maxFiles: STUDIO_BG3D_SHOT_BATCH_MAX_ARCHIVE_ARTIFACTS + 1,
      maxEntryBytes: STUDIO_BG3D_SHOT_PSD_MAX_OUTPUT_BYTES,
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
