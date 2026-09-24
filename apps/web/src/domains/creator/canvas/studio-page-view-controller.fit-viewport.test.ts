import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./studio-page-view-controller.ts", import.meta.url),
  "utf8",
);

describe("Studio page whole-viewport fit wiring", () => {
  it("passes the unrotated document dimensions exactly once", () => {
    const callStart = source.indexOf("setScale(fitStudioViewToViewport(");
    const callEnd = source.indexOf("));", callStart);
    const call = source.slice(callStart, callEnd);

    expect(callStart).toBeGreaterThanOrEqual(0);
    expect(callEnd).toBeGreaterThan(callStart);
    expect(call).toContain("CANVAS_W");
    expect(call).toContain("canvasH");
    expect(call).toContain("canvasRotation");
    expect(call).not.toContain("studioViewDocumentWidth");
  });
});
