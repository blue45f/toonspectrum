import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

describe("Studio deferred stroke postprocess entry boundary", () => {
  it("runs only inside the existing deferred commit window", () => {
    const queueCommitIndex = studioPageSource.indexOf("queueDeferredStrokeCommit(finished);");
    const queueWorkerIndex = studioPageSource.indexOf("queueDeferredStrokePostprocess(", queueCommitIndex);
    const immediateBranchIndex = studioPageSource.indexOf("} else {", queueCommitIndex);

    expect(queueCommitIndex).toBeGreaterThan(0);
    expect(queueWorkerIndex).toBeGreaterThan(queueCommitIndex);
    expect(immediateBranchIndex).toBeGreaterThan(queueWorkerIndex);
    expect(studioPageSource).toContain(
      'if (deferredPostprocessPlan && releasePlan.commitMode !== "deferred")',
    );
    expect(studioPageSource).toContain("releasePlan = planRelease(releasePostCorrectionStrength);");
  });

  it("keeps timeout, stale-result, abort, and unchanged-stroke fallbacks at the entry", () => {
    expect(studioPageSource).toContain("STUDIO_DEFERRED_STROKE_POSTPROCESS_TIMEOUT_MS");
    expect(studioPageSource).toContain("replaceStudioPendingStrokePostprocess(");
    expect(studioPageSource).toContain("abortDeferredStrokePostprocess(");
    expect(studioPageSource).toContain(
      "the unchanged authoritative stroke remains in the pending batch",
    );
  });
});
