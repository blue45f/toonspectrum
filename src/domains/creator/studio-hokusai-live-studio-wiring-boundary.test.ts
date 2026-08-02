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
      "if (!displayImg) return null;",
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
    expect(VIEWPORT_SOURCE).toContain("hokusaiLiveOverlayVisibleRef.current");
  });
});
