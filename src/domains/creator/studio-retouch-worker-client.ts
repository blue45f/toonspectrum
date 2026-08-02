import {
  assertStudioRetouchWorkerRequest,
  STUDIO_RETOUCH_DIRECT_MAX_IMAGE_PIXELS,
  STUDIO_RETOUCH_WORKER_PROTOCOL_VERSION,
  studioRetouchRequestTransfers,
  type StudioRetouchWorkerResponseMessage,
  type StudioRetouchWorkerRunMessage,
  type StudioRetouchWorkerRunRequest,
} from "./studio-retouch-worker-protocol";
import { applyStudioRetouchWorkerRequest } from "./studio-retouch-worker-runtime";

export interface StudioRetouchWorkerLike {
  onmessage: ((event: MessageEvent<StudioRetouchWorkerResponseMessage>) => void) | null;
  onerror:
    | ((event: {
        readonly error?: unknown;
        readonly message?: string;
        preventDefault?(): void;
      }) => void)
    | null;
  postMessage(message: StudioRetouchWorkerRunMessage, transfer: Transferable[]): void;
  terminate(): void;
}

export type StudioRetouchWorkerFactory = () => StudioRetouchWorkerLike | null;

export interface StudioRetouchWorkerClientOptions {
  readonly signal?: AbortSignal;
  /** `null` forces the bounded direct fallback; omitted uses the Vite module Worker. */
  readonly workerFactory?: StudioRetouchWorkerFactory | null;
  readonly readyTimeoutMilliseconds?: number;
  readonly operationTimeoutMilliseconds?: number;
}

export interface StudioRetouchWorkerClientResult {
  readonly execution: "worker" | "direct";
  readonly kind: StudioRetouchWorkerRunRequest["kind"];
  readonly data: Uint8ClampedArray;
}

const DEFAULT_READY_TIMEOUT_MS = 3_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 30_000;

/** Vite statically emits one shared code chunk; each operation gets an isolated one-shot Worker. */
export function createStudioRetouchModuleWorker(): StudioRetouchWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(new URL("./studio-retouch.worker.ts", import.meta.url), {
    type: "module",
    name: "toonspectrum-retouch",
  }) as unknown as StudioRetouchWorkerLike;
}

function createAbortError(message = "리터치 계산을 취소했습니다."): Error {
  if (typeof DOMException === "function") return new DOMException(message, "AbortError");
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}

function boundedTimeout(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(120_000, Math.round(value!)));
}

function cloneSafeRequest(
  request: StudioRetouchWorkerRunRequest,
): StudioRetouchWorkerRunRequest {
  assertStudioRetouchWorkerRequest(request);
  const { data } = request;
  const transferable = data.buffer instanceof ArrayBuffer
    && data.byteOffset === 0
    && data.byteLength === data.buffer.byteLength
    ? data
    : new Uint8ClampedArray(data);
  return { ...request, data: transferable } as StudioRetouchWorkerRunRequest;
}

function runRetouchDirect(
  request: StudioRetouchWorkerRunRequest,
  signal: AbortSignal | undefined,
): StudioRetouchWorkerClientResult {
  throwIfAborted(signal);
  if (request.w * request.h > STUDIO_RETOUCH_DIRECT_MAX_IMAGE_PIXELS) {
    throw new RangeError(
      "리터치 Worker를 사용할 수 없어 직접 계산 안전 상한을 초과한 이미지를 중단했습니다.",
    );
  }
  const { data } = applyStudioRetouchWorkerRequest(request);
  throwIfAborted(signal);
  return { execution: "direct", kind: request.kind, data };
}

function deserializeWorkerError(
  response: Extract<StudioRetouchWorkerResponseMessage, { type: "studio-retouch/failure" }>,
): Error {
  const error = new Error(response.error.message);
  error.name = response.error.name || "Error";
  return error;
}

function runRetouchWithWorker(
  worker: StudioRetouchWorkerLike,
  request: StudioRetouchWorkerRunRequest,
  options: StudioRetouchWorkerClientOptions,
): Promise<StudioRetouchWorkerClientResult> {
  return new Promise((resolve, reject) => {
    const { signal } = options;
    let settled = false;
    let requestPosted = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    let operationTimer: ReturnType<typeof setTimeout> | null = null;
    const message: StudioRetouchWorkerRunMessage = {
      type: "studio-retouch/run",
      version: STUDIO_RETOUCH_WORKER_PROTOCOL_VERSION,
      request,
    };

    const cleanup = () => {
      if (readyTimer !== null) clearTimeout(readyTimer);
      if (operationTimer !== null) clearTimeout(operationTimer);
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
        resolve(runRetouchDirect(request, signal));
      } catch (error) {
        reject(error);
      }
    });
    const onOperationTimeout = () => finish(() => reject(createAbortError(
      "리터치 Worker가 제한 시간 안에 완료되지 않았습니다.",
    )));

    worker.onmessage = (event) => {
      const response = event.data;
      if (
        !response
        || typeof response !== "object"
        || response.version !== STUDIO_RETOUCH_WORKER_PROTOCOL_VERSION
      ) {
        finish(() => reject(new Error("리터치 Worker가 알 수 없는 응답을 반환했습니다.")));
        return;
      }
      if (response.type === "studio-retouch/ready") {
        if (requestPosted) return;
        if (readyTimer !== null) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        try {
          requestPosted = true;
          worker.postMessage(message, studioRetouchRequestTransfers(message));
          if (!settled) {
            operationTimer = setTimeout(
              onOperationTimeout,
              boundedTimeout(options.operationTimeoutMilliseconds, DEFAULT_OPERATION_TIMEOUT_MS),
            );
          }
        } catch (error) {
          // A custom Worker-like transport can detach transferables and still throw. Once the
          // transfer call begins, never inspect or synchronously process the possibly detached
          // source buffer. Construction, load and ready-timeout failures still use the bounded
          // direct fallback before this ownership boundary.
          const transferError = error instanceof Error
            ? error
            : new Error("리터치 Worker로 픽셀 소유권을 전송하지 못했습니다.");
          finish(() => reject(transferError));
        }
        return;
      }
      if (!requestPosted) {
        finish(() => reject(new Error("리터치 Worker가 준비 전에 결과를 반환했습니다.")));
        return;
      }
      if (response.type === "studio-retouch/failure") {
        finish(() => reject(deserializeWorkerError(response)));
        return;
      }
      if (
        response.type !== "studio-retouch/success"
        || response.kind !== request.kind
        || response.w !== request.w
        || response.h !== request.h
        || !(response.data instanceof Uint8ClampedArray)
        || response.data.byteLength !== request.w * request.h * 4
      ) {
        finish(() => reject(new Error("리터치 Worker 결과가 요청과 일치하지 않습니다.")));
        return;
      }
      finish(() => resolve({ execution: "worker", kind: response.kind, data: response.data }));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      if (!requestPosted) {
        resolveDirectFallback();
        return;
      }
      const error = event.error instanceof Error
        ? event.error
        : new Error(event.message || "리터치 Worker 실행 중 오류가 발생했습니다.");
      finish(() => reject(error));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    readyTimer = setTimeout(
      resolveDirectFallback,
      boundedTimeout(options.readyTimeoutMilliseconds, DEFAULT_READY_TIMEOUT_MS),
    );
  });
}

/**
 * Runs exactly one destructive retouch operation. Pixel ownership is transferred only after the
 * module Worker reports ready; construction/load/ready-timeout failures before that boundary use a
 * bounded direct fallback. A `postMessage` call itself is the ownership boundary, so synchronous
 * post failures and later Worker failures reject rather than reading a possibly detached buffer.
 */
export async function runStudioRetouchWorker(
  request: StudioRetouchWorkerRunRequest,
  options: StudioRetouchWorkerClientOptions = {},
): Promise<StudioRetouchWorkerClientResult> {
  throwIfAborted(options.signal);
  const cloneSafe = cloneSafeRequest(request);
  const factory = options.workerFactory === undefined
    ? createStudioRetouchModuleWorker
    : options.workerFactory;
  if (!factory) return runRetouchDirect(cloneSafe, options.signal);

  let worker: StudioRetouchWorkerLike | null;
  try {
    worker = factory();
  } catch {
    return runRetouchDirect(cloneSafe, options.signal);
  }
  if (!worker) return runRetouchDirect(cloneSafe, options.signal);
  return runRetouchWithWorker(worker, cloneSafe, options);
}
