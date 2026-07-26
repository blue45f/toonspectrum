import { loadStudioPerfectFreehandStroker } from "./studio-perfect-freehand";
import { exportPageToSvg, type SvgExportPageInput, type SvgExportResult } from "./studio-svg-export";
import {
  STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
  type StudioSvgExportWorkerResponseMessage,
  type StudioSvgExportWorkerRunMessage,
} from "./studio-svg-export-worker-protocol";

export interface StudioSvgExportWorkerLike {
  onmessage: ((event: MessageEvent<StudioSvgExportWorkerResponseMessage>) => void) | null;
  onerror:
    | ((event: {
        readonly error?: unknown;
        readonly message?: string;
        preventDefault?(): void;
      }) => void)
    | null;
  postMessage(message: StudioSvgExportWorkerRunMessage): void;
  terminate(): void;
}

export type StudioSvgExportWorkerFactory = () => StudioSvgExportWorkerLike | null;

export interface StudioSvgExportWorkerClientOptions {
  signal?: AbortSignal;
  /** `null` explicitly selects the synchronous fallback; omitted uses the Vite module worker. */
  workerFactory?: StudioSvgExportWorkerFactory | null;
}

export interface StudioSvgExportWorkerClientResult {
  execution: "worker" | "direct";
  result: SvgExportResult;
}

/** Vite statically discovers this exact URL pattern and emits an isolated module-worker chunk. */
export function createStudioSvgExportModuleWorker(): StudioSvgExportWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(new URL("./studio-svg-export.worker.ts", import.meta.url), {
    type: "module",
    name: "toonspectrum-svg-export",
  }) as unknown as StudioSvgExportWorkerLike;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("SVG 내보내기를 취소했습니다.", "AbortError");
  }
  const error = new Error("SVG 내보내기를 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}

async function runSvgExportDirect(
  input: SvgExportPageInput,
  signal: AbortSignal | undefined,
): Promise<StudioSvgExportWorkerClientResult> {
  throwIfAborted(signal);
  // Match the short-lived module worker: a CSP/Worker fallback must not downgrade outline brushes
  // to a uniform Line merely because its dynamic chunk has not been requested on this thread yet.
  await loadStudioPerfectFreehandStroker();
  throwIfAborted(signal);
  return { execution: "direct", result: exportPageToSvg(input) };
}

function deserializeWorkerError(response: Extract<
  StudioSvgExportWorkerResponseMessage,
  { type: "studio-svg-export/failure" }
>): Error {
  const error = new Error(response.error.message);
  error.name = response.error.name || "Error";
  return error;
}

function runSvgExportWithWorker(
  worker: StudioSvgExportWorkerLike,
  input: SvgExportPageInput,
  signal: AbortSignal | undefined,
): Promise<StudioSvgExportWorkerClientResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let requestPosted = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    const message: StudioSvgExportWorkerRunMessage = {
      type: "studio-svg-export/run",
      version: STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
      input,
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
      void runSvgExportDirect(input, signal).then(resolve, reject);
    });

    worker.onmessage = (event) => {
      const response = event.data;
      if (response.version !== STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION) {
        finish(() => reject(new Error("SVG 내보내기 Worker가 알 수 없는 응답을 반환했습니다.")));
        return;
      }
      if (response.type === "studio-svg-export/ready") {
        if (requestPosted) return;
        if (readyTimer !== null) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        try {
          worker.postMessage(message);
          requestPosted = true;
        } catch {
          resolveDirectFallback();
        }
        return;
      }
      if (!requestPosted) {
        finish(() => reject(new Error("SVG 내보내기 Worker가 준비 전에 결과를 반환했습니다.")));
        return;
      }
      if (response.type === "studio-svg-export/failure") {
        finish(() => reject(deserializeWorkerError(response)));
        return;
      }
      finish(() => resolve({ execution: "worker", result: response.result }));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      if (!requestPosted) {
        resolveDirectFallback();
        return;
      }
      const error =
        event.error instanceof Error
          ? event.error
          : new Error(event.message || "SVG 내보내기 Worker 실행 중 오류가 발생했습니다.");
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
 * 벡터 SVG 직렬화를 모듈 Worker에서 실행한다. 입력(요소 트리)·출력(SVG 문자열) 모두 구조적
 * 복제만으로 충분한 순수 JSON이라 transferable은 쓰지 않는다. Worker를 못 만들면(구형
 * 브라우저·CSP) outline 엔진 준비 뒤 동일한 exportPageToSvg를 메인 스레드에서 실행한다.
 */
export async function runStudioSvgExportWorker(
  input: SvgExportPageInput,
  options: StudioSvgExportWorkerClientOptions = {},
): Promise<StudioSvgExportWorkerClientResult> {
  throwIfAborted(options.signal);
  const factory =
    options.workerFactory === undefined ? createStudioSvgExportModuleWorker : options.workerFactory;
  if (!factory) return runSvgExportDirect(input, options.signal);

  let worker: StudioSvgExportWorkerLike | null;
  try {
    worker = factory();
  } catch {
    return runSvgExportDirect(input, options.signal);
  }
  if (!worker) return runSvgExportDirect(input, options.signal);
  return runSvgExportWithWorker(worker, input, options.signal);
}
