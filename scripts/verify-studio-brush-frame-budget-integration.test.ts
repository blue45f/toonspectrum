import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const verifierSource = readFileSync(
  new URL("./verify-studio-brush-latency.mts", import.meta.url),
  "utf8",
);
const latencyPolicySource = readFileSync(
  new URL("./studio-brush-latency-policy.ts", import.meta.url),
  "utf8",
);

describe("Studio brush latency and continuous frame-budget gate integration", () => {
  it("uses one representative list for the compositor probe and continuous profiler", () => {
    expect(latencyPolicySource).toContain(
      "export const STUDIO_BRUSH_LATENCY_IDS = STUDIO_BRUSH_FRAME_BUDGET_IDS;",
    );
    expect(verifierSource).toContain("profileStudioBrushFrameBudget(page, frameRoute, {");
    expect(verifierSource).toContain("evaluateStudioBrushFrameBudget(frameBudgetMetrics)");
  });

  it("makes severe continuous-stroke regressions part of the final browser result", () => {
    expect(verifierSource).toContain(
      "&& results.every((result) => result.frameBudgetEvaluation.ok)",
    );
    expect(verifierSource).toContain(
      'kind: "toonspectrum-studio-brush-latency-browser-v2"',
    );
  });

  it("ignores optional preview failures only through the exact loopback policy", () => {
    expect(verifierSource).toContain(
      "expectedStudioBrushLatencyPreviewFailure(message, studioUrl)",
    );
    expect(verifierSource).toContain('previewUrl.hostname !== "127.0.0.1"');
    expect(verifierSource).toContain("url.origin === previewUrl.origin");
    expect(verifierSource).not.toContain('message.includes("/api/auth/session")');
  });
});
