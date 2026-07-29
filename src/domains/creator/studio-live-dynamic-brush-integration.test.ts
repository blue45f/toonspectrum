import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Studio live dynamic brush integration boundary", () => {
  it("arms the suffix renderer at pointer-down and routes pointer frames through appendFrom", () => {
    const page = source("./StudioPage.tsx");
    const pointerStart = page.slice(
      page.indexOf("const dynamicBrushDirect ="),
      page.indexOf("const predictionTailEligible =", page.indexOf("const dynamicBrushDirect =")),
    );
    expect(pointerStart).toContain(
      "liveDynamicBrushOverlayRendererRef.current.begin(next).status === \"started\"",
    );
    expect(pointerStart).toContain("liveDynamicBrushDraftDirectRef.current = dynamicBrushDirect");
    expect(pointerStart).toContain(
      "if (stampDirect || dynamicBrushDirect || wetInkOverlayStarted)",
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

  it("seals exact material before synchronously transferring authority to the draft FIFO", () => {
    const page = source("./StudioPage.tsx");
    const clear = page.slice(
      page.indexOf("const clearDraftPreview ="),
      page.indexOf("const DEFERRED_STROKE_COMMIT_IDLE_MS"),
    );
    const seal = clear.indexOf("renderer.end(finalDynamicBrushStroke)");
    const settle = clear.indexOf(
      "draftPreviewStoreRef.current.settle(finalDynamicBrushStroke)",
    );
    const drawReceipt = clear.indexOf("draftPreviewDynamicLayerRef.current?.drawScene()");
    const release = clear.indexOf("renderer.releaseSettledPrefix(1)");
    expect(seal).toBeGreaterThan(0);
    expect(settle).toBeGreaterThan(seal);
    expect(drawReceipt).toBeGreaterThan(settle);
    expect(release).toBeGreaterThan(drawReceipt);
  });

  it("mounts both active and settled native-density canvases through Viewport", () => {
    const hosts = source("./StudioLiveInkHosts.tsx");
    const viewport = source("./StudioCanvasViewport.tsx");
    const lazyUi = source("./studio-page-lazy-ui.ts");
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
