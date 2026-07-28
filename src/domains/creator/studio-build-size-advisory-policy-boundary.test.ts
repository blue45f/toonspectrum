import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const bundleCheckSource = readFileSync(
  new URL("../../../scripts/check-studio-bundle.mjs", import.meta.url),
  "utf8",
);
const pageOrchestrationBoundarySource = readFileSync(
  new URL("./studio-page-orchestration-boundary.test.ts", import.meta.url),
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const startIndex = bundleCheckSource.indexOf(start);
  const endIndex = bundleCheckSource.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return bundleCheckSource.slice(startIndex, endIndex);
}

describe("Studio quality-first build-size policy", () => {
  it("keeps bundle bytes and request counts as observations rather than release vetoes", () => {
    expect(bundleCheckSource).toContain(
      "bundle bytes and static request counts are",
    );
    expect(bundleCheckSource).toContain(
      "telemetry, not release vetoes",
    );

    const byteBudgetBlock = sourceBetween(
      "function checkBudget(",
      "function observeCount(",
    );
    const requestCountBlock = sourceBetween(
      "function observeCount(",
      "function matchingEntries(",
    );

    expect(byteBudgetBlock).toContain("bundleObservations.push(");
    expect(requestCountBlock).toContain("bundleObservations.push(");
    expect(byteBudgetBlock).not.toContain("fail(");
    expect(requestCountBlock).not.toContain("fail(");
  });

  it("does not reintroduce an arbitrary StudioPage source-byte ceiling", () => {
    expect(pageOrchestrationBoundarySource).not.toMatch(
      /Buffer\.byteLength\(studioPageSource[\s\S]*?toBeLessThan/u,
    );
    expect(pageOrchestrationBoundarySource).toContain(
      "engine-quality work fail",
    );
  });

  it("retains structural runtime boundaries even while size growth is allowed", () => {
    expect(bundleCheckSource).toContain(
      "engine isolation and accidental eager-boundary regressions",
    );
    expect(bundleCheckSource).toContain(
      "function checkDynamicBoundary(",
    );
    expect(bundleCheckSource).toContain(
      "returned to the Studio static graph",
    );
  });
});
