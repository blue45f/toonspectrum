import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const runner = readFileSync(
  new URL("./verify-studio-hokusai-live-brush.mjs", import.meta.url),
  "utf8",
);
const browserEntry = readFileSync(
  new URL("./studio-hokusai-live-brush-quality-browser.ts", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(readFileSync(
  new URL("../package.json", import.meta.url),
  "utf8",
)) as { scripts?: Record<string, string> };

describe("Hokusai live real-browser quality gate", () => {
  it("runs the production Dedicated Worker/WASM provider rather than a fake protocol", () => {
    expect(packageJson.scripts?.["verify:studio-hokusai-live-brush"])
      .toBe("node scripts/verify-studio-hokusai-live-brush.mjs");
    expect(runner).toContain('import { chromium } from "playwright"');
    expect(browserEntry).toContain("new StudioHokusaiLiveBrushProvider");
    expect(browserEntry).toContain("provider.prewarm()");
    expect(browserEntry).toContain("provider.beginStroke");
    expect(browserEntry).not.toMatch(/Fake|Mock/gu);
  });

  it("gates 5k multi-batch backpressure, parity, cancellation and visual evidence", () => {
    expect(browserEntry).toContain("const SAMPLE_COUNT = 5_000");
    expect(browserEntry).toContain("const BATCH_SIZE = 250");
    expect(browserEntry).toContain("browserComposedExactCanonical");
    expect(browserEntry).toContain("liveMaterialQualityMetrics");
    expect(browserEntry).toContain("materialFamilies");
    expect(browserEntry).toContain('cancelled.cancel("user-cancelled")');
    expect(runner).toContain("stalePresentationsCoalesced");
    expect(runner).toContain("totalTransferredBytes > 32 * 1024 * 1024");
    expect(browserEntry).toContain('mainThreadDelayTracker.setPhase("interactive-5k")');
    expect(browserEntry).toContain("frameCallbackMaximumMilliseconds");
    expect(browserEntry).toContain("workerRoundTripAndCanonicalMilliseconds");
    expect(runner).toContain("interactiveDelay.maximumDelayMilliseconds > 20");
    expect(runner).toContain("timing.framePresentationMaximumMilliseconds > 20");
    expect(runner).toContain("first-live-frame.png");
    expect(runner).toContain("final-live-composition.png");
    expect(runner).toContain("final-canonical-png.png");
    expect(runner).toContain("material-family-canonical.png");
    expect(runner).toContain("metrics.periodicity > 0.55");
    expect(runner).toContain("metrics.startBackMassRatio > 0.35");
    expect(runner).toContain("oil bristle ridges are not measurably separated");
  });
});
