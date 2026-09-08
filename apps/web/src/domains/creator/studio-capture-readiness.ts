/**
 * Deterministic capture readiness gate for the React-Konva studio.
 *
 * Switching `currentPageId` and sleeping for an arbitrary number of milliseconds can capture the
 * previous page on a busy phone. This module waits for an explicit React commit marker, preloads
 * the target page's raster dependencies, waits for fonts, and gives Konva several paint frames
 * before allowing an export. It deliberately does not inspect or return source URLs in errors:
 * data URLs and signed asset URLs can contain private project material.
 */

import {
  snapshotStudioMountedRasterImagePresentations,
  waitForStudioRasterImagePresentations,
  type StudioRasterImagePresentationIdentity,
} from "./render/studio-raster-image-presentation";

import type { StudioLinked3dPassCasAuthority } from "./studio-linked-3d-pass-transaction";

export const STUDIO_CAPTURE_READY_DEFAULT_TIMEOUT_MS = 8_000;
export const STUDIO_CAPTURE_READY_MAX_ASSETS = 512;
export const STUDIO_CAPTURE_READY_ASSET_CONCURRENCY = 6;

export type StudioCaptureReadinessCode =
  | "aborted"
  | "asset-limit"
  | "asset-load"
  | "pending-ink"
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

export interface StudioCaptureResolvedRasterSource {
  readonly src: string;
  readonly revoke: () => void;
}

export type StudioCaptureLinked3dPassRasterSourceResolver = (
  locator: string,
  authority?: StudioLinked3dPassCasAuthority,
  signal?: AbortSignal,
) => Promise<StudioCaptureResolvedRasterSource | null>;

interface StudioCaptureDocumentPage {
  readonly id: string;
  readonly elements: readonly unknown[];
}

/** The live overlay is not a document raster. The existing flush owns GPU receipts/publication. */
export interface StudioCaptureDocumentReadiness<TPage extends StudioCaptureDocumentPage> {
  readonly drawingRef: { readonly current: unknown };
  readonly drawingPointerTransportRef: { readonly current: { getSession(): unknown } | null };
  readonly pendingStrokeCommitsRef: { readonly current: unknown };
  /** Host wraps the canonical flush in ReactDOM.flushSync, just like manual save. */
  readonly flushPendingStrokes: () => unknown;
  readonly pagesHistoryRef: { readonly current: readonly (readonly TPage[])[] };
  readonly pagesHiRef: { readonly current: number };
  readonly captureCommitRef: {
    readonly current: { readonly pageId: string; readonly historyIndex: number; readonly page: TPage };
  };
  readonly master: unknown;
  /** Metadata consumers receive the same immutable page whose Stage passed the capture fence. */
  readonly onReady?: (page: TPage) => void;
}

export interface StudioCaptureReadinessOptions<
  TStage extends StudioCaptureStageLike = StudioCaptureStageLike,
  TPage extends StudioCaptureDocumentPage = StudioCaptureDocumentPage,
> {
  pageId: string;
  getRenderedPageId: () => string | null;
  getStage: () => TStage | null;
  assetSources?: readonly string[];
  /** Present for current-document exports; historical timelapse snapshots keep their own inputs. */
  document?: StudioCaptureDocumentReadiness<TPage>;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Test seam; the browser default waits for requestAnimationFrame. */
  nextFrame?: () => Promise<void>;
  /** Test seam; the browser default waits for document.fonts.ready when available. */
  waitForFonts?: () => Promise<void>;
  /** Test seam; the browser default decodes an HTMLImageElement without exposing its URL. */
  preloadImage?: (source: string, signal?: AbortSignal) => Promise<void>;
  /** Optional authority injection for deterministic OPFS/CAS capture tests and isolated hosts. */
  linked3dPassAuthority?: StudioLinked3dPassCasAuthority;
  /** Test/host seam; production lazily imports the canonical linked-3D CAS resolver. */
  resolveLinked3dPassRasterSource?: StudioCaptureLinked3dPassRasterSourceResolver;
  /** Exact linked-pass element/source pairs that must complete a concrete Konva layer draw. */
  rasterPresentationIdentities?: readonly StudioRasterImagePresentationIdentity[];
  /** Test seam for the product presentation fence. */
  waitForRasterPresentations?: typeof waitForStudioRasterImagePresentations;
}

function prepareDocumentCapture<TPage extends StudioCaptureDocumentPage>(
  pageId: string,
  document: StudioCaptureDocumentReadiness<TPage>,
) {
  const gestureActive = () => Boolean(
    document.drawingRef.current || document.drawingPointerTransportRef.current?.getSession(),
  );
  const pendingInk = () => new StudioCaptureReadinessError(
    "pending-ink", "마지막 획을 원고에 확정하지 못해 내보내기를 시작하지 않았어요. 획 입력·동기화가 끝난 뒤 다시 시도해 주세요.",
  );
  if (gestureActive()) throw pendingInk();
  if (document.pendingStrokeCommitsRef.current) document.flushPendingStrokes();
  // A flush may retain ink while waiting for an exact terminal GPU receipt or publication access.
  // Its boolean return alone is not proof of a committed document (an active gesture returns true).
  if (gestureActive() || document.pendingStrokeCommitsRef.current) throw pendingInk();
  const history = document.pagesHistoryRef.current;
  const historyIndex = document.pagesHiRef.current;
  const page = history[historyIndex]?.find((candidate) => candidate.id === pageId);
  if (!page) throw new StudioCaptureReadinessError("stale-page", "캡처할 페이지가 현재 원고에 없어요.");
  return {
    sources: collectStudioCaptureAssetSources(page, document.master),
    assertCurrent() {
      if (gestureActive() || document.pendingStrokeCommitsRef.current) throw pendingInk();
      if (document.pagesHistoryRef.current !== history || document.pagesHiRef.current !== historyIndex) {
        throw new StudioCaptureReadinessError("stale-page", "캡처 준비 중 원고가 바뀌어 내보내기를 중단했어요.");
      }
    },
    isRendered() {
      const rendered = document.captureCommitRef.current;
      return rendered.pageId === page.id && rendered.historyIndex === historyIndex
        && rendered.page === page;
    },
    ready() { document.onReady?.(page); },
  };
}

const STUDIO_LINKED_3D_PASS_LOCATOR_NAMESPACE = "studio-opfs-cas:";
const STUDIO_LINKED_3D_PASS_LOCATOR_PATTERN =
  /^studio-opfs-cas:sha256:[a-f0-9]{64}$/u;

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

async function defaultResolveLinked3dPassRasterSource(
  locator: string,
  authority?: StudioLinked3dPassCasAuthority,
  signal?: AbortSignal,
): Promise<StudioCaptureResolvedRasterSource | null> {
  const { acquireStudioRasterSourceLease } = await import("./render/studio-raster-source-lease"
  );
  const lease = await acquireStudioRasterSourceLease(locator, {
    authority,
    consumer: "studio-capture-readiness",
    signal,
  });
  if (lease.kind !== "linked-3d-cas") {
    lease.release();
    return null;
  }
  return Object.freeze({ src: lease.src, revoke: lease.release });
}

function revokeOnce(revoke: () => void): () => void {
  let revoked = false;
  return () => {
    if (revoked) return;
    revoked = true;
    try {
      revoke();
    } catch {
      // A host cleanup failure cannot make an otherwise-settled readiness result non-deterministic.
    }
  };
}

function resolvedRasterLease(
  value: StudioCaptureResolvedRasterSource | null,
): value is StudioCaptureResolvedRasterSource {
  return value !== null
    && typeof value.src === "string"
    && value.src.startsWith("blob:")
    && typeof value.revoke === "function";
}

async function preloadAssetSource(
  source: string,
  preloadImage: NonNullable<StudioCaptureReadinessOptions["preloadImage"]>,
  resolveLinked3dPassRasterSource: StudioCaptureLinked3dPassRasterSourceResolver,
  linked3dPassAuthority: StudioLinked3dPassCasAuthority | undefined,
  signal?: AbortSignal,
): Promise<void> {
  if (!source.startsWith(STUDIO_LINKED_3D_PASS_LOCATOR_NAMESPACE)) {
    await preloadImage(source, signal);
    return;
  }
  if (!STUDIO_LINKED_3D_PASS_LOCATOR_PATTERN.test(source)) {
    throw new Error("invalid-linked-3d-pass-locator");
  }

  throwIfAborted(signal);
  const resolved = await resolveLinked3dPassRasterSource(
    source,
    linked3dPassAuthority,
    signal,
  );
  const release = resolved && typeof resolved.revoke === "function"
    ? revokeOnce(resolved.revoke)
    : () => undefined;
  const releaseOnAbort = () => release();
  signal?.addEventListener("abort", releaseOnAbort, { once: true });
  try {
    throwIfAborted(signal);
    if (!resolvedRasterLease(resolved)) {
      throw new Error("invalid-linked-3d-pass-raster-lease");
    }
    await preloadImage(resolved.src, signal);
  } finally {
    signal?.removeEventListener("abort", releaseOnAbort);
    release();
  }
}

async function preloadAssets(
  sources: readonly string[],
  preloadImage: NonNullable<StudioCaptureReadinessOptions["preloadImage"]>,
  resolveLinked3dPassRasterSource: StudioCaptureLinked3dPassRasterSourceResolver,
  linked3dPassAuthority: StudioLinked3dPassCasAuthority | undefined,
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
        await preloadAssetSource(
          sources[index]!,
          preloadImage,
          resolveLinked3dPassRasterSource,
          linked3dPassAuthority,
          signal,
        );
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
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  if (signal?.aborted) return Promise.reject(captureAborted());
  return new Promise<T>((resolve, reject) => {
    const operationController = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
    const abortOperation = (reason: unknown) => {
      if (!operationController.signal.aborted) operationController.abort(reason);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== null) globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => {
      const error = captureAborted();
      abortOperation(error);
      finish(() => reject(error));
    };
    timer = globalThis.setTimeout(
      () => {
        const error = new StudioCaptureReadinessError(
          "render-timeout",
          "페이지 렌더링 준비 시간이 초과되어 잘못된 페이지 캡처를 막았어요."
        );
        abortOperation(error);
        finish(() => reject(error));
      },
      timeoutMs
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve().then(() => {
      throwIfAborted(operationController.signal);
      return work(operationController.signal);
    }).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => {
        abortOperation(error);
        finish(() => reject(error));
      }
    );
  });
}

/**
 * Wait until the requested page is committed and stable enough for `stage.toCanvas()`.
 * Callers must update `getRenderedPageId` from a React layout/effect after the Stage commit.
 */
export async function waitForStudioCaptureReady<
  TStage extends StudioCaptureStageLike,
  TPage extends StudioCaptureDocumentPage,
>(
  options: StudioCaptureReadinessOptions<TStage, TPage>
): Promise<TStage> {
  const pageId = options.pageId.trim();
  if (!pageId) {
    throw new StudioCaptureReadinessError("stale-page", "캡처할 페이지 ID가 비어 있어요.");
  }
  const timeoutMs = Math.max(250, Math.min(30_000, options.timeoutMs ?? STUDIO_CAPTURE_READY_DEFAULT_TIMEOUT_MS));
  const nextFrame = options.nextFrame ?? defaultNextFrame;
  const waitForFonts = options.waitForFonts ?? defaultWaitForFonts;
  const preloadImage = options.preloadImage ?? defaultPreloadImage;
  const resolveLinked3dPassRasterSource =
    options.resolveLinked3dPassRasterSource
    ?? defaultResolveLinked3dPassRasterSource;
  const waitForRasterPresentations = options.waitForRasterPresentations
    ?? waitForStudioRasterImagePresentations;

  return withTimeout(async (operationSignal) => {
    throwIfAborted(operationSignal);
    const document = options.document ? prepareDocumentCapture(pageId, options.document) : undefined;
    const sources = document?.sources ?? uniqueAssetSources(options.assetSources ?? []);
    const assertCurrent = () => {
      throwIfAborted(operationSignal);
      document?.assertCurrent();
    };
    assertCurrent();
    while (options.getRenderedPageId() !== pageId || !options.getStage() || document?.isRendered() === false) {
      await nextFrame();
      assertCurrent();
    }

    await Promise.all([
      waitForFonts(),
      preloadAssets(
        sources,
        preloadImage,
        resolveLinked3dPassRasterSource,
        options.linked3dPassAuthority,
        operationSignal,
      ),
    ]);

    // Preloading warms the browser cache; React-Konva image components still need paint frames to
    // receive their own onload state and draw the cached bitmap into the Stage.
    await nextFrame();
    await nextFrame();
    assertCurrent();
    if (options.getRenderedPageId() !== pageId || document?.isRendered() === false) {
      throw new StudioCaptureReadinessError(
        "stale-page",
        "캡처 준비 중 선택 페이지가 바뀌어 내보내기를 중단했어요."
      );
    }
    const stage = options.getStage();
    if (!stage) {
      throw new StudioCaptureReadinessError("stale-page", "캡처할 캔버스를 찾지 못했어요.");
    }
    const rasterPresentationIdentities = options.rasterPresentationIdentities
      ?? snapshotStudioMountedRasterImagePresentations();
    await waitForRasterPresentations(
      rasterPresentationIdentities,
      () => stage.batchDraw(),
      operationSignal,
    );
    await nextFrame();
    assertCurrent();
    if (options.getRenderedPageId() !== pageId || options.getStage() !== stage || document?.isRendered() === false) {
      throw new StudioCaptureReadinessError(
        "stale-page",
        "캡처 직전에 페이지가 바뀌어 잘못된 출력 생성을 막았어요."
      );
    }
    document?.ready();
    return stage;
  }, timeoutMs, options.signal);
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
