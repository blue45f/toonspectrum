import { describe, it, expect } from "vitest";
import { StudioFilterSplitPreview } from "./studio-filter-split-preview";

describe("StudioFilterSplitPreview", () => {
  it("initializes with default split-slider mode and 50% position", () => {
    const preview = new StudioFilterSplitPreview();
    const config = preview.getConfig();

    expect(config.mode).toBe("split-slider");
    expect(config.splitPosition).toBe(0.5);
    expect(preview.getSplitGuidePixelX(1000)).toBe(500);
  });

  it("calculates original area correctly in split-slider mode", () => {
    const preview = new StudioFilterSplitPreview("split-slider");
    preview.setSplitPosition(0.4);

    expect(preview.isOriginalArea(0.3)).toBe(true);  // left of 0.4 -> original
    expect(preview.isOriginalArea(0.5)).toBe(false); // right of 0.4 -> filtered
  });

  it("handles side-by-side mode comparison", () => {
    const preview = new StudioFilterSplitPreview("side-by-side");
    expect(preview.isOriginalArea(0.2)).toBe(true);
    expect(preview.isOriginalArea(0.7)).toBe(false);
  });

  it("supports hold-to-compare override", () => {
    const preview = new StudioFilterSplitPreview("split-slider");
    preview.setSplitPosition(0.2);

    expect(preview.isOriginalArea(0.8)).toBe(false);
    preview.setHoldState(true);
    expect(preview.isOriginalArea(0.8)).toBe(true); // holding -> force original
  });

  it("clamps split position between 0 and 1", () => {
    const preview = new StudioFilterSplitPreview();
    preview.setSplitPosition(-0.5);
    expect(preview.getConfig().splitPosition).toBe(0);

    preview.setSplitPosition(1.5);
    expect(preview.getConfig().splitPosition).toBe(1);
  });
});
