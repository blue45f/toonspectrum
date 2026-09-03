import assert from "node:assert/strict";
import nodeTest from "node:test";
import { test as vitestTest } from "vitest";

const test = process.env.VITEST ? vitestTest : nodeTest;

import {
  isProtectedStudioBranchName,
  selectMergedStudioBranchCleanupCandidates,
} from "./studio-merged-branch-cleanup.mjs";

const repository = "blue45f/toonspectrum";
const branch = (name, sha, protectedBranch = false) => ({
  name,
  commit: { sha },
  protected: protectedBranch,
});
const pull = ({
  number,
  ref,
  sha,
  repo = repository,
  mergedAt = "2026-09-02T10:00:00Z",
}) => ({
  number,
  merged_at: mergedAt,
  head: { ref, sha, repo: repo ? { full_name: repo } : null },
});

test("selects only a same-repository merged PR whose recorded head still matches the branch", () => {
  const result = selectMergedStudioBranchCleanupCandidates({
    repository,
    defaultBranch: "main",
    branches: [branch("main", "a"), branch("codex/done", "b")],
    closedPulls: [pull({ number: 12, ref: "codex/done", sha: "b" })],
  });

  assert.deepEqual(result, [
    {
      branch: "codex/done",
      sha: "b",
      mergedPullNumbers: [12],
      latestMergedAt: "2026-09-02T10:00:00Z",
    },
  ]);
});

test("skips default, protected, release, hotfix, and branches with an open PR", () => {
  const branches = [
    branch("main", "main"),
    branch("protected/topic", "protected", true),
    branch("release/2026-09", "release"),
    branch("hotfix/live", "hotfix"),
    branch("codex/open", "open"),
  ];
  const closedPulls = branches.map((row, index) =>
    pull({ number: index + 1, ref: row.name, sha: row.commit.sha }),
  );
  const result = selectMergedStudioBranchCleanupCandidates({
    repository,
    defaultBranch: "main",
    branches,
    openPulls: [
      {
        head: {
          ref: "codex/open",
          sha: "open",
          repo: { full_name: repository },
        },
      },
    ],
    closedPulls,
  });

  assert.deepEqual(result, []);
});

test("does not delete a branch that advanced after its pull request merged", () => {
  const result = selectMergedStudioBranchCleanupCandidates({
    repository,
    defaultBranch: "main",
    branches: [branch("codex/reused", "new-head")],
    closedPulls: [pull({ number: 8, ref: "codex/reused", sha: "merged-head" })],
  });

  assert.deepEqual(result, []);
});

test("ignores closed but unmerged pull requests and fork heads", () => {
  const result = selectMergedStudioBranchCleanupCandidates({
    repository,
    defaultBranch: "main",
    branches: [branch("codex/closed", "a"), branch("codex/fork", "b")],
    closedPulls: [
      pull({ number: 1, ref: "codex/closed", sha: "a", mergedAt: null }),
      pull({ number: 2, ref: "codex/fork", sha: "b", repo: "someone/fork" }),
    ],
  });

  assert.deepEqual(result, []);
});

test("deduplicates evidence and returns branch names in deterministic order", () => {
  const result = selectMergedStudioBranchCleanupCandidates({
    repository,
    defaultBranch: "main",
    branches: [branch("qa/z", "z"), branch("codex/a", "a")],
    closedPulls: [
      pull({ number: 9, ref: "qa/z", sha: "z", mergedAt: "2026-09-02T09:00:00Z" }),
      pull({ number: 3, ref: "codex/a", sha: "a", mergedAt: "2026-09-02T08:00:00Z" }),
      pull({ number: 4, ref: "codex/a", sha: "a", mergedAt: "2026-09-02T10:00:00Z" }),
    ],
  });

  assert.deepEqual(result.map((candidate) => candidate.branch), ["codex/a", "qa/z"]);
  assert.deepEqual(result[0].mergedPullNumbers, [3, 4]);
  assert.equal(result[0].latestMergedAt, "2026-09-02T10:00:00Z");
});

test("protected-name policy is explicit and does not suppress ordinary feature branches", () => {
  assert.equal(isProtectedStudioBranchName("main"), true);
  assert.equal(isProtectedStudioBranchName("release/v1"), true);
  assert.equal(isProtectedStudioBranchName("hotfix"), true);
  assert.equal(isProtectedStudioBranchName("codex/studio-feature"), false);
  assert.equal(isProtectedStudioBranchName("qa/studio-matrix"), false);
});
