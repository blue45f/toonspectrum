/**
 * Product facade for the Hokusai natural-media Worker.
 *
 * The module keeps WASM, brush JSON, RGBA pixels and OffscreenCanvas outside
 * the main thread. A verified PNG plus a deterministic receipt is the only
 * artifact admitted back into the document transaction.
 */
import {
  STUDIO_HOKUSAI_NATURAL_MEDIA_LIMITS,
  planStudioHokusaiNaturalMediaRender,
  type StudioHokusaiNaturalMediaSettings,
} from "./studio-hokusai-natural-media-contract";
import {
  STUDIO_HOKUSAI_WORKER_ADAPTER_VERSION,
  STUDIO_HOKUSAI_WORKER_PROTOCOL_VERSION,
  type StudioHokusaiWorkerFailureMessage,
  type StudioHokusaiWorkerReadyMessage,
  type StudioHokusaiWorkerReceipt,
  type StudioHokusaiWorkerRenderMessage,
  type StudioHokusaiWorkerResultMessage,
} from "./studio-hokusai-natural-media-worker-protocol";

import type { DrawEl } from "./studio-element-model";

export const STUDIO_HOKUSAI_PRODUCT_ENGINE_EPOCH = 1 as const;
export const STUDIO_HOKUSAI_PRODUCT_STARTUP_TIMEOUT_MS = 30_000 as const;
export const STUDIO_HOKUSAI_PRODUCT_RENDER_TIMEOUT_MS = 60_000 as const;

export interface StudioHokusaiNaturalMediaProductOptions {
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly engineEpoch?: number;
  readonly signal: AbortSignal;
}

export interface StudioHokusaiNaturalMediaProductResult {
  readonly src: `data:image/png;base64,${string}`;
  readonly rasterWidth: number;
  readonly rasterHeight: number;
  readonly logicalBounds: Readonly<{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }>;
  readonly sourceElementId: string;
  readonly sourceRevision: `hokusai-source-v1:${string}`;
  readonly name: string;
  readonly receipt: StudioHokusaiWorkerReceipt;
  readonly message: string;
}

export type StudioHokusaiNaturalMediaProbeResult =
  | Readonly<{
      readonly available: true;
      readonly message: string;
      readonly runtime: StudioHokusaiWorkerReadyMessage["runtime"];
    }>
  | Readonly<{
      readonly available: false;
      readonly message: string;
    }>;

let nextRequestId = 0;

function requestId(): number {
  if (nextRequestId >= Number.MAX_SAFE_INTEGER) {
    throw new Error("Hokusai 요청 순번 한도에 도달했습니다. 편집기를 다시 열어 주세요.");
  }
  nextRequestId += 1;
  return nextRequestId;
}

function abortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("Hokusai operation was aborted.", "AbortError");
  }
  const error = new Error("Hokusai operation was aborted.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function errorDetail(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message.trim().slice(0, 512)
    : fallback;
}

function createWorker(): Worker {
  if (typeof Worker !== "function") {
    throw new Error("이 브라우저는 자연매체 전용 Worker를 지원하지 않습니다.");
  }
  return new Worker(
    new URL("./studio-hokusai-natural-media.worker.ts", import.meta.url),
    { type: "module", name: "studio-hokusai-natural-media" },
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSha256(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function snapshotReady(candidate: unknown): StudioHokusaiWorkerReadyMessage | null {
  if (
    !isPlainRecord(candidate)
    || candidate.type !== "studio-hokusai/ready"
    || candidate.version !== STUDIO_HOKUSAI_WORKER_PROTOCOL_VERSION
    || !isPlainRecord(candidate.runtime)
    || candidate.runtime.engine !== "reearth-hokusai"
    || candidate.runtime.version !== "0.3.0"
    || candidate.runtime.adapterVersion !== STUDIO_HOKUSAI_WORKER_ADAPTER_VERSION
    || candidate.runtime.wasm !== true
    || candidate.runtime.dedicatedWorker !== true
    || candidate.runtime.transparentRgba !== true
    || candidate.runtime.dirtyTiles !== true
    || candidate.runtime.mainThreadFallback !== false
  ) {
    return null;
  }
  return candidate as unknown as StudioHokusaiWorkerReadyMessage;
}

function snapshotFailure(
  candidate: unknown,
): StudioHokusaiWorkerFailureMessage | null {
  if (
    !isPlainRecord(candidate)
    || candidate.type !== "studio-hokusai/failure"
    || candidate.version !== STUDIO_HOKUSAI_WORKER_PROTOCOL_VERSION
    || (candidate.requestId !== null
      && (
        typeof candidate.requestId !== "number"
        || !Number.isSafeInteger(candidate.requestId)
        || candidate.requestId <= 0
      ))
    || typeof candidate.reason !== "string"
    || ![
      "invalid-message",
      "runtime-unavailable",
      "budget-exceeded",
      "render-failed",
      "blank-output",
      "png-failed",
    ].includes(candidate.reason)
    || typeof candidate.detail !== "string"
  ) {
    return null;
  }
  return candidate as unknown as StudioHokusaiWorkerFailureMessage;
}

function snapshotResult(
  candidate: unknown,
  expected: Readonly<{
    requestId: number;
    engineEpoch: number;
    sourceElementId: string;
    presetId: string;
    seed: number;
    rasterWidth: number;
    rasterHeight: number;
  }>,
): StudioHokusaiWorkerResultMessage | null {
  if (
    !isPlainRecord(candidate)
    || candidate.type !== "studio-hokusai/result"
    || candidate.version !== STUDIO_HOKUSAI_WORKER_PROTOCOL_VERSION
    || candidate.requestId !== expected.requestId
    || candidate.engineEpoch !== expected.engineEpoch
    || !(candidate.pngBytes instanceof ArrayBuffer)
    || candidate.pngBytes.byteLength <= 0
    || candidate.pngBytes.byteLength
      > STUDIO_HOKUSAI_NATURAL_MEDIA_LIMITS.maxPngBytes
    || !isPlainRecord(candidate.receipt)
  ) {
    return null;
  }
  const receipt = candidate.receipt;
  if (
    receipt.kind !== "studio-hokusai/receipt"
    || receipt.version !== STUDIO_HOKUSAI_WORKER_PROTOCOL_VERSION
    || receipt.requestId !== expected.requestId
    || receipt.engineEpoch !== expected.engineEpoch
    || receipt.sourceElementId !== expected.sourceElementId
    || receipt.presetId !== expected.presetId
    || receipt.seed !== expected.seed
    || receipt.rasterWidth !== expected.rasterWidth
    || receipt.rasterHeight !== expected.rasterHeight
    || !Array.isArray(receipt.dirtyBounds)
    || receipt.dirtyBounds.length !== 4
    || !receipt.dirtyBounds.every((value) =>
      typeof value === "number" && Number.isSafeInteger(value))
    || !isSha256(receipt.inputHash)
    || !isSha256(receipt.pixelHash)
    || !isSha256(receipt.pngHash)
    || receipt.adapterVersion !== STUDIO_HOKUSAI_WORKER_ADAPTER_VERSION
    || receipt.execution
      !== "dedicated-worker-wasm-transparent-dirty-tiles"
    || receipt.complete !== true
  ) {
    return null;
  }
  const png = new Uint8Array(candidate.pngBytes);
  if (
    png.length < 24
    || png[0] !== 0x89
    || png[1] !== 0x50
    || png[2] !== 0x4e
    || png[3] !== 0x47
  ) {
    return null;
  }
  return candidate as unknown as StudioHokusaiWorkerResultMessage;
}

function waitForReady(
  worker: Worker,
  signal: AbortSignal,
): Promise<StudioHokusaiWorkerReadyMessage> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      finish(() => reject(new Error("Hokusai WASM 시작 시간이 초과됐습니다.")));
    }, STUDIO_HOKUSAI_PRODUCT_STARTUP_TIMEOUT_MS);
    const cleanup = (): void => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
    };
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = (): void => finish(() => reject(abortError()));
    const onError = (event: ErrorEvent): void => {
      event.preventDefault();
      finish(() => reject(new Error(
        event.message || "Hokusai Worker를 시작하지 못했습니다.",
      )));
    };
    const onMessageError = (): void => finish(() => reject(
      new Error("Hokusai Worker 시작 응답을 읽지 못했습니다."),
    ));
    const onMessage = (event: MessageEvent<unknown>): void => {
      const ready = snapshotReady(event.data);
      if (ready) {
        finish(() => resolve(ready));
        return;
      }
      const failure = snapshotFailure(event.data);
      if (failure) {
        finish(() => reject(new Error(failure.detail)));
        return;
      }
      finish(() => reject(new Error("Hokusai Worker 시작 응답이 손상됐습니다.")));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onMessageError);
    if (signal.aborted) onAbort();
  });
}

function renderInWorker(
  worker: Worker,
  message: StudioHokusaiWorkerRenderMessage,
  signal: AbortSignal,
): Promise<StudioHokusaiWorkerResultMessage> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      finish(() => reject(new Error("Hokusai 자연매체 렌더링 시간이 초과됐습니다.")));
    }, STUDIO_HOKUSAI_PRODUCT_RENDER_TIMEOUT_MS);
    const cleanup = (): void => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
    };
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = (): void => finish(() => reject(abortError()));
    const onError = (event: ErrorEvent): void => {
      event.preventDefault();
      finish(() => reject(new Error(
        event.message || "Hokusai Worker가 중단됐습니다.",
      )));
    };
    const onMessageError = (): void => finish(() => reject(
      new Error("Hokusai Worker 결과를 읽지 못했습니다."),
    ));
    const onMessage = (event: MessageEvent<unknown>): void => {
      const result = snapshotResult(event.data, {
        requestId: message.requestId,
        engineEpoch: message.engineEpoch,
        sourceElementId: message.plan.source.elementId,
        presetId: message.plan.presetId,
        seed: message.plan.seed,
        rasterWidth: message.plan.raster.width,
        rasterHeight: message.plan.raster.height,
      });
      if (result) {
        finish(() => resolve(result));
        return;
      }
      const failure = snapshotFailure(event.data);
      if (failure && (
        failure.requestId === null
        || failure.requestId === message.requestId
      )) {
        finish(() => reject(new Error(failure.detail)));
        return;
      }
      finish(() => reject(new Error("Hokusai Worker 결과 검증에 실패했습니다.")));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onMessageError);
    worker.postMessage(message);
    if (signal.aborted) onAbort();
  });
}

function bytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
}

async function hashPng(
  pngBytes: ArrayBuffer,
  signal: AbortSignal,
): Promise<`sha256:${string}`> {
  throwIfAborted(signal);
  if (typeof globalThis.crypto?.subtle?.digest !== "function") {
    throw new Error("PNG 무결성 검증을 위한 Web Crypto를 사용할 수 없습니다.");
  }
  const copy = pngBytes.slice(0);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  throwIfAborted(signal);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

function pngToDataUrl(
  pngBytes: ArrayBuffer,
  signal: AbortSignal,
): Promise<`data:image/png;base64,${string}`> {
  return new Promise((resolve, reject) => {
    if (
      typeof Blob !== "function"
      || typeof FileReader !== "function"
    ) {
      reject(new Error("PNG를 문서 이미지로 변환할 수 없습니다."));
      return;
    }
    const reader = new FileReader();
    let settled = false;
    const cleanup = (): void => {
      signal.removeEventListener("abort", onAbort);
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
    };
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = (): void => {
      try {
        reader.abort();
      } finally {
        finish(() => reject(abortError()));
      }
    };
    reader.onload = () => {
      const result = reader.result;
      if (
        typeof result !== "string"
        || !result.startsWith("data:image/png;base64,")
      ) {
        finish(() => reject(new Error("PNG 데이터 URL이 올바르지 않습니다.")));
        return;
      }
      finish(() => resolve(result as `data:image/png;base64,${string}`));
    };
    reader.onerror = () => finish(() => reject(
      new Error("PNG 데이터 URL 변환에 실패했습니다."),
    ));
    reader.onabort = () => finish(() => reject(abortError()));
    signal.addEventListener("abort", onAbort, { once: true });
    reader.readAsDataURL(new Blob([pngBytes], { type: "image/png" }));
    if (signal.aborted) onAbort();
  });
}

export async function probeStudioHokusaiNaturalMediaProduct(
  signal: AbortSignal,
): Promise<StudioHokusaiNaturalMediaProbeResult> {
  throwIfAborted(signal);
  let worker: Worker | null = null;
  try {
    worker = createWorker();
    const ready = await waitForReady(worker, signal);
    return Object.freeze({
      available: true,
      message:
        "Hokusai 0.3.0 · 투명 dirty-tile WASM · 전용 Worker를 사용할 수 있습니다.",
      runtime: ready.runtime,
    });
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw abortError();
    }
    return Object.freeze({
      available: false,
      message: errorDetail(error, "Hokusai 자연매체 엔진을 사용할 수 없습니다."),
    });
  } finally {
    worker?.terminate();
  }
}

export async function generateStudioHokusaiNaturalMediaProduct(
  source: DrawEl,
  settings: StudioHokusaiNaturalMediaSettings,
  options: StudioHokusaiNaturalMediaProductOptions,
): Promise<StudioHokusaiNaturalMediaProductResult> {
  throwIfAborted(options.signal);
  const planned = planStudioHokusaiNaturalMediaRender(
    source,
    settings,
    {
      width: options.documentWidth,
      height: options.documentHeight,
    },
  );
  if (!planned.ok) throw new Error(planned.message);
  const plan = planned.plan;
  const engineEpoch =
    options.engineEpoch ?? STUDIO_HOKUSAI_PRODUCT_ENGINE_EPOCH;
  if (!Number.isSafeInteger(engineEpoch) || engineEpoch <= 0) {
    throw new Error("Hokusai 엔진 세대가 올바르지 않습니다.");
  }
  const message: StudioHokusaiWorkerRenderMessage = Object.freeze({
    type: "studio-hokusai/render",
    version: STUDIO_HOKUSAI_WORKER_PROTOCOL_VERSION,
    requestId: requestId(),
    engineEpoch,
    plan,
  });

  let worker: Worker | null = null;
  try {
    worker = createWorker();
    await waitForReady(worker, options.signal);
    throwIfAborted(options.signal);
    const result = await renderInWorker(worker, message, options.signal);
    const pngHash = await hashPng(result.pngBytes, options.signal);
    if (pngHash !== result.receipt.pngHash) {
      throw new Error("Hokusai PNG 무결성 검증에 실패했습니다.");
    }
    const src = await pngToDataUrl(result.pngBytes, options.signal);
    const presetLabel =
      plan.presetId === "pencil"
        ? "연필"
        : plan.presetId === "charcoal"
          ? "목탄"
          : plan.presetId === "oil"
            ? "오일"
            : plan.presetId === "calligraphy"
              ? "캘리그래피"
              : "마커";
    return Object.freeze({
      src,
      rasterWidth: plan.raster.width,
      rasterHeight: plan.raster.height,
      logicalBounds: plan.logicalBounds,
      sourceElementId: plan.source.elementId,
      sourceRevision: plan.source.revision,
      name: `Hokusai ${presetLabel} · ${source.name ?? source.brush ?? "선화"}`,
      receipt: result.receipt,
      message:
        `선택 획을 ${presetLabel} 자연매체 레이어로 변환했습니다. 원본 벡터는 숨김 보존됩니다.`,
    });
  } finally {
    worker?.terminate();
  }
}
