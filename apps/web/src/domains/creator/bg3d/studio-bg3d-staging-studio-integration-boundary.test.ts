import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioBg3dEditorSource } from "./read-studio-bg3d-editor-source";

const background3dSource = readStudioBg3dEditorSource();
const viewPanelSource = readFileSync(
  new URL("./StudioBg3dViewPanelContent.tsx", import.meta.url),
  "utf8",
);
const lightingStudioSource = readFileSync(
  new URL("./StudioBg3dLightingStudio.tsx", import.meta.url),
  "utf8",
);

describe("Studio BG3D staging-studio integration boundary", () => {
  it("keeps direct lighting and exposure edits canonical, undoable, and physics-safe", () => {
    const lightingStart = background3dSource.indexOf(
      "function updateLightingSettings(",
    );
    const exposureStart = background3dSource.indexOf(
      "function updateRenderExposure(",
      lightingStart,
    );
    const moodStart = background3dSource.indexOf(
      "function applyMoodRig(",
      exposureStart,
    );
    const lightingHandler = background3dSource.slice(lightingStart, exposureStart);
    const exposureHandler = background3dSource.slice(exposureStart, moodStart);
    const finishStart = background3dSource.indexOf("function finishLtDocumentGesture(");
    const finishEnd = background3dSource.indexOf(
      "function armLtGradeDocumentGestureSafetyTimer(",
      finishStart,
    );
    const finishHandler = background3dSource.slice(finishStart, finishEnd);

    expect(lightingStart).toBeGreaterThanOrEqual(0);
    expect(exposureStart).toBeGreaterThan(lightingStart);
    expect(moodStart).toBeGreaterThan(exposureStart);
    expect(finishStart).toBeGreaterThanOrEqual(0);

    expect(lightingHandler).toContain(
      "if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) return;",
    );
    expect(lightingHandler).toContain("applyStudio3dLightingSettings(current, patch)");
    expect(lightingHandler).toContain("beginStudio3dGradeDocumentGesture(");
    expect(lightingHandler).toContain("ltGradeDocumentLatestRef.current = next");
    expect(lightingHandler).toContain("setSceneBaseDocument(next)");
    // Live ticks must not flood production undo — commit happens at gesture end.
    expect(lightingHandler).not.toContain("pushStudio3dGradeCommand");
    expect(lightingHandler).not.toContain("commitStudio3dGradeDocumentGesture");

    expect(finishHandler).toContain("commitStudio3dGradeDocumentGesture({");
    expect(finishHandler).toContain("setCanUndo(committed.receipt.canUndo)");
    expect(finishHandler).toContain("setCanRedo(committed.receipt.canRedo)");

    expect(exposureHandler).toContain(
      "if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) return;",
    );
    expect(exposureHandler).toContain("setSceneBaseDocument((current) =>");
    expect(exposureHandler).toContain("render: { ...current.render, exposure }");
    expect(exposureHandler).toContain("canonicalSceneDocument(candidate) ?? current");
  });

  it("connects the scene-authoritative light values to one disabled-aware editor", () => {
    expect(background3dSource).toContain("updateLightingSettings,");
    expect(background3dSource).toContain("finishLtDocumentGesture,");
    expect(background3dSource).toContain("updateRenderExposure,");
    expect(viewPanelSource).toContain("<StudioBg3dLightingStudio");
    expect(viewPanelSource).toContain("lighting={sceneBaseDocument.lighting}");
    expect(viewPanelSource).toContain("exposure={sceneBaseDocument.render.exposure}");
    expect(viewPanelSource).toContain("onUpdateLighting={updateLightingSettings}");
    expect(viewPanelSource).toContain("onUpdateExposure={updateRenderExposure}");
    expect(viewPanelSource).toContain("onCommitLightingHistory={finishLtDocumentGesture}");
    expect(viewPanelSource).toMatch(
      /disabled=\{\s*isCapturing \|\| isBatchRenderingShots \|\| isRestoringScene \|\|\s*physicsInteractionLocked\s*\}/u,
    );
    expect(lightingStudioSource).toContain("onChangeEnd={onCommitHistory}");
    expect(lightingStudioSource).toContain("onChangeEnd={onCommitLightingHistory}");
    expect(lightingStudioSource).toContain("onCommitLightingHistory?.()");
  });

  it("passes authoritative imported-model classifications into the shared actor/prop library", () => {
    expect(background3dSource).toContain(
      "classificationByModelId={genericModelClassifications}",
    );
    expect(background3dSource).not.toMatch(
      /classificationByModelId=\{[^}]*entry\.name/iu,
    );
  });
});
