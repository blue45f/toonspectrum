import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const viewportSource = readFileSync(
  new URL("./StudioCanvasViewport.tsx", import.meta.url),
  "utf8",
);
const liveOverlaySource = readFileSync(
  new URL("./StudioLiveCanvasOverlay.tsx", import.meta.url),
  "utf8",
);
const lazyUiSource = readFileSync(
  new URL("./studio-page-lazy-ui.ts", import.meta.url),
  "utf8",
);

describe("Studio live gesture preview viewport wiring", () => {
  it("keeps the high-frequency subscription inside the viewport leaf", () => {
    expect(pageSource).toContain("new StudioLiveGesturePreviewRoomAdapter()");
    expect(pageSource).toContain(
      "studioLiveGesturePreviewAdapter={studioLiveGesturePreviewAdapter}",
    );
    expect(pageSource).not.toContain(
      "useSyncExternalStore(\n    studioLiveGesturePreviewAdapter.subscribe",
    );
    expect(viewportSource).toContain(
      "useSyncExternalStore(\n    studioLiveGesturePreviewAdapter.subscribe",
    );

    const roomRotation = pageSource.slice(
      pageSource.indexOf("const handleStudioLiveRoomChange"),
      pageSource.indexOf("const handleStudioCrdtAuthoritativeSaveBarrierChange"),
    );
    expect(roomRotation.indexOf("cancelStudioLiveGesturePreviewRef.current()"))
      .toBeLessThan(roomRotation.indexOf("studioLiveGesturePreviewAdapter.setRoom(room)"));
    expect(roomRotation.indexOf("studioLiveGesturePreviewAdapter.setRoom(room)"))
      .toBeLessThan(roomRotation.indexOf("studioLiveRoomRef.current = room"));
    expect(roomRotation).toContain(
      "const lifecycle = studioLiveGesturePreviewLifecycleGenerationRef.current",
    );
    expect(roomRotation).toContain("++lifecycle.generation");
    expect(roomRotation).toContain("globalThis.queueMicrotask(() => {");
    expect(roomRotation).toContain("lifecycle.generation !== lifecycleGeneration");
    expect(roomRotation).toContain("studioLiveGesturePreviewAdapter.dispose()");
  });

  it("fails closed across every document capture and hydration boundary", () => {
    const gateStart = viewportSource.indexOf(
      "const studioLiveGesturePreviewVisible =",
    );
    const gateEnd = viewportSource.indexOf(
      "const studioLiveGesturePreviewPageId",
      gateStart,
    );
    const gate = viewportSource.slice(gateStart, gateEnd);

    expect(gate).toContain("!masterEditMode");
    expect(gate).toContain("!isExporting");
    expect(gate).toContain("!saving");
    expect(gate).toContain("!timelapseCapturing");
    expect(gate).toContain("!sourceHydrationPending");
    expect(gate).toContain("!collaborationDocumentUnavailable");
    expect(gate).toContain("studioCrdtOperationSyncReady");
    expect(viewportSource).toContain(
      "const studioLiveGesturePreviewRenderSnapshot = studioLiveGesturePreviewVisible",
    );
    expect(viewportSource).toContain(
      "? studioLiveGesturePreviewSnapshot.filter(",
    );
    expect(viewportSource).toContain(
      "studioLiveGesturePreviewReservedElementIds,\n  );",
    );
    expect(viewportSource).toContain(
      ": studioLiveGesturePreviewAuthoritativeElementIds",
    );
  });

  it("uses one non-interactive active-draft slot in the retained main layer", () => {
    const mainLayerStart = viewportSource.indexOf("<Layer ref={mainLayerRef}>");
    const mainLayerEnd = viewportSource.indexOf(
      "<Layer ref={singleObjectDragLayerRef}",
      mainLayerStart,
    );
    const mainLayer = viewportSource.slice(mainLayerStart, mainLayerEnd);

    expect(mainLayer).toContain("studioLiveGesturePreviewRenderPlan.elements.map");
    expect(mainLayer).toContain("...studioLiveGesturePreviewRenderPlan.elements");
    expect(mainLayer).toContain(
      "studioLiveGesturePreviewRenderPlan.previewElementIds.has(el.id)",
    );
    expect(mainLayer).toContain("|| isLiveGesturePreview");
    expect(mainLayer).toContain("activeDraft={isLiveGesturePreview}");
    expect(mainLayer).toContain(
      "studioLiveGesturePreviewRenderPlan.previewSequenceByElementId.get(el.id)",
    );
    expect(mainLayer).toContain(
      "studioLiveGesturePreviewRenderPlan.previewSequenceByElementId.get(base.id)",
    );
    expect(mainLayer).not.toContain("StudioRemoteEraserOverlay");
    expect(viewportSource).not.toContain("StudioRemoteEraserOverlay");
    expect(lazyUiSource).not.toContain("StudioRemoteEraserOverlay");
  });

  it("keeps cursor presence but suppresses the duplicate SVG trail per rendering peer", () => {
    expect(viewportSource).toContain(
      "trailSuppressedSessionIds={studioLiveGesturePreviewTrailSuppressedSessionIds}",
    );
    expect(liveOverlaySource).toContain(
      "trailSuppressedSessionIds?.has(value.participant.sessionId)",
    );
    expect(liveOverlaySource).toContain(
      "cursor: { ...value.cursor, points: undefined }",
    );
  });

  it("retires a preview only after the authoritative layer draw receipt", () => {
    const handoffStart = viewportSource.indexOf(
      "studioLiveGesturePreviewRenderPlan.authoritativeHandoffToken === \"[]\"",
    );
    const handoffEnd = viewportSource.indexOf(
      "// Document paper grain preview",
      handoffStart,
    );
    const handoff = viewportSource.slice(handoffStart, handoffEnd);

    expect(handoff).toContain("globalThis.requestAnimationFrame");
    expect(handoff).toContain("layer.draw()");
    expect(handoff).toContain(
      "studioLiveGesturePreviewAdapter.markAuthoritativeProjection(",
    );
    expect(handoff.indexOf("layer.draw()"))
      .toBeLessThan(handoff.indexOf("markAuthoritativeProjection("));
    expect(handoff).toContain("globalThis.cancelAnimationFrame(frameHandle)");
  });
});
