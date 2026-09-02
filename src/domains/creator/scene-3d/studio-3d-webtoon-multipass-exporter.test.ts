import { describe, expect, it } from "vitest";

import {
  planMultiPassExport,
  WEBTOON_RENDER_PASSES,
  type MultiPassExportConfig,
} from "./studio-3d-webtoon-multipass-exporter";

describe("Studio 3D Webtoon Multi-Pass Layer Auto-Split Engine", () => {
  it("provides 7 specialized webtoon rendering passes with proper layer blend modes", () => {
    expect(WEBTOON_RENDER_PASSES.length).toBe(7);
    const lineArt = WEBTOON_RENDER_PASSES.find((p) => p.kind === "line-art");
    expect(lineArt?.layerName).toContain("선화");

    const shadow = WEBTOON_RENDER_PASSES.find((p) => p.kind === "shadow-ambient");
    expect(shadow?.blendMode).toBe("multiply");

    const highlight = WEBTOON_RENDER_PASSES.find((p) => p.kind === "specular-highlight");
    expect(highlight?.blendMode).toBe("screen");
  });

  it("plans a multi-pass export session with active passes and estimated file size", () => {
    const config: MultiPassExportConfig = {
      resolutionWidth: 1920,
      resolutionHeight: 1080,
      transparentBackground: true,
      includeLineArt: true,
      includeFlatColor: true,
      includeShadow: true,
      includeHighlight: true,
      includeDepthMap: false,
      includeObjectIdMask: true,
      format: "png-zip",
    };

    const planned = planMultiPassExport(config);
    expect(planned.totalPasses).toBe(5);
    expect(planned.activePasses.some((p) => p.kind === "line-art")).toBe(true);
    expect(planned.activePasses.some((p) => p.kind === "depth-map")).toBe(false);
    expect(planned.estimatedFileSizeMb).toBeGreaterThan(0.5);
  });
});
