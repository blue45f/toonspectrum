import { describe, it, expect } from "vitest";

import { Studio3DToonPassPipeline } from "./studio-3d-toon-pass-pipeline";

describe("Studio3DToonPassPipeline", () => {
  it("initializes standard toon profile with active passes", () => {
    const pipeline = new Studio3DToonPassPipeline();
    const passes = pipeline.getActivePassTypes();
    expect(passes).toContain("beauty");
    expect(passes).toContain("line-art");
    expect(passes).toContain("shadow-ao");
    expect(passes).toContain("depth");
    expect(passes).toContain("object-id");
  });

  it("toggles pass enablement and adjusts thickness", () => {
    const pipeline = new Studio3DToonPassPipeline();
    pipeline.togglePass("depth", false);
    expect(pipeline.getActivePassTypes()).not.toContain("depth");

    pipeline.setOutlineThickness(2.5);
    expect(pipeline.getProfile().outlineThickness).toBe(2.5);
  });

  it("generates PSD layer manifest", () => {
    const pipeline = new Studio3DToonPassPipeline();
    const manifest = pipeline.generatePsdLayerManifest();
    expect(manifest.length).toBe(5);
    expect(manifest.find((m) => m.type === "line-art")?.name).toBe("Line Ink Layer");
  });
});
