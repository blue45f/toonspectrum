import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const PAGE_SOURCE = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const VIEWPORT_SOURCE = readFileSync(
  new URL("./StudioCanvasViewport.tsx", import.meta.url),
  "utf8",
);
const IMAGE_NODE_SOURCE = readFileSync(
  new URL("./StudioKonvaImageNode.tsx", import.meta.url),
  "utf8",
);

function sourceSection(
  source: string,
  start: string,
  end: string,
): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Missing source boundary: ${start} -> ${end}`);
  }
  return source.slice(startIndex, endIndex);
}

describe("Studio Hokusai live UI authority wiring", () => {
  it("releases the live overlay only after the exact decoded canonical PNG is drawn", () => {
    const imageReceipt = sourceSection(
      IMAGE_NODE_SOURCE,
      "const hokusaiPngHash = el.hokusaiLiveReceipt?.canonical.pngHash;",
      "const livingInkPngHash = el.livingInkReceipt?.canonicalPngSha256;",
    );
    expect(imageReceipt.indexOf("layer.drawScene();")).toBeGreaterThan(0);
    expect(imageReceipt.indexOf("onHokusaiCanonicalImageReady(el.id, hokusaiPngHash);"))
      .toBeGreaterThan(imageReceipt.indexOf("layer.drawScene();"));

    const pageReceipt = sourceSection(
      PAGE_SOURCE,
      "function onHokusaiCanonicalImageReady(",
      "function discardStudioHokusaiLiveStroke(",
    );
    expect(pageReceipt).toContain("!state.transactionCommitted");
    expect(pageReceipt).toContain("state.canonicalImageId !== elementId");
    expect(pageReceipt).toContain("state.canonicalPngHash !== pngHash");
    expect(pageReceipt).toContain("releaseStudioHokusaiLivePresentation(state);");

    const finish = sourceSection(
      PAGE_SOURCE,
      "async function finishStudioHokusaiLiveStroke(",
      "function finishDrawingPointer(",
    );
    expect(finish).toContain("state.transactionCommitted = true;");
    expect(finish).not.toContain("globalThis.requestAnimationFrame(");
    expect(PAGE_SOURCE).not.toContain("settleStudioHokusaiOverlayAfterCommit");
  });

  it("never paints an old-page fallback shadow onto the newly active page", () => {
    const shadow = sourceSection(
      PAGE_SOURCE,
      "function showStudioHokusaiVectorShadow(",
      "function failStudioHokusaiLiveStroke(",
    );
    expect(shadow).toContain("if (pageId !== currentPageIdRef.current) return;");
    expect(PAGE_SOURCE).toContain(
      "showStudioHokusaiVectorShadow(state.finalDrawing, state.pageId);",
    );

    const surface = sourceSection(
      PAGE_SOURCE,
      "function setHokusaiLiveOverlaySurface(",
      "function appendStudioHokusaiAuthoritativeSuffix(",
    );
    expect(surface).toContain("if (active.transactionCommitted)");
    expect(surface).toContain("releaseStudioHokusaiLivePresentation(active);");
  });

  it("keeps the exact vector visible until the first material frame owns presentation", () => {
    const shadowLifecycle = sourceSection(
      PAGE_SOURCE,
      "function clearStudioHokusaiVectorShadow(",
      "function failStudioHokusaiLiveStroke(",
    );
    expect(shadowLifecycle).toContain(
      "if (liveDraftVisualRef.current?.id === state.strokeId)",
    );
    expect(shadowLifecycle).toContain("liveDraftVisualRef.current = null;");
    expect(shadowLifecycle).toContain("liveDraftPendingRef.current = null;");
    expect(shadowLifecycle).toContain("liveDraftDirectRef.current = false;");
    expect(shadowLifecycle).toContain(
      "draftPreviewStoreRef.current.getSnapshot().active?.id === state.strokeId",
    );
    expect(shadowLifecycle).toContain("draftPreviewStoreRef.current.setActive(null);");
    expect(shadowLifecycle).toContain("liveDraftDirectRef.current = true;");
    expect(shadowLifecycle).toContain("liveDraftLayerRef.current?.drawScene();");

    const firstFrame = sourceSection(
      PAGE_SOURCE,
      "if (!state.overlayPresented) {",
      "      },\n    });",
    );
    expect(firstFrame.indexOf("hokusaiLiveOverlayVisibleRef.current = true;"))
      .toBeLessThan(firstFrame.indexOf("clearStudioHokusaiVectorShadow(state);"));

    const releaseCleanup = sourceSection(
      PAGE_SOURCE,
      "clearDraftPreview({ preserveInkForDeferredCommit: deferInkCleanup });",
      "// Re-rasterize the newest settled overlay stroke",
    );
    expect(releaseCleanup).toContain("finishingHokusai?.finishing");
    expect(releaseCleanup).toContain("!finishingHokusai.overlayPresented");
    expect(releaseCleanup).toContain("finishingHokusai.finalDrawing");
    expect(releaseCleanup).toContain("showStudioHokusaiVectorShadow(");
    expect(releaseCleanup).toContain("finishingHokusai.finalDrawing");
    expect(releaseCleanup).toContain("finishingHokusai.pageId");

    const directDraft = sourceSection(
      VIEWPORT_SOURCE,
      "const el = liveDraftVisualRef.current;",
      "drawLiveFreehandDraftToContext(context, el);",
    );
    expect(directDraft).not.toContain("hokusaiLiveOverlayVisibleRef.current");

    const scheduleDraft = sourceSection(
      PAGE_SOURCE,
      "const scheduleDraft = (next: DrawEl | null) => {",
      "const clearDraftPreview =",
    );
    expect(scheduleDraft).toContain("const hokusaiStroke = hokusaiLiveStrokeRef.current;");
    expect(scheduleDraft).toContain("hokusaiStroke.strokeId === next.id");
    expect(scheduleDraft.indexOf("hokusaiStroke.strokeId === next.id"))
      .toBeLessThan(scheduleDraft.indexOf("pendingDraftRef.current = next;"));
    expect(scheduleDraft).toContain("liveDraftPendingRef.current = next;");

    const directFlush = sourceSection(
      PAGE_SOURCE,
      "const flushDirectLiveDraft = () => {",
      "const flushDirectLiveDraftNow =",
    );
    expect(directFlush).toContain("hokusaiStroke.strokeId === next.id");
    expect(directFlush).toContain("if (hokusaiStroke.overlayPresented)");
    expect(directFlush).toContain(
      "refreshStudioHokusaiVectorTailShadow(hokusaiStroke, next);",
    );

    const tailShadow = sourceSection(
      PAGE_SOURCE,
      "function studioHokusaiVectorTailShadow(",
      "function showStudioHokusaiVectorShadow(",
    );
    expect(tailShadow).toContain("state.materialCompositeBounds");
    expect(tailShadow).toContain("presentedSampleCount - 1");
    expect(tailShadow).toContain("points: element.points.slice(start * 2)");
    expect(tailShadow).toContain("(element.opacity ?? 1) * 0.6");
    expect(tailShadow).toContain("liveDraftVisualRef.current = tail;");

    const specialistRelease = sourceSection(
      PAGE_SOURCE,
      "function finishStudioSpecialistStroke(",
      "function finishDrawingPointer(",
    );
    expect(specialistRelease).not.toContain("materialPresentationCaughtUp");
    expect(specialistRelease).toContain("void finishStudioHokusaiLiveStroke(hokusaiStroke, finished);");
    expect(specialistRelease).toContain("session.finish()");
  });

  it("keeps automatic canonical materialization in drawing chrome", () => {
    const finish = sourceSection(
      PAGE_SOURCE,
      "async function finishStudioHokusaiLiveStroke(",
      "function finishDrawingPointer(",
    );
    expect(finish).toContain("setSelectedId(null);");
    expect(finish).not.toContain("setSelectedId(transaction.transaction.selectionId);");
  });

  it("keeps prediction samples out of Hokusai and makes cancel/unmount fail closed", () => {
    const publish = sourceSection(
      PAGE_SOURCE,
      "function publishAuthoritativeFreehandSuffix(",
      "drawingFixedRatePumpFrameRef.current =",
    );
    expect(publish).toContain(
      "appendStudioHokusaiAuthoritativeSuffix(authoritativeDrawing, startSample);",
    );

    const predicted = sourceSection(
      PAGE_SOURCE,
      "drawingPredictionPreviewRef.current = true;",
      "drawingPredictionPreviewRef.current = false;",
    );
    expect(predicted).not.toContain("appendStudioHokusaiAuthoritativeSuffix");

    const finish = sourceSection(
      PAGE_SOURCE,
      "async function finishStudioHokusaiLiveStroke(",
      "function finishDrawingPointer(",
    );
    expect(finish).toContain(
      "state.abortController.signal.aborted && hokusaiLiveStrokeRef.current !== state",
    );
    expect(PAGE_SOURCE).toContain("discardStudioHokusaiLiveStroke(discardedId);");
    expect(PAGE_SOURCE).toContain("if (hasActiveDrawingPointerSession()) discardDrawingPointerSession();");
  });

  it("owns a DPR-correct overlay surface and wires its canonical receipt through the viewport", () => {
    expect(VIEWPORT_SOURCE).toContain("data-studio-hokusai-live-overlay");
    expect(VIEWPORT_SOURCE).toContain("Math.min(4, globalThis.devicePixelRatio || 1)");
    expect(VIEWPORT_SOURCE).toContain(
      "onHokusaiCanonicalImageReady={onHokusaiCanonicalImageReady}",
    );
    expect(PAGE_SOURCE).toContain("const hokusaiLiveOverlayVisibleRef = useRef(false);");
  });
});
