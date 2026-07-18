import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const background3dSource = readFileSync(
  new URL("./StudioBackground3D.tsx", import.meta.url),
  "utf8",
);

describe("Studio BG3D mood/render integration boundary", () => {
  it("applies a mood only from the explicit preset command and records one immediate transition", () => {
    const handlerStart = background3dSource.indexOf("function applyMoodRig(");
    const handlerEnd = background3dSource.indexOf(
      "function readCurrentCanonicalSceneForShot",
      handlerStart,
    );
    const handler = background3dSource.slice(handlerStart, handlerEnd);
    const applyIndex = handler.indexOf("applyStudioBg3dMoodRig(sceneBaseDocument, rigId)");
    const historyIndex = handler.indexOf(
      "commitImmediateHistoryTransition(primitives, customModels, applied)",
    );
    const stateIndex = handler.indexOf("setSceneBaseDocument(applied)");

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(applyIndex).toBeGreaterThanOrEqual(0);
    expect(historyIndex).toBeGreaterThan(applyIndex);
    expect(stateIndex).toBeGreaterThan(historyIndex);
    expect(handler.match(/commitImmediateHistoryTransition/gu)).toHaveLength(1);
    expect(background3dSource).toContain("onClick={() => applyMoodRig(rig.id)}");
  });

  it("projects saved render settings on creation and on later document updates", () => {
    const controllerStart = background3dSource.indexOf(
      "function StudioBg3dWebglRenderSettingsController",
    );
    const controllerEnd = background3dSource.indexOf(
      "function SkyClearColorController",
      controllerStart,
    );
    const controller = background3dSource.slice(controllerStart, controllerEnd);
    const canvasStart = background3dSource.indexOf("<Canvas");
    const canvasEnd = background3dSource.indexOf("<BgAdaptiveDprController", canvasStart);
    const canvas = background3dSource.slice(canvasStart, canvasEnd);

    expect(controller).toContain("applyStudioBg3dThreeWebglRenderSettings(gl, render)");
    expect(controller).toContain("[gl, render]");
    expect(background3dSource).toContain(
      "<StudioBg3dWebglRenderSettingsController render={sceneBaseDocument.render} />",
    );
    expect(canvas).toContain(
      "applyStudioBg3dThreeWebglRenderSettings(gl, sceneBaseDocument.render)",
    );
  });
});
