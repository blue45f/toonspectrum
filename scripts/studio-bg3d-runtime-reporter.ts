import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { FullConfig, FullResult, Reporter, Suite } from "@playwright/test/reporter";

export const BG3D_ROTATION_TEST_TITLE =
  "WebGPU 기즈모 연속 회전은 이전 실루엣을 누적하지 않는다";

export interface Bg3dRuntimeCaseEvidence {
  readonly title: string;
  readonly expectedStatus: string;
  readonly outcome: string;
  readonly results: readonly { readonly status: string }[];
}

/** A green process is not evidence when the WebGPU adapter caused the only test to skip. */
export function judgeBg3dRuntimeEvidence(
  runStatus: string,
  tests: readonly Bg3dRuntimeCaseEvidence[],
): { readonly passed: boolean; readonly reasons: readonly string[] } {
  const reasons: string[] = [];
  if (runStatus !== "passed") reasons.push(`Playwright run status: ${runStatus}`);
  const rotationTests = tests.filter((item) => item.title === BG3D_ROTATION_TEST_TITLE);
  if (rotationTests.length !== 1) {
    reasons.push(`Expected one rotation regression, collected ${rotationTests.length}`);
  }
  for (const item of tests) {
    if (item.expectedStatus !== "passed") {
      reasons.push(`${item.title}: expected status must remain passed (${item.expectedStatus})`);
    }
    if (item.outcome !== "expected") {
      reasons.push(`${item.title}: outcome ${item.outcome}`);
    }
    if (item.results.length !== 1 || item.results[0]?.status !== "passed") {
      reasons.push(`${item.title}: requires one real passing attempt, got ${
        item.results.map((result) => result.status).join(", ") || "no attempts"
      }`);
    }
  }
  return { passed: reasons.length === 0, reasons };
}

/**
 * Applied only to the dedicated production WebGPU gate. Ordinary local suites may still skip an
 * unavailable adapter. This gate instead records unavailable as a failed verification, without
 * relabelling it as a demonstrated renderer defect or silently falling back to WebGL2.
 */
export default class StudioBg3dRuntimeReporter implements Reporter {
  private suite: Suite | null = null;

  onBegin(_config: FullConfig, suite: Suite): void {
    this.suite = suite;
  }

  onEnd(result: FullResult): { status: FullResult["status"] } {
    const tests: Bg3dRuntimeCaseEvidence[] = (this.suite?.allTests() ?? []).map((item) => ({
      title: item.title,
      expectedStatus: item.expectedStatus,
      outcome: item.outcome(),
      results: item.results.map((attempt) => ({ status: attempt.status })),
    }));
    const verdict = judgeBg3dRuntimeEvidence(result.status, tests);
    try {
      const outputDirectory = path.resolve("test-results");
      mkdirSync(outputDirectory, { recursive: true });
      writeFileSync(
        path.join(outputDirectory, "bg3d-runtime-verdict.json"),
        `${JSON.stringify({ runStatus: result.status, ...verdict, tests }, null, 2)}\n`,
      );
    } catch (error) {
      // Reporter exceptions are swallowed by Playwright. Explicitly fail when evidence cannot be saved.
      console.error("[bg3d-runtime] Could not persist verification evidence", error);
      return { status: "failed" };
    }
    if (!verdict.passed) {
      console.error(`[bg3d-runtime] Verification not completed:\n${verdict.reasons.join("\n")}`);
      return { status: "failed" };
    }
    console.info("[bg3d-runtime] Rotation test executed and passed; no skips or retries accepted.");
    return { status: result.status };
  }
}
