import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioBrushStudio.tsx", import.meta.url),
  "utf8",
);

describe("Brush Studio goal-start integration boundary", () => {
  it("renders the goal chooser between restore status and the mobile preview", () => {
    const restore = source.indexOf("{restoreAction}");
    const goals = source.indexOf("<StudioBrushGoalStart");
    const mobilePreview = source.indexOf(
      '<div className="shrink-0 border-b border-line p-2 sm:hidden">',
    );

    expect(restore).toBeGreaterThan(-1);
    expect(goals).toBeGreaterThan(restore);
    expect(mobilePreview).toBeGreaterThan(goals);
  });

  it("applies a valid canonical preset before opening its destination section", () => {
    const start = source.indexOf("<StudioBrushGoalStart");
    const goals = source.slice(start, start + 800);

    expect(start).toBeGreaterThan(-1);
    expect(goals).toContain("activePresetId={matchedPreset}");
    expect(goals).toContain("activeSection={category}");
    expect(goals).toContain("studioBrushDynamicsPresetSelectionSettings(presetId)");
    expect(goals).toContain("onOpenSection={(section) => setCategory(section)}");
  });
});
