import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./studio-bg3d-editor-insert-host.ts", import.meta.url),
  "utf8",
);
const qualityPolicySource = readFileSync(
  new URL("./studio-bg3d-insert-quality-policy.ts", import.meta.url),
  "utf8",
);

describe("BG3D canvas insert resolution boundary", () => {
  it("uses deterministic production pixels instead of monitor DPR", () => {
    const start = source.indexOf("async function handleInsert()");
    const end = source.indexOf("h.handleInsert = handleInsert;", start);
    const handler = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(handler).not.toContain("devicePixelRatio");
    expect(handler).not.toContain("captureDensity");
    expect(handler).toContain("resolveStudioBg3dInsertQualityPlan({");
    expect(handler).toContain("exportHeight: adapted.document.output.exportHeight");
    expect(handler).toContain("aspectRatio: captureFrame.aspectRatio");
    expect(handler).toContain("rendererMaxPixels: STUDIO_BG3D_LT_RENDER_MAX_PIXELS");
    expect(handler).toContain("requestedHeight: qualityPlan.requestedHeight");
    expect(handler).toContain("maxPixels: qualityPlan.maxPixels");
    expect(qualityPolicySource).toContain("export const STUDIO_BG3D_INSERT_MIN_HEIGHT = 2_160");
    expect(qualityPolicySource).toContain(
      "Math.max(STUDIO_BG3D_INSERT_MIN_HEIGHT, Math.round(input.exportHeight))",
    );
    expect(qualityPolicySource).not.toContain("devicePixelRatio");
  });
});
