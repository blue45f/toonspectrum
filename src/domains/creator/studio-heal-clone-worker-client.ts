import { applyHealCloneDabs } from "./studio-heal-clone";
import {
  STUDIO_HEAL_CLONE_WORKER_PROTOCOL_VERSION,
  studioHealCloneRequestTransfers,
  type StudioHealCloneWorkerResponseMessage,
  type StudioHealCloneWorkerRunMessage,
  type StudioHealCloneWorkerRunRequest,
} from "./studio-heal-clone-worker-protocol";

import type { StudioImageDataLike } from "./studio-filters";

export interface StudioHealCloneWorkerLike {
  onmessage: ((event: MessageEvent<StudioHealCloneWorkerResponseMessage>) => void) | null;
  onerror:
    | ((event: {
        readonly error?: unknown;
        readonly message?: string;
        preventDefault?(): void;
      }) => void)
    | null;
  postMessage(message: StudioHealCloneWorkerRunMessage, transfer: Transferable[]): void;
  terminate(): void;
}

export type StudioHealCloneWorkerFactory = () => StudioHealCloneWorkerLike | null;

export interface StudioHealCloneWorkerClientOptions {
  signal?: AbortSignal;
  /** `null` explicitly selects the synchronous fallback; omitted uses the Vite module worker. */
  workerFactory?: StudioHealCloneWorkerFactory | null;
}

export interface StudioHealCloneWorkerClientResult {
  execution: "worker" | "direct";
  dst: StudioImageDataLike;
}

/** Vite statically discovers this exact URL pattern and emits an isolated module-worker chunk. */
export function createStudioHealCloneModuleWorker(): StudioHealCloneWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(new URL("./studio-heal-clone.worker.ts", import.meta.url), {
    type: "module",
    name: "toonspectrum-heal-clone",
  }) as unknown as StudioHealCloneWorkerLike;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("복구 브러시 계산을 취소했습니다.", "AbortError");
  }
  const error = new Error("복구 브러시 계산을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}

function runHealCloneDirect(
  request: StudioHealCloneWorkerRunRequest,
  signal: AbortSignal | undefined,
): StudioHealCloneWorkerClientResult {
  throwIfAborted(signal);
  applyHealCloneDabs(request.src, request.dst, request.dabs, request.radiusPx, request.hardness, request.opacity, request.mode);
  return { execution: "direct", dst: request.dst };
}

function deserializeWorkerError(response: Extract<
  StudioHealCloneWorkerResponseMessage,
  { type: "studio-heal-clone/failure" }
>): Error {
  const error = new Error(response.error.message);
  error.name = response.error.name || "Error";
  return error;
}

function runHealCloneWithWorker(
  worker: StudioHealCloneWorkerLike,
  request: StudioHealCloneWorkerRunRequest,
  signal: AbortSignal | undefined,
): Promise<StudioHealCloneWorkerClientResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let requestPosted = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    const message: StudioHealCloneWorkerRunMessage = {
      type: "studio-heal-clone/run",
      version: STUDIO_HEAL_CLONE_WORKER_PROTOCOL_VERSION,
      request,
    };

    const cleanup = () => {
      if (readyTimer !== null) clearTimeout(readyTimer);
      signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => finish(() => reject(createAbortError()));
    const resolveDirectFallback = () => finish(() => {
      try {
        resolve(runHealCloneDirect(request, signal));
      } catch (error) {
        reject(error);
      }
    });

    worker.onmessage = (event) => {
      const response = event.data;
      if (response.version !== STUDIO_HEAL_CLONE_WORKER_PROTOCOL_VERSION) {
        finish(() => reject(new Error("복구 브러시 Worker가 알 수 없는 응답을 반환했습니다.")));
        return;
      }
      if (response.type === "studio-heal-clone/ready") {
        if (requestPosted) return;
        if (readyTimer !== null) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        try {
          worker.postMessage(message, studioHealCloneRequestTransfers(message));
          requestPosted = true;
        } catch {
          resolveDirectFallback();
        }
        return;
      }
      if (!requestPosted) {
        finish(() => reject(new Error("복구 브러시 Worker가 준비 전에 결과를 반환했습니다.")));
        return;
      }
      if (response.type === "studio-heal-clone/failure") {
        finish(() => reject(deserializeWorkerError(response)));
        return;
      }
      finish(() => resolve({ execution: "worker", dst: response.dst }));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      if (!requestPosted) {
        resolveDirectFallback();
        return;
      }
      // 픽셀 버퍼가 이미 전송(detach)돼 직접 실행으로 되돌릴 데이터가 없다.
      const error =
        event.error instanceof Error
          ? event.error
          : new Error(event.message || "복구 브러시 Worker 실행 중 오류가 발생했습니다.");
      finish(() => reject(error));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    readyTimer = setTimeout(resolveDirectFallback, 3_000);
  });
}

/**
 * 복구 브러시/도장 도장 적용(스탬프 블렌드 루프)을 한 번의 모듈 Worker 호출로 실행한다.
 * ArrayBuffer 기반 픽셀 데이터는 소유권이 이전(detach)되어 전송된다. Worker를 못 만들면(구형
 * 브라우저·CSP) 동일한 applyHealCloneDabs를 메인 스레드에서 동기 실행해 폴백한다.
 */
export async function runStudioHealCloneWorker(
  request: StudioHealCloneWorkerRunRequest,
  options: StudioHealCloneWorkerClientOptions = {},
): Promise<StudioHealCloneWorkerClientResult> {
  throwIfAborted(options.signal);
  const factory =
    options.workerFactory === undefined ? createStudioHealCloneModuleWorker : options.workerFactory;
  if (!factory) return runHealCloneDirect(request, options.signal);

  let worker: StudioHealCloneWorkerLike | null;
  try {
    worker = factory();
  } catch {
    return runHealCloneDirect(request, options.signal);
  }
  if (!worker) return runHealCloneDirect(request, options.signal);
  return runHealCloneWithWorker(worker, request, options.signal);
}
