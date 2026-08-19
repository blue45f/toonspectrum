import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8",
);
const viewportSource = readFileSync(
  new URL("./StudioCanvasViewport.tsx", import.meta.url),
  "utf8",
);
const hostSource = readFileSync(
  new URL("./StudioLiveInkHosts.tsx", import.meta.url),
  "utf8",
);
const lazyUiSource = readFileSync(
  new URL("./studio-page-lazy-ui.ts", import.meta.url),
  "utf8",
);
const overlaySource = readFileSync(
  new URL("./studio-live-wet-ink-overlay.ts", import.meta.url),
  "utf8",
);

describe("live wet-ink product boundary", () => {
  it("mounts independent active/settled native surfaces through the lazy viewport host", () => {
    expect(hostSource).toContain("StudioLiveWetInkOverlayHost");
    expect(hostSource).toContain('data-studio-live-wet-ink-active="true"');
    expect(hostSource).toContain('data-studio-live-wet-ink-settled="true"');
    expect(lazyUiSource).toContain("mod.StudioLiveWetInkOverlayHost");
    expect(viewportSource).toContain(
      "liveWetInkOverlayRenderer: import(\"./studio-live-wet-ink-overlay\")",
    );
    expect(viewportSource).toContain(
      "<StudioLiveWetInkOverlayHost",
    );
  });

  it("owns begin/append/end and every destructive pointer/page lifecycle explicitly", () => {
    expect(studioPageSource).toContain(
      "liveWetInkOverlayRendererRef.current.begin(next",
    );
    expect(studioPageSource).toContain(
      "renderer.appendFrom(next,",
    );
    expect(studioPageSource).toContain(
      "const seal = renderer.end(finalWetInkStroke",
    );
    expect(studioPageSource).toContain(
      "liveWetInkOverlayRendererRef.current.resetActive()",
    );
    expect(studioPageSource).toContain(
      "liveWetInkOverlayRendererRef.current.clear()",
    );
    expect(studioPageSource).toContain(
      "pageEpoch: currentPageId",
    );
  });

  it("uses the committed wet-ink runtime as its exact pointer-up handoff authority", () => {
    expect(overlaySource).toContain("planStudioWetInkBrushReplay");
    expect(overlaySource).toContain('phase: "live"');
    expect(overlaySource).toContain("fieldDigest: exact.value.fieldDigest");
    expect(overlaySource).toContain("revision: exact.value.revision");
    expect(overlaySource).toContain("seed: exact.value.seed");
    expect(overlaySource).toContain("consumeStudioWetInkDirtyBounds");
  });

  it("commits the settled Konva layer before releasing the transient wet canvas", () => {
    const clearStart = studioPageSource.indexOf("const clearDraftPreview =");
    const clearEnd = studioPageSource.indexOf(
      "const DEFERRED_STROKE_COMMIT_IDLE_MS",
      clearStart,
    );
    const clear = studioPageSource.slice(clearStart, clearEnd);
    const seal = clear.indexOf("const seal = renderer.end(finalWetInkStroke");
    const settle = clear.indexOf(
      "draftPreviewStoreRef.current.settle(finalWetInkStroke)",
      seal,
    );
    const flushReceipt = clear.lastIndexOf("flushSync(() => {", settle);
    const release = clear.indexOf("renderer.releaseSettledPrefix(1)", settle);

    expect(seal).toBeGreaterThan(0);
    expect(flushReceipt).toBeGreaterThan(seal);
    expect(settle).toBeGreaterThan(flushReceipt);
    expect(release).toBeGreaterThan(settle);
    expect(clear.slice(settle, release)).not.toContain(
      "draftPreviewNormalLayerRef.current?.drawScene()",
    );
  });

  it("keeps the exact vector fail-visible when a canonical Living Ink frame is blank", () => {
    const fallback = studioPageSource.slice(
      studioPageSource.indexOf("function commitStudioLivingInkFallbackVector"),
      studioPageSource.indexOf("async function finishStudioLivingInkStroke"),
    );
    const finish = studioPageSource.slice(
      studioPageSource.indexOf("async function finishStudioLivingInkStroke"),
      studioPageSource.indexOf("async function finishStudioHokusaiLiveStroke"),
    );
    expect(finish).toContain("studioLivingInkCoverageIntersectsStroke({");
    expect(finish).toContain("원본 벡터를 유지합니다");
    expect(fallback).toContain("flushSync(() => {");
    expect(fallback).toContain("draftPreviewStoreRef.current.settle(finished)");
    expect(fallback.indexOf("draftPreviewStoreRef.current.settle(finished)"))
      .toBeLessThan(fallback.indexOf("livingInkOverlaySurfaceRef.current?.renderer.clear()"));
  });

  it("restores a fast Living Ink contact until its first material presentation receipt", () => {
    const finish = studioPageSource.slice(
      studioPageSource.indexOf("function finishDrawingPointer"),
      studioPageSource.indexOf("function onStagePointerCancel"),
    );
    const clear = finish.indexOf(
      "clearDraftPreview({ preserveInkForDeferredCommit: deferInkCleanup })",
    );
    const restore = finish.indexOf("showStudioLivingInkVectorShadow(", clear);
    const hokusai = finish.indexOf("const finishingHokusai", clear);
    expect(clear).toBeGreaterThan(0);
    expect(restore).toBeGreaterThan(clear);
    expect(restore).toBeLessThan(hokusai);
    expect(finish.slice(clear, restore)).toContain("!finishingLivingInk.overlayPresented");
  });
});
