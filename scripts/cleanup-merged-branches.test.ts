import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  classifyBranchDeletion,
  compareProvesMerged,
  encodeGitRef,
} from "./cleanup-merged-branches.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    branch: "feat/completed-work",
    defaultBranch: "main",
    workflowBranch: "ci/cleanup",
    protectedBranch: false,
    sameRepository: true,
    currentSha: SHA,
    compare: { status: "ahead", ahead_by: 3, behind_by: 0 },
    ...overrides,
  };
}

describe("merged branch cleanup safety", () => {
  it("encodes each slash-delimited ref segment without losing hierarchy", () => {
    expect(encodeGitRef("feat/한글 + space")).toBe("feat/%ED%95%9C%EA%B8%80%20%2B%20space");
    expect(() => encodeGitRef("")).toThrow(/non-empty/u);
    expect(() => encodeGitRef("bad\0branch")).toThrow(/null/u);
  });

  it("accepts only compare results proving that default contains the branch", () => {
    expect(compareProvesMerged({ status: "ahead", behind_by: 0 })).toBe(true);
    expect(compareProvesMerged({ status: "identical", behind_by: 0 })).toBe(true);
    expect(compareProvesMerged({ status: "diverged", behind_by: 1 })).toBe(false);
    expect(compareProvesMerged({ status: "behind", behind_by: 2 })).toBe(false);
  });

  it("deletes an ordinary same-repository branch already contained in main", () => {
    expect(classifyBranchDeletion(candidate())).toEqual({ allowed: true, reason: "merged" });
  });

  it.each([
    ["default branch", { branch: "main" }, "default-branch"],
    ["active workflow branch", { branch: "ci/cleanup" }, "active-workflow-branch"],
    ["protected branch", { protectedBranch: true }, "protected-branch"],
    ["fork branch", { sameRepository: false }, "fork"],
    ["invalid sha", { currentSha: "short" }, "invalid-sha"],
    ["unique commits", { compare: { status: "diverged", behind_by: 1 } }, "unique-commits"],
  ])("preserves %s", (_label, overrides, reason) => {
    expect(classifyBranchDeletion(candidate(overrides))).toEqual({ allowed: false, reason });
  });

  it("rechecks the remote ref before closing a stale PR or deleting its branch", () => {
    const source = readFileSync(new URL("./cleanup-merged-branches.mjs", import.meta.url), "utf8");
    const decision = source.indexOf("if (!decision.allowed)");
    const recheck = source.indexOf("const verifiedSha = await currentRefSha", decision);
    const closePulls = source.indexOf("await closeIntegratedPullRequests", decision);
    const deleteRef = source.indexOf('method: "DELETE"', closePulls);
    expect(recheck).toBeGreaterThan(decision);
    expect(closePulls).toBeGreaterThan(recheck);
    expect(deleteRef).toBeGreaterThan(closePulls);
    expect(source).toContain('reason: "head-changed-after-verification"');
  });
});
