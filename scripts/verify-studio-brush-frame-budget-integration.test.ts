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
      'kind: "toonspectrum-studio-brush-latency-browser-v3"',
    );
  });

  it("runs the explicit 272-case competitive matrix and hard-fails incomplete coverage", () => {
    expect(verifierSource).toContain('const COMPETITIVE_LONG_STROKE_FLAG = "--competitive-long-stroke";');
    expect(verifierSource).toContain("STUDIO_BRUSH_COMPETITIVE_EXECUTION_CASES");
    expect(verifierSource).toContain("evaluateStudioBrushCompetitiveCoverage");
    expect(verifierSource).toContain("coverageComplete: competitiveLongStroke && competitiveCoverage.ok");
    expect(verifierSource).toContain("(!competitiveLongStroke || competitiveCoverage.ok)");
    expect(verifierSource).toContain("requestedDeviceScaleFactor: executionCase.deviceScaleFactor");
  });

  it("makes long-session history/cache/parity receipts mandatory in full mode", () => {
    expect(verifierSource).toContain("runCompetitiveLongSessionResourceProbe");
    expect(verifierSource).toContain("STUDIO_BRUSH_COMPETITIVE_LONG_SESSION_COMMIT_COUNTS");
    expect(verifierSource).toContain("longSessionCoverageComplete");
    expect(verifierSource).toContain("(!competitiveLongStroke || longSessionCoverage.ok)");
  });

  it("keeps historical timing results as telemetry that cannot control exit status", () => {
    expect(verifierSource).toContain("legacyTelemetryOnly: true");
    expect(verifierSource).toContain("legacyLatencyTelemetry");
    expect(verifierSource).not.toContain("results.every((result) => result.evaluation.ok)");
    expect(verifierSource).toContain("results.every((result) => result.frameBudgetEvaluation.ok)");
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
