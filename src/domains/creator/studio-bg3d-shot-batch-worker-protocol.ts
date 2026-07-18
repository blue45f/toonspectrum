import {
  STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS,
  type StudioBg3dShotBatchImage,
  type StudioBg3dShotBatchProgress,
} from "./studio-bg3d-shot-batch";

export const STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION = 1;
export const STUDIO_BG3D_SHOT_BATCH_MAX_ARCHIVE_BYTES = 400 * 1024 * 1024;

export interface StudioBg3dShotBatchWorkerRequest {
  readonly version: typeof STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION;
  readonly kind: "build";
  readonly requestId: number;
  readonly images: readonly StudioBg3dShotBatchImage[];
}

export type StudioBg3dShotBatchWorkerResponse =
  | {
      readonly version: typeof STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION;
      readonly kind: "progress";
      readonly requestId: number;
      readonly progress: StudioBg3dShotBatchProgress;
    }
  | {
      readonly version: typeof STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION;
      readonly kind: "result";
      readonly requestId: number;
      readonly archive: Blob;
    }
  | {
      readonly version: typeof STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION;
      readonly kind: "error";
      readonly requestId: number;
      readonly code: "build-failed" | "protocol";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validRequestId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function isStudioBg3dShotBatchWorkerRequest(
  value: unknown,
): value is StudioBg3dShotBatchWorkerRequest {
  if (!isRecord(value)) return false;
  return Object.keys(value).every((key) => ["version", "kind", "requestId", "images"].includes(key)) &&
    value.version === STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION &&
    value.kind === "build" &&
    validRequestId(value.requestId) &&
    Array.isArray(value.images) &&
    value.images.length >= 1 &&
    value.images.length <= STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS;
}

export function isStudioBg3dShotBatchWorkerResponse(
  value: unknown,
): value is StudioBg3dShotBatchWorkerResponse {
  if (
    !isRecord(value) ||
    value.version !== STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION ||
    !validRequestId(value.requestId)
  ) {
    return false;
  }
  if (value.kind === "progress") {
    if (!isRecord(value.progress)) return false;
    const completed = value.progress.completedFiles;
    const total = value.progress.totalFiles;
    return Object.keys(value).every((key) => ["version", "kind", "requestId", "progress"].includes(key)) &&
      Object.keys(value.progress).every((key) => ["completedFiles", "totalFiles"].includes(key)) &&
      Number.isSafeInteger(completed) &&
      Number.isSafeInteger(total) &&
      (completed as number) >= 0 &&
      (total as number) >= 1 &&
      (completed as number) <= (total as number) &&
      (total as number) <= STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS + 1;
  }
  if (value.kind === "result") {
    return Object.keys(value).every((key) => ["version", "kind", "requestId", "archive"].includes(key)) &&
      value.archive instanceof Blob &&
      value.archive.type === "application/zip" &&
      value.archive.size > 0 &&
      value.archive.size <= STUDIO_BG3D_SHOT_BATCH_MAX_ARCHIVE_BYTES;
  }
  return value.kind === "error" &&
    Object.keys(value).every((key) => ["version", "kind", "requestId", "code"].includes(key)) &&
    (value.code === "build-failed" || value.code === "protocol");
}
