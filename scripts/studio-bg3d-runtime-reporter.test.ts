import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BG3D_ROTATION_TEST_TITLE,
  judgeBg3dRuntimeEvidence,
  type Bg3dRuntimeCaseEvidence,
} from "./studio-bg3d-runtime-reporter";

const passingCase: Bg3dRuntimeCaseEvidence = {
  title: BG3D_ROTATION_TEST_TITLE,
  expectedStatus: "passed",
  outcome: "expected",
  results: [{ status: "passed" }],
};

describe("BG3D runtime verification verdict", () => {
  it("accepts one real successful execution", () => {
    expect(judgeBg3dRuntimeEvidence("passed", [passingCase])).toEqual({
      passed: true,
      reasons: [],
    });
  });

  it("rejects a green run in which WebGPU was unavailable and the test skipped", () => {
    const verdict = judgeBg3dRuntimeEvidence("passed", [{
      ...passingCase,
      expectedStatus: "skipped",
      outcome: "skipped",
      results: [{ status: "skipped" }],
    }]);
    expect(verdict.passed).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("skipped");
  });

  it("rejects an empty suite", () => {
    expect(judgeBg3dRuntimeEvidence("passed", []).passed).toBe(false);
  });

  it("rejects a matching test that was collected but never ran", () => {
    expect(judgeBg3dRuntimeEvidence("passed", [{
      ...passingCase,
      results: [],
    }]).passed).toBe(false);
  });

  it("rejects another passing test in place of the actual rotation regression", () => {
    expect(judgeBg3dRuntimeEvidence("passed", [{
      ...passingCase,
      title: "an unrelated WebGL2 test",
    }]).passed).toBe(false);
  });

  it("rejects duplicated rotation cases rather than hiding configuration drift", () => {
    expect(judgeBg3dRuntimeEvidence("passed", [passingCase, passingCase]).passed).toBe(false);
  });

  it("rejects expected-failure annotations", () => {
    expect(judgeBg3dRuntimeEvidence("passed", [{
      ...passingCase,
      expectedStatus: "failed",
      results: [{ status: "failed" }],
    }]).passed).toBe(false);
  });

  it("does not turn a successful retry into a clean pass", () => {
    expect(judgeBg3dRuntimeEvidence("passed", [{
      ...passingCase,
      outcome: "flaky",
      results: [{ status: "failed" }, { status: "passed" }],
    }]).passed).toBe(false);
  });

  it.each(["failed", "timedout", "interrupted"])(
    "preserves unsuccessful run status %s even when the rotation case passed",
    (status) => {
      expect(judgeBg3dRuntimeEvidence(status, [passingCase]).passed).toBe(false);
    },
  );

  it("rejects another selected test that failed", () => {
    expect(judgeBg3dRuntimeEvidence("passed", [passingCase, {
      ...passingCase,
      title: "another runtime assertion",
      outcome: "unexpected",
      results: [{ status: "failed" }],
    }]).passed).toBe(false);
  });
});

describe("BG3D production verification configuration", () => {
  const source = readFileSync(
    new URL("../playwright.bg3d-runtime.config.ts", import.meta.url),
    "utf8",
  );

  it("requires a real build and starts a fresh preview, not a Vite dev graph", () => {
    expect(source).toContain('existsSync("dist/index.html")');
    expect(source).toContain("pnpm exec vite preview");
    expect(source).toContain("reuseExistingServer: false");
    expect(source).not.toContain("tools/browser-harnesses/hybrid-dcc-e2e.html");
  });

  it("retains evidence even when the browser test skips before the reporter fails it", () => {
    expect(source).toContain("retries: 0");
    expect(source).toContain('mode: "on"');
    expect(source).toContain("screenshots: false");
    expect(source).toContain('screenshot: "only-on-failure"');
    expect(source).toContain('outputFolder: "playwright-report/bg3d-runtime"');
    expect(source).toContain('"./scripts/studio-bg3d-runtime-reporter.ts"');
    expect(source).toContain('globalSetup: "./scripts/studio-bg3d-runtime-setup.mts"');
  });
});
