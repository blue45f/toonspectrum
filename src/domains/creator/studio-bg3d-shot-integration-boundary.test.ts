import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioBackground3D.tsx", import.meta.url),
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

  it("batch-renders every shot without recording temporary scene states in history", () => {
    const handler = functionSlice("exportSavedShotsAsZip", "updateBackgroundTransparency");

    expect(handler).toContain("for (let index = 0; index < shots.length; index += 1)");
    expect(handler).toContain("applyStudioBg3dShot(currentDocument, shot.id)");
    expect(handler).toContain("const captured = await captureStudioBg3dRaster(");
    expect(handler).toContain("captureAdapter,");
    expect(handler).toContain("signal: controller.signal");
    expect(handler).toContain("timeoutMs: 30_000");
    expect(handler).toContain("timeoutMs: 20_000");
    expect(handler).toContain("requestedHeight: applied.output.exportHeight");
    expect(handler).toContain("includeDepth: applied.output.line.depthEnabled");
    expect(handler).toContain("renderStudioBg3dLtLayers(");
    expect(handler).toContain("encodeStudioBg3dLtCompositeToPngBlob(");
    expect(handler).toContain('output: "lt-composite"');
    expect(handler).toContain("accumulatedPngBytes + png.size > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES");
    expect(handler.indexOf("accumulatedPngBytes += png.size")).toBeLessThan(
      handler.indexOf("images.push({"),
    );
    expect(handler).toContain("await buildStudioBg3dShotBatchArchiveInWorker(images");
    expect(handler).toContain("await buildStudioBg3dShotBatchArchive(images");
    expect(handler).not.toContain("commitImmediateHistoryTransition");
    expect(handler).toContain("const originalSceneBaseDocument = sceneBaseDocument");
    expect(handler).toContain("const originalLiveView = viewportApiRef.current?.readView()");
    expect(handler).toContain("setSceneBaseDocument(originalSceneBaseDocument)");
    expect(handler).toContain("viewportApiRef.current?.applyView(originalLiveView)");
    expect(source).toContain("if (isRestoringScene || isBatchRenderingShots) return;");
    expect(source).toContain("onClick={() => shotBatchAbortRef.current?.abort()}");
  });
});
