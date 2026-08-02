import {
  type DodgeBurnPixelPoint,
  type DodgeBurnSettings,
} from "./studio-dodge-burn";
import { runStudioRetouchWorker } from "./studio-retouch-worker-client";
import {
  type WetMixPixelPoint,
  type WetMixSettings,
} from "./studio-wet-mix";

export interface StudioRetouchBrowserOptions {
  readonly signal?: AbortSignal;
}

function createRetouchAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("리터치 처리를 취소했습니다.", "AbortError");
  }
  const error = new Error("리터치 처리를 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createRetouchAbortError();
}

export async function runStudioDodgeBurnRetouch(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  points: readonly DodgeBurnPixelPoint[],
  settings: DodgeBurnSettings,
  options: StudioRetouchBrowserOptions = {},
): Promise<Uint8ClampedArray> {
  const result = await runStudioRetouchWorker(
    { kind: "dodge-burn", data, w, h, points, settings },
    { signal: options.signal },
  );
  return result.data;
}

export async function runStudioWetMixRetouch(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  points: readonly WetMixPixelPoint[],
  settings: WetMixSettings,
  options: StudioRetouchBrowserOptions = {},
): Promise<Uint8ClampedArray> {
  const result = await runStudioRetouchWorker(
    { kind: "wet-mix", data, w, h, points, settings },
    { signal: options.signal },
  );
  return result.data;
}

function blobToDataUrl(blob: Blob, signal: AbortSignal | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => {
      reader.abort();
      finish(() => reject(createRetouchAbortError()));
    };
    reader.onerror = () => finish(() => reject(
      reader.error ?? new Error("리터치 PNG를 읽지 못했습니다."),
    ));
    reader.onload = () => finish(() => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("리터치 PNG를 data URL로 만들지 못했습니다."));
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    reader.readAsDataURL(blob);
  });
}

/** Uses asynchronous browser PNG encoding; synchronous toDataURL remains legacy-only fallback. */
export async function encodeStudioRetouchCanvasPng(
  canvas: HTMLCanvasElement,
  options: StudioRetouchBrowserOptions = {},
): Promise<string> {
  throwIfAborted(options.signal);
  if (typeof canvas.toBlob !== "function") return canvas.toDataURL("image/png");
  const blob = await new Promise<Blob>((resolve, reject) => {
    let settled = false;
    const cleanup = () => options.signal?.removeEventListener("abort", onAbort);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => finish(() => reject(createRetouchAbortError()));
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    canvas.toBlob((value) => finish(() => {
      if (value) resolve(value);
      else reject(new Error("리터치 PNG 인코딩에 실패했습니다."));
    }), "image/png");
  });
  throwIfAborted(options.signal);
  return blobToDataUrl(blob, options.signal);
}
