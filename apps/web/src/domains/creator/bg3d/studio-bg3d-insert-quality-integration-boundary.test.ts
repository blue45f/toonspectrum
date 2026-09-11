import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./studio-bg3d-editor-insert-host.ts", import.meta.url),
  "utf8",
);

describe("BG3D production insert quality integration", () => {
  it("delegates sizing to the deterministic quality authority", () => {
    const start = source.indexOf("async function handleInsert");
    const end = source.indexOf("h.handleInsert = handleInsert;", start);
    const handler = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(handler).toContain("resolveStudioBg3dInsertQualityPlan({");
    expect(handler).toContain("exportHeight: adapted.document.output.exportHeight");
    expect(handler).toContain("aspectRatio: captureFrame.aspectRatio");
    expect(handler).toContain("requestedHeight: qualityPlan.requestedHeight");
    expect(handler).toContain("maxPixels: qualityPlan.maxPixels");
    expect(handler).not.toContain("devicePixelRatio");
    expect(handler).not.toContain("requestedCaptureHeight");
  });
});
