import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

function functionBody(startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Studio freehand hot-path boundary", () => {
  it("maps a complete browser sample batch from one layout and transform snapshot", () => {
    const consume = functionBody(
      "function consumeFreehandPointerBatch(",
      "function publishAuthoritativeFreehandSuffix("
    );

    expect(consume).toContain("snapshotStudioStagePointerBatchMapper(stage)");
    expect(consume).toContain("coordinateMapper.pointFor(sample)");
    expect(consume).not.toContain("stage.setPointersPositions(sample)");
    expect(consume.match(/stage\.setPointersPositions\(pointerEvent\)/gu)).toHaveLength(1);
  });

  it("owns a coalesced batch from the active mutable surface instead of the model flag", () => {
    const consume = functionBody(
      "function consumeFreehandPointerBatch(",
      "function publishAuthoritativeFreehandSuffix("
    );
    const policyStart = consume.indexOf("const mutableDirectSurfaceActive =");
    const policyEnd = consume.indexOf("if (immediateBatchMutation", policyStart);
    const policyBlock = consume.slice(policyStart, policyEnd);

    expect(policyStart).toBeGreaterThan(-1);
    expect(policyBlock).toContain("liveInkOverlayRendererRef.current.isActive");
    expect(policyBlock).toContain("isStudioPixelPencilRenderMode(activeDrawing.brush)");
    expect(policyBlock).toContain("liveStampOverlayRendererRef.current.isActive");
    expect(policyBlock).toContain("mutableDirectSurfaceActive,");
    expect(policyBlock).not.toContain(
      "directInkSurfaceActive: liveDraftDirectRef.current"
    );
  });

  it("processes authoritative ink before coalescing the contact cursor with the same mapper", () => {
    const transport = functionBody(
      "onAuthoritativeMove: (pointerEvent) => {",
      "onDiscard: () => {"
    );
    const cursorIndex = transport.indexOf(
      "updateBrushCursor(stage, pointerEvent, contactPoint, true)"
    );
    const consumeIndex = transport.indexOf("consumeFreehandPointerBatch(");

    expect(cursorIndex).toBeGreaterThan(-1);
    expect(cursorIndex).toBeGreaterThan(consumeIndex);
    expect(transport).toContain("{ coordinateMapper }");
    expect(transport).toContain("contactPoint, true");
    expect(transport).toContain("canCollectStudioPointerPredictionsForActiveTail(");
    expect(transport).toContain("predictedInkTailStateRef.current !== null");
  });

  it("skips raw pen coordinate mapping when prediction, cursor, and guide have no consumer", () => {
    const rawPreview = functionBody(
      "onRawPreviewMove: (pointerEvent) => {",
      "onDiscard: () => {"
    );
    const earlyReturnIndex = rawPreview.indexOf(
      "if (!rawState && !rawCursorWanted && !rawGuideWanted) return"
    );
    const stageIndex = rawPreview.indexOf("const stage = stageRef.current");
    const mapperIndex = rawPreview.indexOf(
      "const coordinateMapper = pointerMapperCache.mapperFor(stage)"
    );

    expect(earlyReturnIndex).toBeGreaterThan(-1);
    expect(earlyReturnIndex).toBeLessThan(stageIndex);
    expect(earlyReturnIndex).toBeLessThan(mapperIndex);
    expect(rawPreview).toContain("rawPenInkPreviewStateRef.current");
    expect(rawPreview).toContain('brushCursorStyle !== "none"');
    expect(rawPreview).toContain("general.showStrokeGuide");
    expect(rawPreview).toContain("drawingInputSettingsRef.current?.stabilizer ?? stabilizer");
  });

  it("coalesces active cursor draws to one latest-position frame while hover stays immediate", () => {
    const cursorDrawing = functionBody(
      "function drawBrushCursorLayer(",
      "function hideSmudgeCursor("
    );

    expect(cursorDrawing).toContain("if (!deferToFrame)");
    expect(cursorDrawing).toContain("globalThis.cancelAnimationFrame(brushCursorDrawRafRef.current)");
    expect(cursorDrawing).toContain(
      "(brushCursorRef.current?.getLayer() ?? strokeGuideRef.current?.getLayer())?.drawScene()"
    );
    expect(cursorDrawing).toContain("if (brushCursorDrawRafRef.current !== null) return");
    expect(cursorDrawing).toContain("globalThis.requestAnimationFrame(() =>");
    expect(cursorDrawing).toContain("drawBrushCursorLayer(deferToFrame)");
  });

  it("keeps prediction mutation private and skips unused GPU planning on Canvas2D", () => {
    const appendPoint = functionBody(
      "function appendFreehandStrokePoint(",
      "function appendDrawingCrdtSampleSuffix("
    );
    const mutableAppendStart = appendPoint.indexOf("if (canAppendDirectly) {");
    const immutableAppendStart = appendPoint.indexOf("const next: DrawEl =", mutableAppendStart);
    const mutableAppend = appendPoint.slice(mutableAppendStart, immutableAppendStart);

    expect(mutableAppendStart).toBeGreaterThan(-1);
    expect(immutableAppendStart).toBeGreaterThan(mutableAppendStart);
    expect(mutableAppend).toMatch(
      /if \(\s*!drawingImmediateBatchMutationRef\.current\s*&& !drawingPredictionPreviewRef\.current\s*\) scheduleDraft\(current\);/u
    );
    expect(mutableAppend.match(/scheduleDraft\(current\)/gu)).toHaveLength(1);
    expect(source).toContain("drawingPredictionBatchMutationRef.current = true");
    expect(source).toContain("pressures: predictedPressures");
    const gpuStart = functionBody(
      "const gpuStartEligible =",
      "const liveInkBackendDecision ="
    );
    expect(gpuStart).toContain('STUDIO_VISIBLE_LIVE_INK_PREFERENCE === "webgpu"');
    expect(gpuStart).toContain('webGpuBackendRef.current === "webgpu"');
    expect(gpuStart).toContain(
      "const gpuStartPlan = gpuStartEligible ? buildGpuLiveStrokePlan(next) : null"
    );
  });

  it("commits one retained freehand preview and paints it inside the same coalesced frame", () => {
    const schedule = functionBody(
      "const scheduleDraft =",
      "const clearDraftPreview ="
    );

    expect(schedule).toContain("globalThis.requestAnimationFrame(() =>");
    expect(schedule).toContain('(pending.kind ?? "freehand") === "freehand"');
    expect(schedule).toContain("KonvaRuntime.autoDrawEnabled = false");
    expect(schedule).toContain("flushSync(() => {");
    expect(schedule).toContain("draftPreviewStoreRef.current.setActive(pending)");
    expect(schedule).toContain("KonvaRuntime.autoDrawEnabled = autoDrawEnabled");
    expect(schedule).toContain("draftPreviewDynamicLayerRef.current");
    expect(schedule).toContain("draftPreviewNormalLayerRef.current");
    expect(schedule).toContain(")?.drawScene()");
  });

  it("presents local ink and schedules CRDT encoding behind a paint opportunity", () => {
    const publish = functionBody(
      "function publishAuthoritativeFreehandSuffix(",
      "drawingFixedRatePumpFrameRef.current ="
    );

    expect(publish.indexOf("flushDirectLiveDraftNow(authoritativeDrawing)")).toBeLessThan(
      publish.indexOf("appendDrawingCrdtSampleSuffix(authoritativeDrawing, startSample)")
    );
    expect(source).toContain("new StudioCrdtLiveStrokePublisher<DrawEl>");
    expect(source).toContain("drawingCrdtPublisherRef.current.flush(authoritativeLiveStroke.id)");
  });
});
