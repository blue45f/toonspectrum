import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioBackground3D.tsx", import.meta.url),
  "utf8",
);
const cameraApplicationSource = readFileSync(
  new URL("./studio-bg3d-camera-application.ts", import.meta.url),
  "utf8",
);

function functionSlice(name: string, nextName: string): string {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Studio BG3D shot UI integration boundary", () => {
  it("captures the current canonical runtime view as one undoable command", () => {
    const handler = functionSlice("captureCurrentShot", "applySavedShot");

    expect(handler).toContain("readCurrentCanonicalSceneForShot()");
    expect(handler).toContain("captureStudioBg3dShot(currentDocument");
    expect(handler.match(/commitImmediateHistoryTransition/gu)).toHaveLength(1);
    expect(handler).toContain("setSceneBaseDocument(captured)");
    expect(source).toContain("onClick={captureCurrentShot}");
  });

  it("reads a complete canonical camera, including projection, zoom, and active lens shift", () => {
    expect(source).toContain('projection: camera instanceof THREE.OrthographicCamera ? "orthographic" : "perspective"');
    expect(source).toContain("zoom: camera.zoom");
    expect(source).toContain("camera.view.offsetX / camera.view.fullWidth");
    expect(source).toContain("camera.view.offsetY / camera.view.fullHeight");
    expect(source).toContain("...(lensShift ? { lensShift } : {})");
  });

  it("projects visibility and applies the persisted camera before exposing a shot", () => {
    const handler = functionSlice("commitAppliedShot", "captureCurrentShot");

    expect(handler).toContain("projectStudioBg3dShotVisibilityToRuntime(");
    expect(handler.indexOf("if (!projected)")).toBeGreaterThanOrEqual(0);
    expect(handler.match(/commitImmediateHistoryTransition/gu)).toHaveLength(1);
    expect(handler).toContain("setPrimitives(projected.primitives)");
    expect(handler).toContain("setCustomModels(projected.customModels)");
    expect(handler).toContain("viewportApiRef.current?.applyView(appliedDocument.camera)");
    expect(handler).toContain("collectStudioBg3dEffectivelyVisibleEntityIds(appliedDocument.nodes)");
    expect(source).toContain("onClick={() => applySavedShot(shot.id)}");
    expect(source).toContain("effectivelyVisibleLayerIds.has(firstSelectedId)");
  });

  it("batch-renders selected shots and passes without recording temporary scene states in history", () => {
    const handler = functionSlice("exportSavedShotsAsZip", "updateBackgroundTransparency");

    expect(handler).toContain("createStudioBg3dShotBatchPlan(shots");
    expect(handler.indexOf("if (shotBatchBlockedReason)")).toBeLessThan(
      handler.indexOf("readCurrentCanonicalSceneForShot()"),
    );
    expect(handler).toContain("if (captureInFlightRef.current)");
    expect(handler).toContain("selectedShotIds: shotBatchSelectedIds");
    expect(handler).toContain("passes: selectedShotBatchPasses");
    expect(handler).toContain("contactSheet: shotBatchIncludeContactSheet");
    expect(handler).toContain("for (let index = 0; index < batchPlan.shots.length; index += 1)");
    expect(handler).toContain("applyStudioBg3dShot(currentDocument, shot.shotId)");
    expect(handler).toContain("freezeStudioBg3dShotAnimationsForBatch(appliedShot)");
    expect(handler).toContain("const projectionChanged = renderedProjection !== applied.camera.projection");
    expect(handler).toContain("await applyStudioBg3dViewportAfterTransition({");
    expect(handler).toContain("previousApi: previousViewportApi");
    expect(handler).toContain("requireReplacement: firstShotRequiresViewportReplacement || projectionChanged");
    expect(handler).toContain("view: applied.camera");
    expect(handler.indexOf("view: applied.camera")).toBeLessThan(
      handler.indexOf("captured = await captureStudioBg3dRaster("),
    );
    expect(handler).toContain("captured = await captureStudioBg3dRaster(");
    expect(handler).toContain("captureAdapter,");
    expect(handler).toContain("signal: controller.signal");
    expect(handler).toContain("timeoutMs: 30_000");
    expect(handler).toContain("timeoutMs: 20_000");
    expect(handler).toContain('batchPlan.exportHeight === "per-shot"');
    expect(handler).toContain("? applied.output.exportHeight");
    expect(handler).toContain('applied.output.line.depthEnabled || batchPlan.passes.includes("depth")');
    expect(handler).toContain("renderStudioBg3dLtLayers(");
    expect(handler).toContain("for (const pass of batchPlan.passes)");
    expect(handler).toContain('pass === "beauty"');
    expect(handler).toContain('pass === "lt-composite"');
    expect(handler).toContain('pass === "depth"');
    expect(handler).toContain("createStudioBg3dDepthRasterLayer(");
    expect(handler).toContain("encodeStudioBg3dLtCompositeToPngBlob(");
    expect(handler).toContain("pass,");
    expect(handler).toContain(
      "accumulatedArtifactBytes + stagedArtifactBytes + png.size >",
    );
    expect(handler.indexOf("stagedArtifactBytes += png.size")).toBeLessThan(
      handler.indexOf("stagedImages.push({"),
    );
    expect(handler).toContain("await buildStudioBg3dShotBatchArchiveInWorker(images");
    expect(handler).toContain("await buildStudioBg3dShotBatchArchive(images");
    expect(handler).toContain("resumeKey: batchPlan.resumeKey");
    expect(handler).toContain("requestedPasses: batchPlan.passes");
    expect(handler).toContain('mode: "maximum-height"');
    expect(handler).toContain("requestedHeight: requestedCaptureHeight");
    expect(handler).toContain("wasReduced: captureWasReduced");
    expect(handler).toContain("maxEdge: STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION");
    expect(handler).toContain("skippedArtifacts");
    expect(handler).toContain("layeredPsdRequested: shotBatchIncludeLayeredPsd");
    expect(handler).toContain("contactSheetRequested: batchPlan.includeContactSheet");
    expect(handler).toContain("isStudioBg3dShotBatchQueueCompatible(");
    expect(handler).toContain("retryStudioBg3dShotBatchQueue(");
    expect(handler).toContain("waitForStudioBg3dBatchDocumentVisible(document");
    expect(handler).toContain("stagedImages.push({");
    expect(handler.indexOf("images.push(...stagedImages)")).toBeGreaterThan(
      handler.indexOf("for (const pass of batchPlan.passes)"),
    );
    expect(handler).toContain("succeedStudioBg3dShotBatchQueueItem(");
    expect(handler).toContain("shotBatchRecoveryRef.current = recoverySession");
    expect(handler).toContain("admitStudioBg3dShotPsdLayers(rendered.layers)");
    expect(handler).toContain("await buildStudioBg3dShotLayeredPsdInWorker(rendered.layers");
    expect(handler.indexOf("await buildStudioBg3dShotLayeredPsdInWorker(rendered.layers"))
      .toBeGreaterThan(handler.indexOf("stagedImages.push({"));
    expect(handler).toContain("layeredPsds.push(...stagedLayeredPsds)");
    expect(handler).toContain("psdFallbacks");
    expect(handler).toContain("layeredPsds,");
    expect(handler).toContain("batchPlan.includeContactSheet");
    expect(handler).toContain("STUDIO_BG3D_SHOT_CONTACT_SHEET_PASS_PRIORITY");
    expect(handler).toContain("await buildStudioBg3dShotContactSheetsInWorker(");
    expect(handler).toContain('contactSheetFallback = "source-unavailable"');
    expect(handler).toContain("contactSheets,");
    expect(handler).not.toContain("commitImmediateHistoryTransition");
    expect(handler).toContain("const originalSceneBaseDocument = sceneBaseDocument");
    expect(handler).toContain("const originalLiveView = originalViewportApi?.readView()");
    expect(handler).toContain("setSceneBaseDocument(originalSceneBaseDocument)");
    expect(handler).toContain("view: originalLiveView");
    expect(handler).toContain("requireReplacement: projectionChanged");
    expect(handler.indexOf("setSceneBaseDocument(originalSceneBaseDocument)")).toBeLessThan(
      handler.lastIndexOf("view: originalLiveView"),
    );
    expect(handler.lastIndexOf("view: originalLiveView")).toBeLessThan(
      handler.lastIndexOf("setIsCapturing(false)"),
    );
    expect(handler).toContain(
      "pendingInitialCameraRef.current = restoreFailed || isQuadView ? originalLiveView : null",
    );
    expect(handler.indexOf("pendingInitialCameraRef.current = restoreFailed || isQuadView"))
      .toBeLessThan(handler.lastIndexOf("setIsCapturing(false)"));
    expect(source).toContain("if (isRestoringScene || isBatchRenderingShots) return;");
    expect(source).toContain("onClick={() => shotBatchAbortRef.current?.abort()}");
    expect(source).toContain("setShotBatchExcludedIds");
    expect(source).toContain("STUDIO_BG3D_SHOT_BATCH_PASS_LABELS[pass]");
    expect(source).toContain("shotBatchBlockedReason !== null ||");
    expect(source).toContain("불러오기에 실패한 3D 모델이 있어 컷 배치 출력을 막았습니다.");
    expect(source).toContain("3D 모델 렌더 복제본을 준비하는 중입니다.");
    expect(source).toContain("3D 장면 복원 오류를 해결하기 전에는");
  });

  it("reapplies the complete camera only after a replacement viewport becomes ready", () => {
    const transitionStart = cameraApplicationSource.indexOf(
      "export async function applyStudioBg3dViewportAfterTransition(",
    );
    expect(transitionStart).toBeGreaterThanOrEqual(0);
    const transition = cameraApplicationSource.slice(transitionStart);

    expect(transition).toContain("input.requireReplacement && api === input.previousApi");
    expect(transition.indexOf("await waitForStudioBg3dCapturePhase(input.waitForPaintFrame()")).toBeLessThan(
      transition.indexOf("api.applyView(input.view)"),
    );
    expect(transition.lastIndexOf("await waitForStudioBg3dCapturePhase(input.waitForPaintFrame()")).toBeGreaterThan(
      transition.indexOf("api.applyView(input.view)"),
    );
    expect(source).toContain("onReady={handleViewportReady}");
    expect(source).toContain("if (api && pendingView && api.applyView(pendingView))");
    expect(cameraApplicationSource).not.toContain("camera.copy(projection, false)");
  });
});
