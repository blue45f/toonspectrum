import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Studio native live-surface quality integration", () => {
  it("lets only a native-DPR Canvas overlay with a successful begin own the draft", () => {
    const page = source("./StudioPage.tsx");
    const start = page.slice(
      page.indexOf("const overlayCandidate ="),
      page.indexOf("const predictionTailEligible ="),
    );

    expect(start).toContain(
      "liveInkOverlayRendererRef.current.isNativeSurfaceReady",
    );
    expect(start).toContain("let liveInkOverlayStarted = false");
    expect(start).toContain(
      "liveInkOverlayStarted = causalPostCorrectionEligible",
    );
    expect(start).toMatch(
      /const direct =\s*pixelDirect\s*\|\| liveInkOverlayStarted\s*\|\| wetInkOverlayStarted\s*\|\| gpuPin\s*\|\| dynamicBrushDirect;/,
    );
    expect(start).not.toContain(
      "const direct = pixelDirect || overlayCandidate || gpuPin",
    );
  });

  it("does not admit prediction or block the exact dynamic fallback from a mere candidate", () => {
    const page = source("./StudioPage.tsx");
    const start = page.slice(
      page.indexOf("const overlayCandidate ="),
      page.indexOf("armTransientPenInkSurfaces({"),
    );

    expect(start).toContain("&& !liveInkOverlayStarted");
    expect(start).toContain("&& liveInkOverlayStarted");
    expect(start).not.toContain("&& overlayDirect");
  });
});
