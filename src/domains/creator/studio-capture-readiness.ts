/**
 * Deterministic capture readiness gate for the React-Konva studio.
 *
 * Switching `currentPageId` and sleeping for an arbitrary number of milliseconds can capture the
 * previous page on a busy phone. This module waits for an explicit React commit marker, preloads
 * the target page's raster dependencies, waits for fonts, and gives Konva several paint frames
 * before allowing an export. It deliberately does not inspect or return source URLs in errors:
 * data URLs and signed asset URLs can contain private project material.
 */

export const STUDIO_CAPTURE_READY_DEFAULT_TIMEOUT_MS = 8_000;
export const STUDIO_CAPTURE_READY_MAX_ASSETS = 512;
export const STUDIO_CAPTURE_READY_ASSET_CONCURRENCY = 6;

export type StudioCaptureReadinessCode =
  | "aborted"
  | "asset-limit"
  | "asset-load"
  | "render-timeout"
  | "stale-page";

export class StudioCaptureReadinessError extends Error {
  readonly code: StudioCaptureReadinessCode;

  constructor(code: StudioCaptureReadinessCode, message: string) {
    super(message);
    this.name = "StudioCaptureReadinessError";
    this.code = code;
  }
}

export interface StudioCaptureStageLike {
  batchDraw(): unknown;
}

export interface StudioCaptureReadinessOptions<
  TStage extends StudioCaptureStageLike = StudioCaptureStageLike,
> {
  pageId: string;
  getRenderedPageId: () => string | null;
  getStage: () => TStage | null;
  assetSources?: readonly string[];
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Test seam; the browser default waits for requestAnimationFrame. */
  nextFrame?: () => Promise<void>;
  /** Test seam; the browser default waits for document.fonts.ready when available. */
  waitForFonts?: () => Promise<void>;
  /** Test seam; the browser default decodes an HTMLImageElement without exposing its URL. */
  preloadImage?: (source: string, signal?: AbortSignal) => Promise<void>;
}

function captureAborted(): StudioCaptureReadinessError {
  return new StudioCaptureReadinessError("aborted", "페이지 캡처 준비가 취소됐어요.");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw captureAborted();
}

function defaultNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => resolve());
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
}

async function defaultWaitForFonts(): Promise<void> {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (fonts) await fonts.ready;
}

function defaultPreloadImage(source: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    if (typeof globalThis.Image !== "function") {
      resolve();
      return;
    }
    const image = new globalThis.Image();
    let settled = false;
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => {
      try {
        image.src = "";
      } catch {
        // Some embedded browsers make HTMLImageElement.src read-only. Rejection is still enough.
      }
      finish(captureAborted());
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error("asset-load"));
    signal?.addEventListener("abort", onAbort, { once: true });
    image.src = source;
    if (image.complete && image.naturalWidth > 0) finish();
  });
}

function uniqueAssetSources(values: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const source = value.trim();
    if (!source || seen.has(source)) continue;
    seen.add(source);
    result.push(source);
  }
  return result;
}

async function preloadAssets(
  sources: readonly string[],
  preloadImage: NonNullable<StudioCaptureReadinessOptions["preloadImage"]>,
  signal?: AbortSignal
): Promise<void> {
  if (sources.length > STUDIO_CAPTURE_READY_MAX_ASSETS) {
    throw new StudioCaptureReadinessError(
      "asset-limit",
      `한 페이지에서 캡처할 이미지가 ${STUDIO_CAPTURE_READY_MAX_ASSETS}개를 초과했어요.`
    );
  }
  let cursor = 0;
  const worker = async () => {
    while (cursor < sources.length) {
      throwIfAborted(signal);
      const index = cursor;
      cursor += 1;
      try {
        await preloadImage(sources[index]!, signal);
      } catch (error) {
        if (signal?.aborted || (error instanceof StudioCaptureReadinessError && error.code === "aborted")) {
          throw captureAborted();
        }
        throw new StudioCaptureReadinessError(
          "asset-load",
          `페이지 이미지 ${index + 1}번을 준비하지 못해 빈 레이어 캡처를 막았어요.`
        );
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(STUDIO_CAPTURE_READY_ASSET_CONCURRENCY, sources.length) },
      () => worker()
    )
  );
}

async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(captureAborted()));
    const timer = globalThis.setTimeout(
      () => finish(() => reject(new StudioCaptureReadinessError(
        "render-timeout",
        "페이지 렌더링 준비 시간이 초과되어 잘못된 페이지 캡처를 막았어요."
      ))),
      timeoutMs
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error))
    );
  });
}

/**
 * Wait until the requested page is committed and stable enough for `stage.toCanvas()`.
 * Callers must update `getRenderedPageId` from a React layout/effect after the Stage commit.
 */
export async function waitForStudioCaptureReady<TStage extends StudioCaptureStageLike>(
  options: StudioCaptureReadinessOptions<TStage>
): Promise<TStage> {
  const pageId = options.pageId.trim();
  if (!pageId) {
    throw new StudioCaptureReadinessError("stale-page", "캡처할 페이지 ID가 비어 있어요.");
  }
  const timeoutMs = Math.max(250, Math.min(30_000, options.timeoutMs ?? STUDIO_CAPTURE_READY_DEFAULT_TIMEOUT_MS));
  const nextFrame = options.nextFrame ?? defaultNextFrame;
  const waitForFonts = options.waitForFonts ?? defaultWaitForFonts;
  const preloadImage = options.preloadImage ?? defaultPreloadImage;
  const sources = uniqueAssetSources(options.assetSources ?? []);

  const work = (async () => {
    throwIfAborted(options.signal);
    while (options.getRenderedPageId() !== pageId || !options.getStage()) {
      await nextFrame();
      throwIfAborted(options.signal);
    }

    await Promise.all([
      waitForFonts(),
      preloadAssets(sources, preloadImage, options.signal),
    ]);

    // Preloading warms the browser cache; React-Konva image components still need paint frames to
    // receive their own onload state and draw the cached bitmap into the Stage.
    await nextFrame();
    await nextFrame();
    throwIfAborted(options.signal);
    if (options.getRenderedPageId() !== pageId) {
      throw new StudioCaptureReadinessError(
        "stale-page",
        "캡처 준비 중 선택 페이지가 바뀌어 내보내기를 중단했어요."
      );
    }
    const stage = options.getStage();
    if (!stage) {
      throw new StudioCaptureReadinessError("stale-page", "캡처할 캔버스를 찾지 못했어요.");
    }
    stage.batchDraw();
    await nextFrame();
    if (options.getRenderedPageId() !== pageId || options.getStage() !== stage) {
      throw new StudioCaptureReadinessError(
        "stale-page",
        "캡처 직전에 페이지가 바뀌어 잘못된 출력 생성을 막았어요."
      );
    }
    return stage;
  })();

  return withTimeout(work, timeoutMs, options.signal);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Collects only render-time raster dependencies; it never serializes or returns unrelated data. */
export function collectStudioCaptureAssetSources(
  ...documents: readonly unknown[]
): string[] {
  const sources: string[] = [];
  for (const document of documents) {
    if (!isRecord(document) || !Array.isArray(document.elements)) continue;
    for (const value of document.elements) {
      if (!isRecord(value)) continue;
      for (const key of ["src", "maskSrc"] as const) {
        const source = value[key];
        if (typeof source === "string" && source.trim()) sources.push(source);
      }
    }
  }
  return uniqueAssetSources(sources);
}
