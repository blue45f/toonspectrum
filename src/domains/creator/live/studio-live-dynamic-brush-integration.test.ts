import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioCanvasViewportStack } from "../canvas/read-studio-canvas-viewport-stack";



function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Studio live dynamic brush integration boundary", () => {
  it("arms the suffix renderer at pointer-down and routes pointer frames through appendFrom", () => {
    const page = source("../StudioPage.tsx");
    const pointerStart = page.slice(
      page.indexOf("const dynamicBrushDirect ="),
      page.indexOf("const predictionTailEligible =", page.indexOf("const dynamicBrushDirect =")),
    );
    expect(pointerStart).toContain(
      "liveDynamicBrushOverlayRendererRef.current.begin(next).status === \"started\"",
    );
    expect(pointerStart).toContain("dynamicAdmitted: dynamicBrushDirect");
    expect(pointerStart).toContain(
      'liveDynamicBrushDraftDirectRef.current = strokeSurfaceRoute.kind === "dynamic"',
    );
    expect(pointerStart).toContain(
      "if (stampDirect || dynamicBrushDirect || wetInkOverlayStarted || retainedMediaDirect)",
    );
    expect(pointerStart).toContain("liveDraftLayerRef.current?.drawScene()");

    const flush = page.slice(
      page.indexOf("const flushDirectLiveDraft ="),
      page.indexOf("const flushDirectLiveDraftNow"),
    );
    expect(flush).toContain("renderer.appendFrom(next)");
    expect(flush).toContain("draftPreviewStoreRef.current.setActive(next)");
    expect(flush).toContain("draftPreviewDynamicLayerRef.current?.drawScene()");
  });

  it("seals exact material on the overlay until the committed-draw receipt", () => {
    const page = source("../StudioPage.tsx");
    const clear = page.slice(
      page.indexOf("const clearDraftPreview ="),
      page.indexOf("const DEFERRED_STROKE_COMMIT_IDLE_MS"),
    );
    const dynamicStart = clear.indexOf("if (wasDynamicBrushDirect)");
    const dynamic = clear.slice(
      dynamicStart,
      clear.indexOf("if (wasRetainedMediaDirect)", dynamicStart),
    );
    const seal = dynamic.indexOf("renderer.end(finalDynamicBrushStroke)");
    expect(seal).toBeGreaterThan(0);
    expect(dynamic).not.toContain("draftPreviewStoreRef.current.settle(finalDynamicBrushStroke)");
    expect(dynamic).not.toContain("renderer.releaseSettledPrefix(1)");
  });

  it("seals stamp overlay pixels before the draft FIFO so pointer-up cannot blank the stroke", () => {
    const page = source("../StudioPage.tsx");
    const clear = page.slice(
      page.indexOf("const clearDraftPreview ="),
      page.indexOf("const DEFERRED_STROKE_COMMIT_IDLE_MS"),
    );
    const stamp = clear.slice(clear.indexOf("if (wasStampDirect)"));
    const end = stamp.indexOf("renderer.end()");
    const settle = stamp.indexOf(
      "draftPreviewStoreRef.current.settle(finalStampStroke)",
    );
    const flushReceipt = stamp.lastIndexOf("flushSync(() => {", settle);
    const release = stamp.indexOf("renderer.releaseSettledPrefix(1)");
    expect(end).toBeGreaterThan(-1);
    expect(flushReceipt).toBeGreaterThan(end);
    expect(settle).toBeGreaterThan(flushReceipt);
    expect(release).toBeGreaterThan(settle);
    const flush = page.slice(
      page.indexOf("flushPendingStrokeCommitsRef.current = () => {"),
      page.indexOf("discardPendingStrokeCommitsRef.current = () => {"),
    );
    const commit = flush.indexOf(
      "committed = commit([...baseElements, ...batch.strokes]",
    );
    expect(commit).toBeGreaterThan(-1);
    expect(flush.slice(0, commit)).not.toContain("suppressSettledPrefix(");
  });

  it("mounts both active and settled native-density canvases through Viewport", () => {
    const hosts = source("./StudioLiveInkHosts.tsx");
    const viewport = readStudioCanvasViewportStack(import.meta.url, "../canvas/");
    const lazyUi = source("../studio-page-lazy-ui.ts");
    expect(hosts).toContain('data-studio-live-dynamic-active="true"');
    expect(hosts).toContain('data-studio-live-dynamic-settled="true"');
    expect(hosts).toContain("renderer.attach({");
    expect(viewport).toContain("<StudioLiveDynamicBrushOverlayHost");
    expect(viewport).toContain("renderer={liveDynamicBrushOverlayRenderer}");
    const liveDraftScene = viewport.slice(
      viewport.indexOf("<Layer ref={liveDraftLayerRef}"),
      viewport.indexOf("</Layer>", viewport.indexOf("<Layer ref={liveDraftLayerRef}")),
    );
    expect(liveDraftScene).toContain(
      "liveDynamicBrushOverlayRenderer.isActive",
    );
    expect(liveDraftScene).toContain("liveWetInkOverlayRenderer.isActive");
    expect(liveDraftScene).toContain("liveStampOverlayRenderer.isActive");
    expect(lazyUi).toContain("default: mod.StudioLiveDynamicBrushOverlayHost");
  });
});
