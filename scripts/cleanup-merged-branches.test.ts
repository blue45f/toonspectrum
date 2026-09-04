import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  classifyBranchDeletion,
  compareProvesMerged,
  encodeGitRef,
  mergedPullRequestProvesHead,
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
    mergedPullRequestHeadMatch: false,
    ...overrides,
  };
}

function mergedPull(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    merged_at: "2026-09-04T00:00:00Z",
    base: { ref: "main" },
    head: {
      ref: "feat/completed-work",
      sha: SHA,
      repo: { full_name: "blue45f/toonspectrum" },
    },
    ...overrides,
  };
}

describe("merged branch cleanup safety", () => {
  it("encodes each slash-delimited ref segment without losing hierarchy", () => {
    expect(encodeGitRef("feat/한글 + space")).toBe("feat/%ED%95%9C%EA%B8%80%20%2B%20space");
    expect(() => encodeGitRef("")).toThrow(/non-empty/u);
    expect(() => encodeGitRef("bad\0branch")).toThrow(/null/u);
  });

  it("accepts only compare results proving that default contains the branch commit", () => {
    expect(compareProvesMerged({ status: "ahead", behind_by: 0 })).toBe(true);
    expect(compareProvesMerged({ status: "identical", behind_by: 0 })).toBe(true);
    expect(compareProvesMerged({ status: "diverged", behind_by: 1 })).toBe(false);
    expect(compareProvesMerged({ status: "behind", behind_by: 2 })).toBe(false);
  });

  it("recognizes the exact head of a PR squash-merged into the default branch", () => {
    expect(mergedPullRequestProvesHead(
      mergedPull(),
      "blue45f/toonspectrum",
      "main",
      "feat/completed-work",
      SHA,
    )).toBe(true);
    expect(mergedPullRequestProvesHead(
      mergedPull({ base: { ref: "release" } }),
      "blue45f/toonspectrum",
      "main",
      "feat/completed-work",
      SHA,
    )).toBe(false);
    expect(mergedPullRequestProvesHead(
      mergedPull({
        head: {
          ref: "feat/completed-work",
          sha: "f".repeat(40),
          repo: { full_name: "blue45f/toonspectrum" },
        },
      }),
      "blue45f/toonspectrum",
      "main",
      "feat/completed-work",
      SHA,
    )).toBe(false);
    expect(mergedPullRequestProvesHead(
      mergedPull({ merged_at: null }),
      "blue45f/toonspectrum",
      "main",
      "feat/completed-work",
      SHA,
    )).toBe(false);
  });

  it("accepts both ancestry and exact merged-PR-head proofs", () => {
    expect(classifyBranchDeletion(candidate())).toEqual({
      allowed: true,
      reason: "merged-ancestor",
    });
    expect(classifyBranchDeletion(candidate({
      compare: { status: "diverged", behind_by: 2 },
      mergedPullRequestHeadMatch: true,
    }))).toEqual({
      allowed: true,
      reason: "merged-pull-request-head",
    });
  });

  it.each([
    ["default branch", { branch: "main" }, "default-branch"],
    ["active workflow branch", { branch: "ci/cleanup" }, "active-workflow-branch"],
    ["protected branch", { protectedBranch: true }, "protected-branch"],
    ["fork branch", { sameRepository: false }, "fork"],
    ["invalid sha", { currentSha: "short" }, "invalid-sha"],
    [
      "unique commits without an exact merged head",
      { compare: { status: "diverged", behind_by: 1 } },
      "unique-commits",
    ],
  ])("preserves %s", (_label, overrides, reason) => {
    expect(classifyBranchDeletion(candidate(overrides))).toEqual({ allowed: false, reason });
  });

  it("rechecks the ref, deletes it, then closes only default-branch duplicate PRs", () => {
    const source = readFileSync(new URL("./cleanup-merged-branches.mjs", import.meta.url), "utf8");
    const decision = source.indexOf("if (!decision.allowed)");
    const listPulls = source.indexOf("const openPulls = await openPullRequestsForBranch", decision);
    const preserveOtherBases = source.indexOf("const nonDefaultPulls", listPulls);
    const recheck = source.indexOf("const verifiedSha = await currentRefSha", preserveOtherBases);
    const deleteRef = source.indexOf('method: "DELETE"', recheck);
    const closePulls = source.indexOf("await reportAndMaybeClosePullRequests", deleteRef);
    expect(listPulls).toBeGreaterThan(decision);
    expect(preserveOtherBases).toBeGreaterThan(listPulls);
    expect(recheck).toBeGreaterThan(preserveOtherBases);
    expect(deleteRef).toBeGreaterThan(recheck);
    expect(closePulls).toBeGreaterThan(deleteRef);
    expect(source).toContain('reason: "open-nondefault-pull-request"');
    expect(source).toContain('reason: "head-changed-after-verification"');
    expect(source).toContain("exactMergedPullRequestForBranch");
  });
});
