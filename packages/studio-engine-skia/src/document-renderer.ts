import { SKIA_DOCUMENT_MAX_BACKING_DIMENSION, SKIA_DOCUMENT_MAX_BACKING_PIXELS } from "./document-contract";
import { renderSceneNodesToCanvas } from "./render";

import type { SkiaDocumentInk, SkiaDocumentItem, SkiaDocumentFrame, SkiaDocumentReceipt, SkiaDocumentRenderer } from "./document-contract";
import type { Canvas, CanvasKit, GrDirectContext, Image, SkPicture, Surface, WebGLContextHandle } from "canvaskit-wasm";

export const SKIA_DOCUMENT_PICTURE_BATCH_SIZE = 128;

export const SKIA_DOCUMENT_RENDERER_ID = "skia-canvaskit-document-webgl2" as const;
export type { SkiaDocumentInk, SkiaDocumentItem, SkiaDocumentFrame, SkiaDocumentStats, SkiaDocumentReceipt, SkiaDocumentRenderer } from "./document-contract";
export interface SkiaDocumentRendererOptions {
  readonly loadCanvasKit?: () => Promise<CanvasKit>;
  readonly maxPictureBytes?: number;
  readonly onContextLost?: () => void;
}
async function loadCanvasKit(): Promise<CanvasKit> {
  const { loadCanvasKitDocumentRuntime } = await import("./document-loader");
  return loadCanvasKitDocumentRuntime();
}

function drawInk(ck: CanvasKit, canvas: Canvas, ink: SkiaDocumentInk): void {
  const paint = new ck.Paint();
  const builder = new ck.PathBuilder();
  const footprint = new ck.PathBuilder();
  try {
    paint.setAntiAlias(true);
    paint.setColorComponents(ink.color.r, ink.color.g, ink.color.b, ink.color.a * ink.opacity);
    paint.setBlendMode(ink.erase ? ck.BlendMode.DstOut : ck.BlendMode.SrcOver);
    footprint.addOval([-1, -(ink.nib?.aspect ?? 1), 1, ink.nib?.aspect ?? 1]);
    const unit = footprint.detach();
    try {
      const angle = ink.nib?.angleRad ?? 0;
      const c = Math.cos(angle); const s = Math.sin(angle);
      for (let i = 0; i < ink.dabs.length; i += 3) {
        const x = ink.dabs[i]!; const y = ink.dabs[i + 1]!; const radius = ink.dabs[i + 2]!;
        builder.addPath(unit, [radius * c, -radius * s, x, radius * s, radius * c, y, 0, 0, 1]);
        if (!ink.union) {
          const path = builder.detach();
          try { canvas.drawPath(path, paint); } finally { path.delete(); }
        }
      }
      if (ink.union) {
        const path = builder.detach();
        try { canvas.drawPath(path, paint); } finally { path.delete(); }
      }
    } finally { unit.delete(); }
  } finally { footprint.delete(); builder.delete(); paint.delete(); }
}

function validateFrame(frame: SkiaDocumentFrame): void {
  const dimensions = [frame.width, frame.height, frame.documentWidth, frame.documentHeight, frame.dpr];
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0)
    || frame.width * frame.dpr > SKIA_DOCUMENT_MAX_BACKING_DIMENSION || frame.height * frame.dpr > SKIA_DOCUMENT_MAX_BACKING_DIMENSION
    || Math.ceil(frame.width * frame.dpr) * Math.ceil(frame.height * frame.dpr) > SKIA_DOCUMENT_MAX_BACKING_PIXELS
    || frame.items.length > 50_000 || Object.values(frame.camera).some((value) => !Number.isFinite(value))
    || frame.camera.scaleX === 0 || frame.camera.scaleY === 0) throw new Error("Invalid or over-budget GPU document frame");
  const ids = new Set<string>();
  for (const item of frame.items) {
    if (!item.id || ids.has(item.id) || !item.revision || (!!item.nodes === !!item.ink)) throw new Error("Invalid GPU document item");
    ids.add(item.id);
    if (item.ink && (item.ink.dabs.length % 3 || item.ink.dabs.length > 300_000
      || !Number.isFinite(item.ink.opacity) || item.ink.opacity < 0 || item.ink.opacity > 1
      || Object.values(item.ink.color).some((value) => !Number.isFinite(value) || value < 0 || value > 1)
      || (item.ink.nib && (!(item.ink.nib.aspect > 0) || !Number.isFinite(item.ink.nib.aspect) || !Number.isFinite(item.ink.nib.angleRad))))) {
      throw new Error("Invalid GPU ink contract");
    }
  }
}

/** One direct GPU surface, immutable picture cache and a bounded latest-frame queue. */
export function createSkiaDocumentRenderer(canvas: HTMLCanvasElement,
  options: SkiaDocumentRendererOptions = {}): SkiaDocumentRenderer {
  const budget = options.maxPictureBytes ?? 128 * 1024 * 1024;
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error("Invalid picture memory budget");
  const cache = new Map<string, { revision: object; picture: SkPicture; bytes: number }>();
  let ck: CanvasKit | null = null; let gl: WebGLContextHandle | null = null;
  let context: GrDirectContext | null = null; let surface: Surface | null = null;
  let surfaceWidth = 0; let surfaceHeight = 0;
  let documentShape = "";
  type PictureBatch = { items: readonly SkiaDocumentItem[]; picture: SkPicture; bytes: number };
  let frameBatches: PictureBatch[] = [];
  let previousItems: readonly SkiaDocumentItem[] = [];
  let presentedItems: readonly SkiaDocumentItem[] = [];
  let presentedLayout: string | null = null;
  type SnapshotKey = { readonly id: string; readonly token: number };
  const itemTokens = new WeakMap<object, number>(); let nextToken = 0;
  const keysFor = (items: readonly SkiaDocumentItem[]): SnapshotKey[] => items.map((item) => {
    let token = itemTokens.get(item.revision);
    if (token === undefined) { token = ++nextToken; itemTokens.set(item.revision, token); }
    return { id: item.id, token };
  });
  const snapshotMatches = (keys: readonly SnapshotKey[], items: readonly SkiaDocumentItem[]) => keys.length === items.length
    && keys.every((key, index) => key.id === items[index]?.id && key.token === itemTokens.get(items[index]!.revision));
  // Snapshot descriptors must not retain previous raw point arrays or compiled dab buffers.
  const snapshots: Array<{ layout: string; keys: readonly SnapshotKey[]; image: Image; bytes: number }> = [];
  const sameItems = (a: readonly SkiaDocumentItem[], b: readonly SkiaDocumentItem[]) => a.length === b.length
    && a.every((item, index) => item.id === b[index]?.id && item.revision === b[index]?.revision);
  const clearSnapshots = () => { for (const snapshot of snapshots) safeDelete(snapshot.image); snapshots.length = 0; };
  let disposed = false; let failure: string | null = null; let running = false;
  type Pending = { frame: SkiaDocumentFrame; resolve: (receipt: SkiaDocumentReceipt) => void };
  let pending: Pending | null = null;
  const safeDelete = (value: { delete(): void } | null) => { try { value?.delete(); } catch { /* lost context */ } };
  const clearPictures = () => {
    for (const batch of frameBatches) safeDelete(batch.picture);
    frameBatches = [];
    for (const entry of cache.values()) safeDelete(entry.picture);
    cache.clear(); previousItems = [];
  };
  // Failure is terminal: release resources even while recovery UI stays mounted.
  // Subsequent dispose and device-loss callbacks are intentionally idempotent.
  const releaseGpuResources = () => {
    clearSnapshots(); clearPictures(); presentedItems = []; presentedLayout = null;
    safeDelete(surface); surface = null; surfaceWidth = 0; surfaceHeight = 0;
    try { context?.releaseResourcesAndAbandonContext(); } catch { /* lost context */ }
    safeDelete(context); context = null;
    if (ck && gl !== null && gl > 0) { try { ck.deleteContext(gl); } catch { /* lost context */ } }
    gl = null;
  };
  const lost = (event: Event) => {
    event.preventDefault();
    if (disposed || failure) return;
    failure = "CanvasKit GPU context lost; explicit renderer recovery is required";
    canvas.style.visibility = "hidden";
    try { options.onContextLost?.(); } catch { /* Observer errors never defeat device-loss fencing. */ }
    // Let any active native draw stack unwind before releasing its handles.
    queueMicrotask(releaseGpuResources);
  };
  canvas.addEventListener("webglcontextlost", lost);

  function configure(frame: SkiaDocumentFrame): void {
    if (!ck) throw new Error("CanvasKit is not ready");
    const width = Math.ceil(frame.width * frame.dpr); const height = Math.ceil(frame.height * frame.dpr);
    if (surface && canvas.width === width && canvas.height === height && surfaceWidth === width && surfaceHeight === height) return;
    clearSnapshots();
    safeDelete(surface); surface = null;
    canvas.width = width; canvas.height = height;
    if (gl === null) {
      gl = ck.GetWebGLContext(canvas, { majorVersion: 2, alpha: 1, antialias: 0, depth: 0, stencil: 8, premultipliedAlpha: 1, preserveDrawingBuffer: 1 });
      if (!(gl > 0)) throw new Error("WebGL2 is required; software fallback is disabled");
      context = ck.MakeWebGLContext(gl);
      if (!context) throw new Error("CanvasKit GPU context creation failed");
      context.setResourceCacheLimitBytes(64 * 1024 * 1024);
    }
    surface = ck.MakeOnScreenGLSurface(context!, width, height, ck.ColorSpace.SRGB);
    if (!surface) throw new Error("CanvasKit GPU surface creation failed");
    surfaceWidth = width; surfaceHeight = height;
  }
  function compile(frame: SkiaDocumentFrame): { items: number; batches: number } {
    const shape = `${frame.documentWidth}:${frame.documentHeight}`;
    if (documentShape !== shape) { clearPictures(); documentShape = shape; }
    const same = frame.items.length === previousItems.length && frame.items.every((item, index) =>
      item.id === previousItems[index]?.id && item.revision === previousItems[index]?.revision);
    if (same) return { items: 0, batches: 0 };
    const next = new Map<string, { revision: object; picture: SkPicture; bytes: number }>();
    const allocated: SkPicture[] = []; let compiled = 0; let bytes = 0;
    const bounds = [0, 0, frame.documentWidth, frame.documentHeight];
    try {
      for (const item of frame.items) {
        let entry = cache.get(item.id);
        if (!entry || entry.revision !== item.revision) {
          const recorder = new ck!.PictureRecorder();
          try {
            const target = recorder.beginRecording(bounds, true);
            if (item.ink) {
              for (let i = 0; i < item.ink.dabs.length; i++) {
                if (!Number.isFinite(item.ink.dabs[i]) || (i % 3 === 2 && item.ink.dabs[i]! <= 0)) throw new Error("Invalid GPU dab geometry");
              }
              drawInk(ck!, target, item.ink);
            } else renderSceneNodesToCanvas(ck!, target, item.nodes!, {});
            const picture = recorder.finishRecordingAsPicture(); allocated.push(picture);
            entry = { revision: item.revision, picture, bytes: picture.approximateBytesUsed() }; compiled++;
          } finally { recorder.delete(); }
        }
        bytes += entry.bytes;
        if (bytes > budget) throw new Error("GPU document picture budget exceeded; original document preserved");
        next.set(item.id, entry);
      }
      // Append changes only its bounded composite batch, not one document-wide picture.
      const batches: PictureBatch[] = [];
      let compiledBatches = 0;
      for (let offset = 0; offset < frame.items.length; offset += SKIA_DOCUMENT_PICTURE_BATCH_SIZE) {
        const items = frame.items.slice(offset, offset + SKIA_DOCUMENT_PICTURE_BATCH_SIZE);
        const previous = frameBatches[batches.length];
        let batch = previous;
        if (!batch || !sameItems(items, batch.items)) {
          const recorder = new ck!.PictureRecorder();
          try {
            const target = recorder.beginRecording(bounds, true);
            for (const item of items) target.drawPicture(next.get(item.id)!.picture);
            const picture = recorder.finishRecordingAsPicture(); allocated.push(picture);
            batch = { items, picture, bytes: picture.approximateBytesUsed() }; compiledBatches++;
          } finally { recorder.delete(); }
        }
        bytes += batch.bytes;
        if (bytes > budget) throw new Error("GPU document composite budget exceeded");
        batches.push(batch);
      }
      for (let index = 0; index < frameBatches.length; index++) {
        if (batches[index] !== frameBatches[index]) safeDelete(frameBatches[index]!.picture);
      }
      frameBatches = batches;
      for (const [id, old] of cache) if (next.get(id) !== old) safeDelete(old.picture);
      cache.clear(); for (const [id, value] of next) cache.set(id, value);
      previousItems = [...frame.items]; return { items: compiled, batches: compiledBatches };
    } catch (cause) {
      for (const picture of allocated) safeDelete(picture);
      throw cause;
    }
  }
  function draw(frame: SkiaDocumentFrame): SkiaDocumentReceipt {
    const started = performance.now(); validateFrame(frame);
    const layout = JSON.stringify([frame.width, frame.height, frame.dpr, frame.documentWidth, frame.documentHeight, frame.camera]);
    const backingValid = surface !== null && canvas.width === surfaceWidth && canvas.height === surfaceHeight;
    const unchanged = backingValid && presentedLayout === layout && sameItems(presentedItems, frame.items);
    const appended = backingValid && presentedLayout === layout && frame.items.length > presentedItems.length
      && presentedItems.every((item, index) => item.id === frame.items[index]?.id && item.revision === frame.items[index]?.revision);
    const canRestoreSnapshot = backingValid && surfaceWidth === Math.ceil(frame.width * frame.dpr)
      && surfaceHeight === Math.ceil(frame.height * frame.dpr);
    const restoreIndex = canRestoreSnapshot ? snapshots.findIndex((snapshot) => snapshot.layout === layout && snapshotMatches(snapshot.keys, frame.items)) : -1;
    const restore = restoreIndex < 0 ? undefined : snapshots.splice(restoreIndex, 1)[0];
    try {
    const snapshotBytes = canvas.width * canvas.height * 4;
    if (!unchanged && backingValid && surface && presentedLayout && snapshotBytes <= 16 * 1024 * 1024) {
      const image = surface.makeImageSnapshot();
      snapshots.push({ layout: presentedLayout, keys: keysFor(presentedItems), image, bytes: snapshotBytes });
      while (snapshots.length > 3 || snapshots.reduce((sum, item) => sum + item.bytes, 0) > 32 * 1024 * 1024) {
        const expired = snapshots.shift()!; safeDelete(expired.image);
      }
    }
    configure(frame);
    const compiled = unchanged ? { items: 0, batches: 0 } : compile(frame);
    let paintedItems = 0;
    let presentation: "cached" | "append" | "restored" | "full" = "cached";
    const target = surface!.getCanvas();
    if (!unchanged) {
      if (restore) {
        target.clear(ck!.TRANSPARENT); target.drawImage(restore.image, 0, 0);
        presentation = "restored";
      } else {
        if (!appended) target.clear(ck!.TRANSPARENT);
        presentation = appended ? "append" : "full";
        target.save();
        try {
          target.scale(frame.dpr, frame.dpr); target.translate(frame.camera.offsetX, frame.camera.offsetY);
          target.rotate(frame.camera.rotation, 0, 0); target.scale(frame.camera.scaleX, frame.camera.scaleY);
          target.clipRect([0, 0, frame.documentWidth, frame.documentHeight], ck!.ClipOp.Intersect, false);
          if (appended) {
            for (let i = presentedItems.length; i < frame.items.length; i++) target.drawPicture(cache.get(frame.items[i]!.id)!.picture);
            paintedItems = frame.items.length - presentedItems.length;
          } else { for (const batch of frameBatches) target.drawPicture(batch.picture); paintedItems = frame.items.length; }
        } finally { target.restore(); }
      }
      surface!.flush();
      if (failure) throw new Error(failure);
      presentedItems = [...frame.items]; presentedLayout = layout;
    }
    const gpuBytes = context!.getResourceCacheUsageBytes();
    return { status: "presented", revision: frame.revision, stats: {
      compiledItems: compiled.items, compiledBatches: compiled.batches, cachedBatches: frameBatches.length,
      cachedItems: cache.size, paintedItems, presentation,
      pictureBytes: [...cache.values()].reduce((sum, item) => sum + item.bytes, frameBatches.reduce((sum, batch) => sum + batch.bytes, 0)),
      retainedSnapshotBytes: snapshots.reduce((sum, item) => sum + item.bytes, 0),
      gpuCacheBytes: Number.isFinite(gpuBytes) ? gpuBytes : null,
      frameMs: performance.now() - started, interactiveReadbacks: 0,
    } };
    } finally { if (restore) safeDelete(restore.image); }
  }
  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
      if (!ck) ck = await (options.loadCanvasKit ?? loadCanvasKit)();
      while (pending) {
        const work = pending; pending = null;
        if (disposed) { work.resolve({ status: "disposed", revision: work.frame.revision }); continue; }
        try {
          if (failure) throw new Error(failure);
          work.resolve(draw(work.frame));
        } catch (cause) {
          failure = cause instanceof Error ? cause.message : String(cause);
          canvas.style.visibility = "hidden";
          releaseGpuResources();
          work.resolve({ status: "unavailable", revision: work.frame.revision, reason: failure });
        }
      }
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : String(cause);
      if (pending) { const work = pending; pending = null; work.resolve({ status: "unavailable", revision: work.frame.revision, reason: failure }); }
    } finally { running = false; }
  }
  return {
    present(frame) {
      if (disposed) return Promise.resolve({ status: "disposed", revision: frame.revision });
      if (failure) return Promise.resolve({ status: "unavailable", revision: frame.revision, reason: failure });
      if (pending) pending.resolve({ status: "superseded", revision: pending.frame.revision });
      return new Promise((resolve) => {
        pending = { frame, resolve };
        void drain();
      });
    },
    dispose() {
      if (disposed) return; disposed = true;
      if (pending) { const work = pending; pending = null; work.resolve({ status: "disposed", revision: work.frame.revision }); }
      canvas.removeEventListener("webglcontextlost", lost);
      releaseGpuResources();
    },
  };
}
