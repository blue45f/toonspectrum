import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./studio-bg3d-editor-insert-host.ts", import.meta.url),
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
    expect(handler).toContain("Math.max(2160, Math.round(adapted.document.output.exportHeight))");
    expect(handler).toContain("requestedHeight: requestedCaptureHeight");
    expect(handler).toContain("STUDIO_BG3D_LT_RENDER_MAX_PIXELS");
  });
});
