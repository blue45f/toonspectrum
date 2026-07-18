import { applyLiquifyDisplacement, type LiquifyDisplacementField } from "./studio-liquify";
import {
  STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION,
  studioLiquifyRequestTransfers,
  type StudioLiquifyWorkerResponseMessage,
  type StudioLiquifyWorkerRunMessage,
  type StudioLiquifyWorkerRunRequest,
} from "./studio-liquify-worker-protocol";

import type { StudioImageDataLike } from "./studio-filters";

export interface StudioLiquifyWorkerLike {
  onmessage: ((event: MessageEvent<StudioLiquifyWorkerResponseMessage>) => void) | null;
  onerror:
    | ((event: {
        readonly error?: unknown;
        readonly message?: string;
        preventDefault?(): void;
      }) => void)
    | null;
  postMessage(message: StudioLiquifyWorkerRunMessage, transfer: Transferable[]): void;
  terminate(): void;
}

export type StudioLiquifyWorkerFactory = () => StudioLiquifyWorkerLike | null;

export interface StudioLiquifyWorkerClientOptions {
  signal?: AbortSignal;
  /** `null` explicitly selects the synchronous fallback; omitted uses the Vite module worker. */
  workerFactory?: StudioLiquifyWorkerFactory | null;
}

export interface StudioLiquifyWorkerClientResult {
  execution: "worker" | "direct";
  dst: StudioImageDataLike;
}

/** Vite statically discovers this exact URL pattern and emits an isolated module-worker chunk. */
export function createStudioLiquifyModuleWorker(): StudioLiquifyWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(new URL("./studio-liquify.worker.ts", import.meta.url), {
    type: "module",
    name: "toonspectrum-liquify",
  }) as unknown as StudioLiquifyWorkerLike;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("리퀴파이 계산을 취소했습니다.", "AbortError");
  }
  const error = new Error("리퀴파이 계산을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}

function runLiquifyDirect(
  request: StudioLiquifyWorkerRunRequest,
  signal: AbortSignal | undefined,
): StudioLiquifyWorkerClientResult {
  throwIfAborted(signal);
  applyLiquifyDisplacement(request.src, request.dst, request.field as LiquifyDisplacementField);
  return { execution: "direct", dst: request.dst };
}

function deserializeWorkerError(response: Extract<
  StudioLiquifyWorkerResponseMessage,
  { type: "studio-liquify/failure" }
>): Error {
  const error = new Error(response.error.message);
  error.name = response.error.name || "Error";
  return error;
}

function runLiquifyWithWorker(
  worker: StudioLiquifyWorkerLike,
  request: StudioLiquifyWorkerRunRequest,
  signal: AbortSignal | undefined,
): Promise<StudioLiquifyWorkerClientResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let requestPosted = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    const message: StudioLiquifyWorkerRunMessage = {
      type: "studio-liquify/run",
      version: STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION,
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
        resolve(runLiquifyDirect(request, signal));
      } catch (error) {
        reject(error);
      }
    });

    worker.onmessage = (event) => {
      const response = event.data;
      if (response.version !== STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION) {
        finish(() => reject(new Error("리퀴파이 Worker가 알 수 없는 응답을 반환했습니다.")));
        return;
      }
      if (response.type === "studio-liquify/ready") {
        if (requestPosted) return;
        if (readyTimer !== null) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        try {
          worker.postMessage(message, studioLiquifyRequestTransfers(message));
          requestPosted = true;
        } catch {
          resolveDirectFallback();
        }
        return;
      }
      if (!requestPosted) {
        finish(() => reject(new Error("리퀴파이 Worker가 준비 전에 결과를 반환했습니다.")));
        return;
      }
      if (response.type === "studio-liquify/failure") {
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
          : new Error(event.message || "리퀴파이 Worker 실행 중 오류가 발생했습니다.");
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
 * 리퀴파이 변위 적용(backward mapping + bilinear 샘플링)을 한 번의 모듈 Worker 호출로 실행한다.
 * ArrayBuffer 기반 픽셀 데이터·변위 필드는 소유권이 이전(detach)되어 전송된다. Worker를 못
 * 만들면(구형 브라우저·CSP) 동일한 applyLiquifyDisplacement를 메인 스레드에서 동기 실행해 폴백한다.
 */
export async function runStudioLiquifyWorker(
  request: StudioLiquifyWorkerRunRequest,
  options: StudioLiquifyWorkerClientOptions = {},
): Promise<StudioLiquifyWorkerClientResult> {
  throwIfAborted(options.signal);
  const factory =
    options.workerFactory === undefined ? createStudioLiquifyModuleWorker : options.workerFactory;
  if (!factory) return runLiquifyDirect(request, options.signal);

  let worker: StudioLiquifyWorkerLike | null;
  try {
    worker = factory();
  } catch {
    return runLiquifyDirect(request, options.signal);
  }
  if (!worker) return runLiquifyDirect(request, options.signal);
  return runLiquifyWithWorker(worker, request, options.signal);
}
