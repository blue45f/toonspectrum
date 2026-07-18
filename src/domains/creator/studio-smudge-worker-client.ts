import { smudgeStroke } from "./studio-smudge";
import {
  STUDIO_SMUDGE_WORKER_PROTOCOL_VERSION,
  studioSmudgeRequestTransfers,
  type StudioSmudgeWorkerResponseMessage,
  type StudioSmudgeWorkerRunMessage,
  type StudioSmudgeWorkerRunRequest,
} from "./studio-smudge-worker-protocol";

export interface StudioSmudgeWorkerLike {
  onmessage: ((event: MessageEvent<StudioSmudgeWorkerResponseMessage>) => void) | null;
  onerror:
    | ((event: {
        readonly error?: unknown;
        readonly message?: string;
        preventDefault?(): void;
      }) => void)
    | null;
  postMessage(message: StudioSmudgeWorkerRunMessage, transfer: Transferable[]): void;
  terminate(): void;
}

export type StudioSmudgeWorkerFactory = () => StudioSmudgeWorkerLike | null;

export interface StudioSmudgeWorkerClientOptions {
  signal?: AbortSignal;
  /** `null` explicitly selects the synchronous fallback; omitted uses the Vite module worker. */
  workerFactory?: StudioSmudgeWorkerFactory | null;
}

export interface StudioSmudgeWorkerClientResult {
  execution: "worker" | "direct";
  data: Uint8ClampedArray;
}

/** Vite statically discovers this exact URL pattern and emits an isolated module-worker chunk. */
export function createStudioSmudgeModuleWorker(): StudioSmudgeWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(new URL("./studio-smudge.worker.ts", import.meta.url), {
    type: "module",
    name: "toonspectrum-smudge",
  }) as unknown as StudioSmudgeWorkerLike;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("문지르기 계산을 취소했습니다.", "AbortError");
  }
  const error = new Error("문지르기 계산을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}

function runSmudgeDirect(
  request: StudioSmudgeWorkerRunRequest,
  signal: AbortSignal | undefined,
): StudioSmudgeWorkerClientResult {
  throwIfAborted(signal);
  const data = smudgeStroke(request.data, request.w, request.h, request.points, request.radiusPx, request.strength);
  return { execution: "direct", data };
}

function deserializeWorkerError(response: Extract<
  StudioSmudgeWorkerResponseMessage,
  { type: "studio-smudge/failure" }
>): Error {
  const error = new Error(response.error.message);
  error.name = response.error.name || "Error";
  return error;
}

function runSmudgeWithWorker(
  worker: StudioSmudgeWorkerLike,
  request: StudioSmudgeWorkerRunRequest,
  signal: AbortSignal | undefined,
): Promise<StudioSmudgeWorkerClientResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let requestPosted = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    const message: StudioSmudgeWorkerRunMessage = {
      type: "studio-smudge/run",
      version: STUDIO_SMUDGE_WORKER_PROTOCOL_VERSION,
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
        resolve(runSmudgeDirect(request, signal));
      } catch (error) {
        reject(error);
      }
    });

    worker.onmessage = (event) => {
      const response = event.data;
      if (response.version !== STUDIO_SMUDGE_WORKER_PROTOCOL_VERSION) {
        finish(() => reject(new Error("문지르기 Worker가 알 수 없는 응답을 반환했습니다.")));
        return;
      }
      if (response.type === "studio-smudge/ready") {
        if (requestPosted) return;
        if (readyTimer !== null) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        try {
          worker.postMessage(message, studioSmudgeRequestTransfers(message));
          requestPosted = true;
        } catch {
          resolveDirectFallback();
        }
        return;
      }
      if (!requestPosted) {
        finish(() => reject(new Error("문지르기 Worker가 준비 전에 결과를 반환했습니다.")));
        return;
      }
      if (response.type === "studio-smudge/failure") {
        finish(() => reject(deserializeWorkerError(response)));
        return;
      }
      finish(() => resolve({ execution: "worker", data: response.data }));
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
          : new Error(event.message || "문지르기 Worker 실행 중 오류가 발생했습니다.");
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
 * 문지르기 브러시의 스탬프 블렌드 루프를 한 번의 모듈 Worker 호출로 실행한다. ArrayBuffer 기반
 * 픽셀 데이터는 소유권이 이전(detach)되어 전송된다. Worker를 못 만들면(구형 브라우저·CSP) 동일한
 * smudgeStroke를 메인 스레드에서 동기 실행해 폴백한다.
 */
export async function runStudioSmudgeWorker(
  request: StudioSmudgeWorkerRunRequest,
  options: StudioSmudgeWorkerClientOptions = {},
): Promise<StudioSmudgeWorkerClientResult> {
  throwIfAborted(options.signal);
  const factory =
    options.workerFactory === undefined ? createStudioSmudgeModuleWorker : options.workerFactory;
  if (!factory) return runSmudgeDirect(request, options.signal);

  let worker: StudioSmudgeWorkerLike | null;
  try {
    worker = factory();
  } catch {
    return runSmudgeDirect(request, options.signal);
  }
  if (!worker) return runSmudgeDirect(request, options.signal);
  return runSmudgeWithWorker(worker, request, options.signal);
}
