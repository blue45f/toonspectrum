import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const guideSource = readFileSync(new URL("./StudioCanvasGuideLayers.tsx", import.meta.url), "utf8");
const inspectorSource = readFileSync(new URL("./StudioInspectorAside.tsx", import.meta.url), "utf8");

describe("StudioPage drawing-assist integration contract", () => {
  it("consumes both guide handles before the Stage can begin an ink stroke", () => {
    const stageDown = source.slice(
      source.indexOf("function onStageDown"),
      source.indexOf("function onStageMove")
    );
    expect(stageDown).toContain('e.target.name() === "vp-handle"');
    expect(stageDown).toContain('e.target.name() === "isometric-origin-handle"');
  });

  it("keeps panel and canvas guide interactions behind the same edit locks", () => {
    expect(inspectorSource).toContain(
      "const drawingAssistControlsDisabled = activeSurfaceReviewLocked || saving || masterEditMode"
    );
    expect(inspectorSource).toMatch(/<StudioPerspectivePanel[\s\S]*?disabled=\{drawingAssistControlsDisabled\}/u);
    expect(inspectorSource).toMatch(/<StudioIsometricGridPanel[\s\S]*?disabled=\{drawingAssistControlsDisabled\}/u);
    expect(source).toMatch(
      /<StudioCanvasGuideOverlayLayers[\s\S]*?drawingAssistDisabled=\{activeSurfaceReviewLocked \|\| saving \|\| masterEditMode\}/u
    );
    expect(guideSource).toMatch(
      /<StudioPerspectiveOverlay[\s\S]*?disabled=\{drawingAssistDisabled\}/u
    );
    expect(guideSource).toMatch(
      /<StudioIsometricGridOverlay[\s\S]*?disabled=\{drawingAssistDisabled\}/u
    );
  });

  it("routes every guide drag through preview, one final commit, and explicit cancellation", () => {
    expect(source).toMatch(
      /<StudioCanvasGuideOverlayLayers[\s\S]*?onPreviewVanishingPoint=\{previewVanishingPointById\}[\s\S]*?onCommitVanishingPoint=\{moveVanishingPointById\}[\s\S]*?onPreviewIsometricOrigin=\{previewIsometricOrigin\}[\s\S]*?onCommitIsometricOrigin=\{commitIsometricOrigin\}[\s\S]*?onCancelDrawingAssistPreview=\{cancelStudioDrawingAssistPreview\}/u
    );
    expect(guideSource).toMatch(
      /<StudioPerspectiveOverlay[\s\S]*?onPreviewPoint=\{onPreviewVanishingPoint\}[\s\S]*?onCommitPoint=\{onCommitVanishingPoint\}[\s\S]*?onCancelPoint=\{onCancelDrawingAssistPreview\}/u
    );
    expect(guideSource).toMatch(
      /<StudioIsometricGridOverlay[\s\S]*?onPreviewOrigin=\{onPreviewIsometricOrigin\}[\s\S]*?onCommitOrigin=\{onCommitIsometricOrigin\}[\s\S]*?onCancelOrigin=\{onCancelDrawingAssistPreview\}/u
    );
    expect(inspectorSource).toMatch(
      /<StudioIsometricGridPanel[\s\S]*?onPreviewOrigin=\{previewIsometricOrigin\}[\s\S]*?onCommitOrigin=\{commitIsometricOrigin\}/u
    );
  });
});
