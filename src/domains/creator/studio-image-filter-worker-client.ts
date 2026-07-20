import {
  STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION,
  assertStudioImageFilterImageData,
  studioImageFilterRequestTransfers,
  type StudioImageFilterWorkerResponseMessage,
  type StudioImageFilterWorkerRunMessage,
  type StudioImageFilterWorkerRunRequest,
} from "./studio-image-filter-worker-protocol";
import { applyImageFilters, buildImageFilters, registerStudioKonvaFilters, type KonvaLike } from "./studio-konva-filters";

import type { StudioImageDataLike } from "./studio-filters";
import type { ImageFilterFields } from "./studio-konva-filter-fields";

export interface StudioImageFilterWorkerLike {
  onmessage: ((event: MessageEvent<StudioImageFilterWorkerResponseMessage>) => void) | null;
  onerror:
    | ((event: {
        readonly error?: unknown;
        readonly message?: string;
        preventDefault?(): void;
      }) => void)
    | null;
  postMessage(message: StudioImageFilterWorkerRunMessage, transfer: Transferable[]): void;
  terminate(): void;
}

export type StudioImageFilterWorkerFactory = () => StudioImageFilterWorkerLike | null;

export interface StudioImageFilterWorkerClientOptions {
  signal?: AbortSignal;
  /** `null` explicitly selects the synchronous fallback; omitted uses the Vite module worker. */
  workerFactory?: StudioImageFilterWorkerFactory | null;
}

export interface StudioImageFilterWorkerClientResult {
  execution: "worker" | "direct";
  imageData: StudioImageDataLike;
}

/** Vite statically discovers this exact URL pattern and emits an isolated module-worker chunk. */
export function createStudioImageFilterModuleWorker(): StudioImageFilterWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(new URL("./studio-image-filter.worker.ts", import.meta.url), {
    type: "module",
    name: "toonspectrum-image-filter",
  }) as unknown as StudioImageFilterWorkerLike;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("이미지 필터 계산을 취소했습니다.", "AbortError");
  }
  const error = new Error("이미지 필터 계산을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}

type ExhaustiveImageFilterFieldProjection = ImageFilterFields & Record<keyof ImageFilterFields, unknown>;

/**
 * Studio 이미지 요소처럼 더 넓은 객체에서 Worker/필터 엔진에 필요한 필드만 새 객체로 투영한다.
 * 이 코드는 의도 기반 Worker 청크 안에 둬 정적 Studio 경로에 공용 청크 요청을 추가하지 않는다.
 * 객체 열거·spread를 쓰지 않으므로 src, frame, 3D/VRM, provenance 같은 메타데이터가
 * structured clone 경계로 새어 나가지 않으며, 필드 추가 시 exhaustive 타입이 누락을 잡는다.
 */
function projectImageFilterFields(el: ImageFilterFields): ImageFilterFields {
  const finite = (value: number | undefined): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const projection = {
    blur: finite(el.blur),
    brightness: finite(el.brightness),
    contrast: finite(el.contrast),
    grayscale: el.grayscale,
    sepia: el.sepia,
    screentone: el.screentone,
    lineart: el.lineart,
    chromatic: finite(el.chromatic),
    posterize: finite(el.posterize),
    noise: finite(el.noise),
    saturation: finite(el.saturation),
    hue: finite(el.hue),
    temperature: finite(el.temperature),
    sharpen: finite(el.sharpen),
    pixelate: finite(el.pixelate),
    invert: el.invert,
    inkThreshold: finite(el.inkThreshold),
    duotoneShadow: el.duotoneShadow,
    duotoneHighlight: el.duotoneHighlight,
    levelsBlack: finite(el.levelsBlack),
    levelsWhite: finite(el.levelsWhite),
    levelsGamma: finite(el.levelsGamma),
    levelsOutBlack: finite(el.levelsOutBlack),
    levelsOutWhite: finite(el.levelsOutWhite),
    levelsCh: el.levelsCh,
    curve: el.curve,
    curveCh: el.curveCh,
    colorBalance: el.colorBalance,
    channelMixer: el.channelMixer,
    selectiveHsl: el.selectiveHsl,
    vibrance: el.vibrance,
    gradientMap: el.gradientMap,
    photoFilter: el.photoFilter,
    colorToAlpha: el.colorToAlpha,
    autoAdjust: el.autoAdjust,
    clarity: el.clarity,
    outline: el.outline,
    glow: el.glow,
    halftone: el.halftone,
    grain: el.grain,
    inkWash: el.inkWash,
    blurFx: el.blurFx,
    distort: el.distort,
    stylize: el.stylize,
    light: el.light,
    sketch: el.sketch,
    detail: el.detail,
  } satisfies ExhaustiveImageFilterFieldProjection;

  return projection;
}

/** Narrows the input to the protocol's clone-safe contract — drops any caller-attached helpers. */
function cloneSafeWorkerRequest(request: StudioImageFilterWorkerRunRequest): StudioImageFilterWorkerRunRequest {
  assertStudioImageFilterImageData(request.imageData);
  const sourceData = request.imageData.data;
  // 부분 view를 그대로 transfer하면 같은 ArrayBuffer의 무관한 바이트까지 Worker로 노출되고
  // 형제 view도 함께 detach된다. SharedArrayBuffer도 transferable이 아니므로 전용 버퍼로 복제한다.
  const hasDedicatedTransferableBuffer =
    sourceData.buffer instanceof ArrayBuffer
    && sourceData.byteOffset === 0
    && sourceData.byteLength === sourceData.buffer.byteLength;
  return {
    imageData: {
      data: hasDedicatedTransferableBuffer ? sourceData : new Uint8ClampedArray(sourceData),
      width: request.imageData.width,
      height: request.imageData.height,
    },
    el: projectImageFilterFields(request.el),
  };
}

const directFilterRegistry: KonvaLike = { Filters: {} };
registerStudioKonvaFilters(directFilterRegistry);

function runImageFilterDirect(
  request: StudioImageFilterWorkerRunRequest,
  signal: AbortSignal | undefined,
): StudioImageFilterWorkerClientResult {
  throwIfAborted(signal);
  const { filters, attrs } = buildImageFilters(request.el, directFilterRegistry);
  applyImageFilters(request.imageData, filters, attrs);
  return { execution: "direct", imageData: request.imageData };
}

function deserializeWorkerError(response: Extract<
  StudioImageFilterWorkerResponseMessage,
  { type: "studio-image-filter/failure" }
>): Error {
  const error = new Error(response.error.message);
  error.name = response.error.name || "Error";
  return error;
}

function runImageFilterWithWorker(
  worker: StudioImageFilterWorkerLike,
  request: StudioImageFilterWorkerRunRequest,
  signal: AbortSignal | undefined,
): Promise<StudioImageFilterWorkerClientResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let requestPosted = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    const message: StudioImageFilterWorkerRunMessage = {
      type: "studio-image-filter/run",
      version: STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION,
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
        resolve(runImageFilterDirect(request, signal));
      } catch (error) {
        reject(error);
      }
    });

    worker.onmessage = (event) => {
      const response = event.data;
      if (
        !response
        || typeof response !== "object"
        || response.version !== STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION
      ) {
        finish(() => reject(new Error("이미지 필터 Worker가 알 수 없는 응답을 반환했습니다.")));
        return;
      }
      if (response.type === "studio-image-filter/ready") {
        if (requestPosted) return;
        if (readyTimer !== null) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        try {
          requestPosted = true;
          worker.postMessage(message, studioImageFilterRequestTransfers(message));
        } catch {
          requestPosted = false;
          resolveDirectFallback();
        }
        return;
      }
      if (!requestPosted) {
        finish(() => reject(new Error("이미지 필터 Worker가 준비 전에 결과를 반환했습니다.")));
        return;
      }
      if (response.type === "studio-image-filter/failure") {
        finish(() => reject(deserializeWorkerError(response)));
        return;
      }
      if (response.type !== "studio-image-filter/success") {
        finish(() => reject(new Error("이미지 필터 Worker가 알 수 없는 응답을 반환했습니다.")));
        return;
      }
      try {
        assertStudioImageFilterImageData(response.imageData, "이미지 필터 Worker 결과");
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      finish(() => resolve({ execution: "worker", imageData: response.imageData }));
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
          : new Error(event.message || "이미지 필터 Worker 실행 중 오류가 발생했습니다.");
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
 * 이미지 보정 필터 체인을 한 번의 모듈 Worker 호출로 실행한다. ArrayBuffer 기반 imageData는
 * 소유권이 이전(detach)되어 전송된다. Worker를 못 만들면(구형 브라우저·CSP) 동일한
 * buildImageFilters/applyImageFilters 경로를 메인 스레드에서 동기 실행해 폴백한다.
 */
export async function runStudioImageFilterWorker(
  request: StudioImageFilterWorkerRunRequest,
  options: StudioImageFilterWorkerClientOptions = {},
): Promise<StudioImageFilterWorkerClientResult> {
  throwIfAborted(options.signal);
  const cloneSafeRequest = cloneSafeWorkerRequest(request);
  const factory =
    options.workerFactory === undefined ? createStudioImageFilterModuleWorker : options.workerFactory;
  if (!factory) return runImageFilterDirect(cloneSafeRequest, options.signal);

  let worker: StudioImageFilterWorkerLike | null;
  try {
    worker = factory();
  } catch {
    return runImageFilterDirect(cloneSafeRequest, options.signal);
  }
  if (!worker) return runImageFilterDirect(cloneSafeRequest, options.signal);
  return runImageFilterWithWorker(worker, cloneSafeRequest, options.signal);
}
