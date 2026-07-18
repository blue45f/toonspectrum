import {
  STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS,
  type StudioBg3dShotBatchImage,
  type StudioBg3dShotBatchProgress,
} from "./studio-bg3d-shot-batch";
import {
  STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION,
  isStudioBg3dShotBatchWorkerResponse,
  type StudioBg3dShotBatchWorkerRequest,
} from "./studio-bg3d-shot-batch-worker-protocol";

export const STUDIO_BG3D_SHOT_BATCH_WORKER_TIMEOUT_MS = 180_000;

interface WorkerMessageLike {
  readonly data: unknown;
}

interface WorkerErrorLike {
  preventDefault?(): void;
}

export interface StudioBg3dShotBatchWorkerLike {
  postMessage(message: StudioBg3dShotBatchWorkerRequest): void;
  addEventListener(type: "message", listener: (event: WorkerMessageLike) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: WorkerErrorLike) => void): void;
  removeEventListener(type: "message", listener: (event: WorkerMessageLike) => void): void;
  removeEventListener(type: "error" | "messageerror", listener: (event: WorkerErrorLike) => void): void;
  terminate(): void;
}

export interface StudioBg3dShotBatchWorkerOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: StudioBg3dShotBatchProgress) => void;
  readonly timeoutMs?: number;
  readonly workerFactory?: () => StudioBg3dShotBatchWorkerLike;
}

let nextRequestId = 1;

function defaultWorkerFactory(): StudioBg3dShotBatchWorkerLike {
  return new Worker(new URL("./studio-bg3d-shot-batch.worker.ts", import.meta.url), {
    type: "module",
    name: "studio-bg3d-shot-batch-archive",
  });
}

function jobError(name: "AbortError" | "TimeoutError" | "WorkerError" | "ProtocolError"): Error {
  const error = new Error("컷 일괄 렌더 ZIP Worker를 완료하지 못했습니다.");
  error.name = name;
  return error;
}

function boundedTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) return STUDIO_BG3D_SHOT_BATCH_WORKER_TIMEOUT_MS;
  return Math.max(5_000, Math.min(300_000, Math.floor(value as number)));
}

async function hasZipSignature(blob: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return bytes.length === 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function buildStudioBg3dShotBatchArchiveInWorker(
  images: readonly StudioBg3dShotBatchImage[],
  options: StudioBg3dShotBatchWorkerOptions = {},
): Promise<Blob> {
  if (!Array.isArray(images) || images.length < 1 || images.length > STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) {
    return Promise.reject(jobError("ProtocolError"));
  }
  if (options.signal?.aborted) return Promise.reject(jobError("AbortError"));
  const requestId = nextRequestId;
  nextRequestId = nextRequestId >= Number.MAX_SAFE_INTEGER ? 1 : nextRequestId + 1;

  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    let worker: StudioBg3dShotBatchWorkerLike;
    const timeout = setTimeout(() => finish(null, jobError("TimeoutError")), boundedTimeout(options.timeoutMs));
    const abort = () => finish(null, jobError("AbortError"));
    const cleanup = () => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      worker?.removeEventListener("message", onMessage);
      worker?.removeEventListener("error", onWorkerError);
      worker?.removeEventListener("messageerror", onWorkerError);
      worker?.terminate();
    };
    const finish = (archive: Blob | null, error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (archive) resolve(archive);
      else reject(error ?? jobError("WorkerError"));
    };
    const onMessage = (event: WorkerMessageLike) => {
      const response = event.data;
      if (!isStudioBg3dShotBatchWorkerResponse(response) || response.requestId !== requestId) {
        finish(null, jobError("ProtocolError"));
        return;
      }
      if (response.kind === "progress") {
        options.onProgress?.(response.progress);
        return;
      }
      if (response.kind === "error") {
        finish(null, jobError(response.code === "protocol" ? "ProtocolError" : "WorkerError"));
        return;
      }
      void hasZipSignature(response.archive).then((valid) => {
        if (!valid) finish(null, jobError("ProtocolError"));
        else finish(response.archive);
      }).catch(() => finish(null, jobError("ProtocolError")));
    };
    const onWorkerError = (event: WorkerErrorLike) => {
      event.preventDefault?.();
      finish(null, jobError("WorkerError"));
    };

    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      worker = (options.workerFactory ?? defaultWorkerFactory)();
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onWorkerError);
      worker.addEventListener("messageerror", onWorkerError);
      worker.postMessage({
        version: STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION,
        kind: "build",
        requestId,
        images: [...images],
      });
    } catch {
      finish(null, jobError("WorkerError"));
    }
  });
}
