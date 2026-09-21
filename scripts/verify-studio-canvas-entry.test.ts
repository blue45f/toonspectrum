import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
describe("production canvas diagnostic entry", () => {
  it.each(["./verify-studio-canvas-chrome.mts", "./verify-studio-canvas-surfaces.mts"])("opens the drawing route rather than testing the workspace home in %s", (file) => {
    const verifier = source(file);
    expect(verifier).toContain('const studioUrl = `${origin}studio/canvas`;');
    expect(verifier).not.toContain('const studioUrl = `${origin}studio`;');
    expect(verifier).toContain('await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });');
    expect(verifier).toContain('[data-studio-canvas-viewport]');
  });
  it("keeps canvas chrome and save-state reachability assertions", () => {
    const verifier = source("./verify-studio-canvas-chrome.mts");
    for (const condition of ["!metrics.reliabilityIdleRowPresent", "!metrics.reliabilityRailInFlow", "metrics.reliabilityChipPresent", "mobile.metrics.noticeStripFlowHeight === 0"])
      expect(verifier).toContain(condition);
  });
  it("retains all DPR, allocation and tool-transition checks", () => {
    const verifier = source("./verify-studio-canvas-surfaces.mts");
    expect(verifier).toContain("STUDIO_CANVAS_SURFACE_MAX_BACKING_PIXEL_RATIO = 20.5");
    expect(verifier).toContain("STUDIO_CANVAS_SURFACE_TOOL_TRANSITION_CYCLES = 3");
    for (const dpr of ["dpr-1", "dpr-1.5", "dpr-2"]) expect(verifier).toContain(dpr);
    expect(verifier).toContain("await waitForStableHydratedEditor(page)");
    expect(verifier).toContain("await exerciseToolTransitions(page)");
    expect(verifier).toContain("collectStudioCanvasSurfaceContractFailures");
  });
});
