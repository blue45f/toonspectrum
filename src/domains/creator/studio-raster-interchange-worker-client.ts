import {
  decodeStudioRasterInterchange,
  encodeStudioRasterInterchange,
  type StudioRasterDecoded,
  type StudioRasterEncoded,
  type StudioRasterInterchangeFormat,
  type StudioRgbaBitmap,
} from "./studio-raster-interchange";
import {
  STUDIO_RASTER_INTERCHANGE_WORKER_VERSION,
  studioRasterInterchangeRequestTransfers,
  type StudioRasterInterchangeWorkerRequest,
  type StudioRasterInterchangeWorkerResponse,
  type StudioRasterInterchangeWorkerSuccessResponse,
} from "./studio-raster-interchange-worker-protocol";

export const STUDIO_RASTER_INTERCHANGE_DIRECT_MAX_BYTES = 4 * 1024 * 1024;
export const STUDIO_RASTER_INTERCHANGE_DIRECT_MAX_PIXELS = 1_048_576;

export class StudioRasterInterchangeWorkerRequiredError extends Error {
  readonly code = "WORKER_REQUIRED" as const;

  constructor(message: string) {
    super(message);
    this.name = "StudioRasterInterchangeWorkerRequiredError";
  }
}

export interface StudioRasterInterchangeWorkerLike {
  onmessage: ((event: MessageEvent<StudioRasterInterchangeWorkerResponse>) => void) | null;
  onerror: ((event: { readonly message?: string; preventDefault?(): void }) => void) | null;
  postMessage(message: StudioRasterInterchangeWorkerRequest, transfers: Transferable[]): void;
  terminate(): void;
}

export type StudioRasterInterchangeWorkerFactory = () => StudioRasterInterchangeWorkerLike | null;

interface StudioRasterInterchangeAsyncOptions {
  readonly signal?: AbortSignal;
  /** `null` explicitly selects the budgeted direct fallback. */
  readonly workerFactory?: StudioRasterInterchangeWorkerFactory | null;
  readonly readyTimeoutMs?: number;
}

export interface StudioRasterInterchangeAsyncResult {
  readonly execution: "direct" | "worker";
  readonly encoded: StudioRasterEncoded;
}

export interface StudioRasterDecodeAsyncResult {
  readonly execution: "direct" | "worker";
  readonly decoded: StudioRasterDecoded;
}

interface StudioRasterWorkerRunResult {
  readonly execution: "direct" | "worker";
  readonly response: StudioRasterInterchangeWorkerSuccessResponse;
}

type StudioRasterEncodeSuccessResponse = Extract<
  StudioRasterInterchangeWorkerSuccessResponse,
  { readonly type: "studio-raster-interchange/encode-success" }
>;
type StudioRasterDecodeSuccessResponse = Extract<
  StudioRasterInterchangeWorkerSuccessResponse,
  { readonly type: "studio-raster-interchange/decode-success" }
>;

export function createStudioRasterInterchangeModuleWorker(): StudioRasterInterchangeWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(new URL("./studio-raster-interchange.worker.ts", import.meta.url), {
    type: "module",
    name: "toonspectrum-raster-interchange",
  }) as unknown as StudioRasterInterchangeWorkerLike;
}

function abortError(): Error {
  if (typeof DOMException === "function") return new DOMException("래스터 작업을 취소했습니다.", "AbortError");
  const error = new Error("래스터 작업을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function workerRequired(operation: "인코딩" | "디코딩"): StudioRasterInterchangeWorkerRequiredError {
  return new StudioRasterInterchangeWorkerRequiredError(
    `이 래스터 ${operation}은 직접 처리 안전 상한(4MiB, 1,048,576픽셀)을 초과해 Web Worker가 필요합니다.`
  );
}

function bitmapExceedsDirectBudget(bitmap: StudioRgbaBitmap): boolean {
  const pixels = bitmap.width * bitmap.height;
  return bitmap.data.byteLength > STUDIO_RASTER_INTERCHANGE_DIRECT_MAX_BYTES
    || (Number.isSafeInteger(pixels) && pixels > STUDIO_RASTER_INTERCHANGE_DIRECT_MAX_PIXELS);
}

function directEncode(
  format: StudioRasterInterchangeFormat,
  bitmap: StudioRgbaBitmap,
  requestId: string
): StudioRasterEncodeSuccessResponse {
  if (bitmapExceedsDirectBudget(bitmap)) throw workerRequired("인코딩");
  return {
    type: "studio-raster-interchange/encode-success",
    version: STUDIO_RASTER_INTERCHANGE_WORKER_VERSION,
    requestId,
    result: encodeStudioRasterInterchange(format, bitmap),
  };
}

function directDecode(
  bytes: Uint8Array,
  expectedFormat: StudioRasterInterchangeFormat | undefined,
  requestId: string
): StudioRasterDecodeSuccessResponse {
  if (bytes.byteLength > STUDIO_RASTER_INTERCHANGE_DIRECT_MAX_BYTES) throw workerRequired("디코딩");
  try {
    return {
      type: "studio-raster-interchange/decode-success",
      version: STUDIO_RASTER_INTERCHANGE_WORKER_VERSION,
      requestId,
      result: decodeStudioRasterInterchange(bytes, expectedFormat, {
        maximumPixels: STUDIO_RASTER_INTERCHANGE_DIRECT_MAX_PIXELS,
      }),
    };
  } catch (error) {
    if (
      error instanceof Error
      && "code" in error
      && error.code === "OUTPUT_TOO_LARGE"
    ) {
      throw workerRequired("디코딩");
    }
    throw error;
  }
}

function createWorker(
  factory: StudioRasterInterchangeWorkerFactory | null
): StudioRasterInterchangeWorkerLike | null {
  try {
    return factory?.() ?? null;
  } catch {
    return null;
  }
}

async function runStudioRasterInterchangeWorker(
  worker: StudioRasterInterchangeWorkerLike,
  request: StudioRasterInterchangeWorkerRequest,
  directFallback: () => StudioRasterInterchangeWorkerSuccessResponse,
  options: StudioRasterInterchangeAsyncOptions
): Promise<StudioRasterWorkerRunResult> {
  const timeoutMs = Math.max(100, Math.min(10_000, Math.trunc(options.readyTimeoutMs ?? 2_000)));

  return await new Promise<StudioRasterWorkerRunResult>((resolve, reject) => {
    let settled = false;
    let posted = false;
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
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
    const onAbort = () => finish(() => reject(abortError()));
    const fallback = () => finish(() => {
      try {
        resolve({ execution: "direct", response: directFallback() });
      } catch (error) {
        reject(error);
      }
    });
    const timer = globalThis.setTimeout(() => {
      if (!posted) {
        fallback();
        return;
      }
      finish(() => reject(new Error("래스터 Worker 처리 시간이 초과되었습니다.")));
    }, timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    worker.onerror = (event) => {
      event.preventDefault?.();
      if (!posted) fallback();
      else finish(() => reject(new Error(event.message || "래스터 Worker 실행 중 오류가 발생했습니다.")));
    };
    worker.onmessage = (event) => {
      const response = event.data;
      if (!response || response.version !== STUDIO_RASTER_INTERCHANGE_WORKER_VERSION) {
        finish(() => reject(new Error("래스터 Worker가 알 수 없는 응답을 반환했습니다.")));
        return;
      }
      if (response.type === "studio-raster-interchange/ready") {
        if (posted) return;
        try {
          posted = true;
          worker.postMessage(request, studioRasterInterchangeRequestTransfers(request));
        } catch {
          posted = false;
          fallback();
        }
        return;
      }
      if (!posted || response.requestId !== request.requestId) return;
      if (response.type === "studio-raster-interchange/failure") {
        const error = new Error(response.error.message);
        error.name = response.error.name;
        finish(() => reject(error));
        return;
      }
      finish(() => resolve({ execution: "worker", response }));
    };
  });
}

export async function encodeStudioRasterInterchangeAsync(
  format: StudioRasterInterchangeFormat,
  bitmap: StudioRgbaBitmap,
  options: StudioRasterInterchangeAsyncOptions = {}
): Promise<StudioRasterInterchangeAsyncResult> {
  if (options.signal?.aborted) throw abortError();
  const requestId = crypto.randomUUID();
  const factory = options.workerFactory === undefined
    ? createStudioRasterInterchangeModuleWorker
    : options.workerFactory;
  const worker = createWorker(factory);
  if (!worker) {
    const response = directEncode(format, bitmap, requestId);
    return { execution: "direct", encoded: response.result };
  }

  // Caller-owned ImageData and subarrays must never be detached at the Worker boundary.
  const data = new Uint8ClampedArray(bitmap.data);
  const request: StudioRasterInterchangeWorkerRequest = {
    type: "studio-raster-interchange/encode",
    version: STUDIO_RASTER_INTERCHANGE_WORKER_VERSION,
    requestId,
    format,
    width: bitmap.width,
    height: bitmap.height,
    data,
  };
  const result = await runStudioRasterInterchangeWorker(
    worker,
    request,
    () => directEncode(format, bitmap, requestId),
    options
  );
  if (result.response.type !== "studio-raster-interchange/encode-success") {
    throw new Error("래스터 Worker가 인코딩 요청에 잘못된 응답을 반환했습니다.");
  }
  return { execution: result.execution, encoded: result.response.result };
}

export async function decodeStudioRasterInterchangeAsync(
  source: Uint8Array | ArrayBuffer,
  expectedFormat?: StudioRasterInterchangeFormat,
  options: StudioRasterInterchangeAsyncOptions = {}
): Promise<StudioRasterDecodeAsyncResult> {
  if (options.signal?.aborted) throw abortError();
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const requestId = crypto.randomUUID();
  const factory = options.workerFactory === undefined
    ? createStudioRasterInterchangeModuleWorker
    : options.workerFactory;
  const worker = createWorker(factory);
  if (!worker) {
    const response = directDecode(bytes, expectedFormat, requestId);
    return { execution: "direct", decoded: response.result };
  }

  // Copy every view (including offset subarrays) so transferring cannot detach caller memory.
  const workerBytes = new Uint8Array(bytes);
  const request: StudioRasterInterchangeWorkerRequest = {
    type: "studio-raster-interchange/decode",
    version: STUDIO_RASTER_INTERCHANGE_WORKER_VERSION,
    requestId,
    bytes: workerBytes,
    expectedFormat,
  };
  const result = await runStudioRasterInterchangeWorker(
    worker,
    request,
    () => directDecode(bytes, expectedFormat, requestId),
    options
  );
  if (result.response.type !== "studio-raster-interchange/decode-success") {
    throw new Error("래스터 Worker가 디코딩 요청에 잘못된 응답을 반환했습니다.");
  }
  return { execution: result.execution, decoded: result.response.result };
}
