import { describe, expect, it } from "vitest";

import {
  assertReplacementClaimAllowed,
  evaluateCapabilityClaim,
} from "../graph/capability-ledger";

const requiredChecks = [
  "permission",
  "undo-redo",
  "autosave",
  "crash-recovery",
  "reopen",
  "offline",
  "sync",
  "conflict",
  "export",
  "performance-slo",
  "accessibility",
  "security",
  "unit",
  "integration",
  "golden",
  "e2e",
  "real-device",
  "expert-validation",
] as const;

function entry() {
  return {
    id: "vector-ink",
    userProblem: "Draw and edit production-quality webtoon line art.",
    referenceProducts: ["Clip Studio Paint"],
    surfaces: ["/studio/:projectId/episodes/:episodeId/2d/:artifactId"],
    domainOwner: "studio-2d",
    documentObjects: ["VectorStroke", "VectorLayer"],
    requiredChecks: [...requiredChecks],
    passedChecks: [...requiredChecks],
    performanceSlos: ["50k strokes remain interactive"],
    evidence: [{ kind: "test", path: "tests/vector-ink.golden.ts" }],
    remainingGaps: [],
    status: "equivalent",
  } as const;
}

describe("Capability Ledger claim gate", () => {
  it("allows a claim only when status, checks, evidence and gaps all pass", () => {
    expect(evaluateCapabilityClaim(entry())).toEqual({
      allowed: true,
      missingChecks: [],
      reasons: [],
    });
    expect(() => assertReplacementClaimAllowed([entry()])).not.toThrow();
  });

  it("blocks marketing claims when evidence or required checks are missing", () => {
    const incomplete = {
      ...entry(),
      evidence: [],
      passedChecks: requiredChecks.filter((check) => check !== "real-device"),
    };
    const result = evaluateCapabilityClaim(incomplete);
    expect(result.allowed).toBe(false);
    expect(result.missingChecks).toEqual(["real-device"]);
    expect(result.reasons).toContain("no evidence artifact");
    expect(() => assertReplacementClaimAllowed([incomplete])).toThrow(/replacement claim blocked/u);
  });
});
