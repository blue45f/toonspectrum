import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

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
    expect(source).toContain(
      "const drawingAssistControlsDisabled = activeSurfaceReviewLocked || saving || masterEditMode"
    );
    expect(source).toMatch(/<StudioPerspectivePanel[\s\S]*?disabled=\{drawingAssistControlsDisabled\}/u);
    expect(source).toMatch(/<StudioIsometricGridPanel[\s\S]*?disabled=\{drawingAssistControlsDisabled\}/u);
    expect(source).toMatch(
      /<StudioPerspectiveOverlay[\s\S]*?disabled=\{activeSurfaceReviewLocked \|\| saving \|\| masterEditMode\}/u
    );
    expect(source).toMatch(
      /<StudioIsometricGridOverlay[\s\S]*?disabled=\{activeSurfaceReviewLocked \|\| saving \|\| masterEditMode\}/u
    );
  });

  it("routes every guide drag through preview, one final commit, and explicit cancellation", () => {
    expect(source).toMatch(
      /<StudioPerspectiveOverlay[\s\S]*?onPreviewPoint=\{previewVanishingPointById\}[\s\S]*?onCommitPoint=\{moveVanishingPointById\}[\s\S]*?onCancelPoint=\{cancelStudioDrawingAssistPreview\}/u
    );
    expect(source).toMatch(
      /<StudioIsometricGridOverlay[\s\S]*?onPreviewOrigin=\{previewIsometricOrigin\}[\s\S]*?onCommitOrigin=\{commitIsometricOrigin\}[\s\S]*?onCancelOrigin=\{cancelStudioDrawingAssistPreview\}/u
    );
    expect(source).toMatch(
      /<StudioIsometricGridPanel[\s\S]*?onPreviewOrigin=\{previewIsometricOrigin\}[\s\S]*?onCommitOrigin=\{commitIsometricOrigin\}/u
    );
  });
});
