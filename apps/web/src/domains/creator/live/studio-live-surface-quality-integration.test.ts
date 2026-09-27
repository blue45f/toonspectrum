import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioCanvasViewportStack } from "../canvas/read-studio-canvas-viewport-stack";



function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function liveSurfaceStartSource(): string {
  const host = source("../StudioCuttoonEditorHost.tsx");
  expect(host).toContain('import { bindStudioDrawLiveSurfaces } from "./studio-cuttoon-editor/studio-live-surface-start"');
  expect(host).toContain("const beginStudioDrawLiveSurfaces = bindStudioDrawLiveSurfaces({");
  expect(host).toContain("    beginStudioDrawLiveSurfaces,");
  expect(source("../studio-cuttoon-editor/studio-cuttoon-stage-pointers-down-draw.ts"))
    .toContain("if (!beginStudioDrawLiveSurfaces(next, pointerSample, strokeOrigin, {");
  return source("../studio-cuttoon-editor/studio-live-surface-start.ts");
}

describe("Studio native live-surface quality integration", () => {
  it("lets only a native-DPR Canvas overlay with a successful begin own the draft", () => {
    const page = source("../StudioCuttoonEditorHost.tsx");
    const surfaceStart = liveSurfaceStartSource();
    const begin = surfaceStart.indexOf("const overlayCandidate =");
    const end = surfaceStart.indexOf("const predictionTailEligible =", begin);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    expect(page).toContain("beginStudioDrawLiveSurfaces = bindStudioDrawLiveSurfaces({");
    const pointerDown = source("../studio-cuttoon-editor/studio-cuttoon-stage-pointers-down-draw.ts");
    expect(pointerDown).toContain("if (!beginStudioDrawLiveSurfaces(next, pointerSample, strokeOrigin, {");
    const start = surfaceStart.slice(begin, end);

    expect(start).toContain(
      "liveInkOverlayRendererRef.current.isNativeSurfaceReady",
    );
    expect(start).toContain("let liveInkOverlayStarted = false");
    expect(start).toContain(
      "liveInkOverlayStarted = causalPostCorrectionEligible",
    );
    const directStart = start.indexOf("const direct =");
    const directEnd = start.indexOf(";", directStart);
    const directAuthority = start.slice(directStart, directEnd);
    expect(directAuthority).toContain('strokeSurfaceRoute.kind === "konva"');
    expect(directAuthority).toContain('next.mode === "eraser"');
    expect(directAuthority).toContain("isDirectLiveDraftEl(next)");
    expect(directAuthority).toContain('strokeSurfaceRoute.kind === "living-ink"');
    expect(directAuthority).toContain("|| hokusaiPinned");
    expect(directAuthority).toContain("|| pixelDirect");
    expect(directAuthority).toContain("|| liveInkOverlayStarted");
    expect(directAuthority).toContain("|| wetInkOverlayStarted");
    expect(directAuthority).toContain("|| gpuPin");
    expect(directAuthority).toContain("|| dynamicBrushDirect");
    expect(directAuthority).not.toContain("overlayCandidate");
    expect(start).not.toContain(
      "const direct = pixelDirect || overlayCandidate || gpuPin",
    );
  });

  it("paints the live eraser draft on the main layer with destination-out for real pixel lifting", () => {
    const page = source("../StudioCuttoonEditorHost.tsx");
    const viewport = readStudioCanvasViewportStack(import.meta.url, "../canvas/");
    const flushStart = page.indexOf("const flushDirectLiveDraft =");
    const flushEnd = page.indexOf("const flushDirectLiveDraftNow =", flushStart);
    const flush = page.slice(flushStart, flushEnd);
    const mainLayerStart = viewport.indexOf("<Layer ref={mainLayerRef}>");
    const mainLayer = viewport.slice(
      mainLayerStart,
      viewport.indexOf("</Layer>", mainLayerStart),
    );

    expect(flush).toContain(
      '(next.mode === "eraser" ? mainLayerRef.current : liveDraftLayerRef.current)?.batchDraw();',
    );
    expect(mainLayer).toContain('el.mode !== "eraser"');
    expect(mainLayer).toContain("drawLiveFreehandDraftToContext(context, el);");
  });

  it("does not admit prediction or block the exact dynamic fallback from a mere candidate", () => {
    const page = source("../StudioCuttoonEditorHost.tsx");
    const surfaceStart = liveSurfaceStartSource();
    const begin = surfaceStart.indexOf("const overlayCandidate =");
    const end = surfaceStart.indexOf("armTransientPenInkSurfaces({", begin);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    expect(page).toContain('from "./studio-cuttoon-editor/studio-live-surface-start"');
    const start = surfaceStart.slice(begin, end);

    expect(start).toContain("&& !liveInkOverlayStarted");
    expect(start).toContain("&& liveInkOverlayStarted");
    expect(start).not.toContain("&& overlayDirect");
  });
});
