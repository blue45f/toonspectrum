import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const asideSource = readFileSync(
  new URL("./StudioInspectorAside.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8",
);
const railSource = readFileSync(
  new URL("./StudioLeftToolRail.tsx", import.meta.url),
  "utf8",
);

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const nextFunction = source.indexOf("\n  function ", start + 1);
  return source.slice(start, nextFunction < 0 ? undefined : nextFunction);
}

describe("Studio inspector raster recovery boundary", () => {
  it("keeps professional pixel routes discoverable without pretending a raster target exists", () => {
    expect(asideSource).toContain("imageToolsAvailable={!inspectorDrawing}");
    expect(asideSource).toContain('aria-label="전문 픽셀 도구"');
    expect(asideSource).toContain("resolveStudioRasterToolAvailability");
    expect(asideSource).toContain("<StudioInspectorFilterLauncher");
    expect(asideSource).toContain("<StudioRasterToolRecoveryPanel");
    expect(asideSource).toContain("canToggleSelectedReference={false}");
    expect(asideSource).not.toContain("advancedFillInspectorRouteWithoutImageSelection");
  });

  it("wires one real non-destructive raster-copy action through the lazy inspector seam", () => {
    const implementation = functionBody(pageSource, "createEditableRasterCopyForInspector");

    expect(implementation).toContain('"pixel-selection"');
    expect(implementation).toContain("isStudioEditableRasterCopyPlanCurrent");
    expect(implementation).toContain("applyStudioEditableRasterCopy");
    expect(implementation).toContain("commit(applied.elements");
    expect(implementation).toContain("setSelectedId(composite.id)");
    expect(implementation).toContain("resolveStudioRasterToolResumePlan");
    expect(implementation).toContain('case "arm-retouch"');
    expect(implementation).toContain('case "start-crop"');
    expect(implementation).toContain('case "activate-selection"');
    expect(pageSource).toContain("createEditableRasterCopyForInspector,");
    expect(pageSource).toContain("studioFilterPreparationBusy={studioFilterPreparationBusy}");
    expect(pageSource).toContain("timelinePlaying={timelinePlaying}");
  });

  it.each([
    ["toggleSmudgeTool", "smudgeActive", "smudge"],
    ["toggleLiquifyTool", "liquifyActive", "liquify"],
    ["toggleDodgeBurnTool", "dodgeBurnActive", "dodge-burn"],
    ["toggleWetMixTool", "wetMixActive", "wet-mix"],
  ])(
    "lets %s exit before target validation when selection or lock state changed",
    (name, activeState, toolId) => {
      const body = functionBody(pageSource, name);
      const activeCheck = body.indexOf(`if (${activeState})`);
      const targetCheck = body.indexOf(
        `ensureOrPrepareRasterRetouchTarget("${toolId}"`,
      );

      expect(activeCheck).toBeGreaterThanOrEqual(0);
      expect(targetCheck).toBeGreaterThan(activeCheck);
    },
  );

  it.each([
    ["openSelectedLayerCrop", "crop"],
    ["toggleSmudgeTool", "smudge"],
    ["toggleLiquifyTool", "liquify"],
    ["toggleDodgeBurnTool", "dodge-burn"],
    ["toggleWetMixTool", "wet-mix"],
  ])(
    "lets %s auto-prepare a faithful page composite and resume %s",
    (name, toolId) => {
      const body = functionBody(pageSource, name);

      expect(body).toContain(`ensureOrPrepareRasterRetouchTarget("${toolId}"`);
    },
  );

  it("keeps image-only transform and frame animation off the page-composite shortcut", () => {
    const transform = functionBody(pageSource, "openPixelSelectionTransform");
    const frameAnimation = functionBody(pageSource, "openFrameAnimationForSelected");

    expect(transform).toContain('ensurePixelToolTarget("내용 변형")');
    expect(transform).not.toContain("ensureOrPrepareRasterRetouchTarget");
    expect(frameAnimation).not.toContain("ensureOrPrepareRasterRetouchTarget");
  });

  it("keeps active retouch buttons available as explicit exit controls", () => {
    expect(railSource).toContain("disabled={!smudgeActive && !rasterRetouchCanStart}");
    expect(railSource).toContain("disabled={!wetMixActive && !rasterRetouchCanStart}");
    expect(railSource).toContain("disabled={!dodgeBurnActive && !rasterRetouchCanStart}");
    expect(railSource).toContain("disabled={!liquifyActive && !rasterRetouchCanStart}");
  });
});
