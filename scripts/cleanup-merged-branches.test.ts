import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyBranchDeletion,
  compareProvesMerged,
  encodeGitRef,
  main,
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

});

const REPOSITORY = "blue45f/toonspectrum";
const BRANCH = "topic/기반+candidate";
const REPOSITORY_PATH = `/repos/${REPOSITORY}`;
const ENV = {
  GITHUB_TOKEN: "test-token",
  GITHUB_REPOSITORY: REPOSITORY,
  GITHUB_REF_NAME: "ci/cleanup",
};

interface MockReply {
  body: unknown;
  status?: number;
}

interface CleanupReport {
  dryRun: boolean;
  deleted: Array<{ branch: string; sha: string; applied: boolean }>;
  closedPullRequests: Array<{ number: number; applied: boolean }>;
  skipped: Array<{ branch: string; reason: string; pullRequests?: number[] }>;
}

function duplicateHeadPull(base = "main") {
  return {
    number: 84,
    state: "open",
    html_url: `https://github.com/${REPOSITORY}/pull/84`,
    head: { ref: BRANCH, sha: SHA, repo: { full_name: REPOSITORY } },
    base: { ref: base },
  };
}

function dependentPull() {
  return {
    number: 73,
    state: "open",
    draft: true,
    head: { ref: "feature/child", repo: { full_name: "contributor/fork" } },
    base: { ref: BRANCH, repo: { full_name: REPOSITORY } },
  };
}

function mockCleanupGithub(options: {
  baseReplies?: MockReply[];
  headPulls?: unknown[];
  currentSha?: string;
} = {}) {
  const requests: Array<{ method: string; path: string; base: string | null; body: unknown }> = [];
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  const baseReplies = options.baseReplies ?? [{ body: [] }, { body: [] }];
  let baseReads = 0;
  const branch = { name: BRANCH, commit: { sha: SHA }, protected: false };
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.origin).toBe("https://api.github.com");
    const path = decodeURIComponent(url.pathname);
    const method = init?.method ?? "GET";
    requests.push({
      method,
      path,
      base: url.searchParams.get("base"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (method === "GET") {
      if (path === REPOSITORY_PATH) return Response.json({ default_branch: "main" });
      if (path === `${REPOSITORY_PATH}/branches`) return Response.json([branch]);
      if (path === `${REPOSITORY_PATH}/branches/${BRANCH}`) return Response.json(branch);
      if (path === `${REPOSITORY_PATH}/pulls/42`) {
        return Response.json({
          ...mergedPull(),
          merged: true,
          head: { ref: BRANCH, sha: SHA, repo: { full_name: REPOSITORY } },
        });
      }
      if (path === `${REPOSITORY_PATH}/compare/${SHA}...main`) {
        return Response.json({ status: "ahead", ahead_by: 3, behind_by: 0 });
      }
      if (path === `${REPOSITORY_PATH}/git/ref/heads/${BRANCH}`) {
        return Response.json({ object: { sha: options.currentSha ?? SHA } });
      }
      if (path === `${REPOSITORY_PATH}/pulls`) {
        expect(url.searchParams.get("state")).toBe("open");
        if (url.searchParams.has("base")) {
          expect(url.searchParams.get("base")).toBe(BRANCH);
          expect(url.searchParams.has("head")).toBe(false);
          const reply = baseReplies[baseReads++] ?? { body: [] };
          return Response.json(reply.body, { status: reply.status ?? 200 });
        }
        expect(url.searchParams.get("head")).toBe(`blue45f:${BRANCH}`);
        return Response.json(options.headPulls ?? []);
      }
    }
    if (method === "DELETE" && path === `${REPOSITORY_PATH}/git/refs/heads/${BRANCH}`) {
      return new Response(null, { status: 204 });
    }
    if (method === "POST" && path === `${REPOSITORY_PATH}/issues/84/comments`) {
      return Response.json({ id: 1000 });
    }
    if (method === "PATCH" && path === `${REPOSITORY_PATH}/pulls/84`) {
      return Response.json({ ...duplicateHeadPull(), state: "closed" });
    }
    throw new Error(`Unexpected GitHub request: ${method} ${url}`);
  }));
  return {
    requests,
    baseReads: () => baseReads,
    mutations: () => requests.filter((request) => request.method !== "GET"),
    report: () => JSON.parse(String(output.mock.calls.at(-1)?.[0])) as CleanupReport,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("merged branch cleanup GitHub behavior", () => {
  it.each([
    { mode: "all", apply: false },
    { mode: "all", apply: true },
    { mode: "pr", apply: false },
    { mode: "pr", apply: true },
  ])("preserves an open draft PR base in $mode mode (apply: $apply)", async ({ mode, apply }) => {
    const github = mockCleanupGithub({ baseReplies: [{ body: [dependentPull()] }] });
    const args = mode === "all" ? ["--all"] : ["--pr", "42"];
    await main(apply ? [...args, "--apply"] : args, ENV);
    expect(github.report()).toMatchObject({
      dryRun: !apply,
      deleted: [],
      closedPullRequests: [],
      skipped: [{ branch: BRANCH, reason: "open-pull-request-base", pullRequests: [73] }],
    });
    expect(github.baseReads()).toBe(1);
    expect(github.mutations()).toEqual([]);
  });

  it("preserves a branch when a dependent PR appears after the initial lookup", async () => {
    const github = mockCleanupGithub({
      baseReplies: [{ body: [] }, { body: [dependentPull()] }],
      headPulls: [duplicateHeadPull()],
    });
    await main(["--all", "--apply"], ENV);
    expect(github.baseReads()).toBe(2);
    expect(github.requests.some((request) => request.path.endsWith(`/git/ref/heads/${BRANCH}`))).toBe(true);
    expect(github.report()).toMatchObject({
      deleted: [],
      closedPullRequests: [],
      skipped: [{ branch: BRANCH, reason: "open-pull-request-base", pullRequests: [73] }],
    });
    expect(github.mutations()).toEqual([]);
  });

  it.each([
    { label: "an API failure", reply: { status: 500, body: { message: "unavailable" } }, error: /failed: 500/u },
    { label: "a malformed list", reply: { body: { unexpected: "not an array" } }, error: /Expected paginated array/u },
  ])("does not delete or close PRs after $label during the final base lookup", async ({ reply, error }) => {
    const github = mockCleanupGithub({
      baseReplies: [{ body: [] }, reply],
      headPulls: [duplicateHeadPull()],
    });
    await expect(main(["--all", "--apply"], ENV)).rejects.toThrow(error);
    expect(github.baseReads()).toBe(2);
    expect(github.mutations()).toEqual([]);
  });

  it.each([false, true])("rechecks both authorities and preserves duplicate-head policy (apply: %s)", async (apply) => {
    const github = mockCleanupGithub({ headPulls: [duplicateHeadPull()] });
    await main(apply ? ["--all", "--apply"] : ["--all"], ENV);
    expect(github.baseReads()).toBe(2);
    expect(github.report()).toMatchObject({
      dryRun: !apply,
      skipped: [],
      deleted: [{ branch: BRANCH, sha: SHA, applied: apply }],
      closedPullRequests: [{ number: 84, applied: apply }],
    });
    if (!apply) {
      expect(github.mutations()).toEqual([]);
      return;
    }
    expect(github.mutations()).toMatchObject([
      { method: "DELETE", path: `${REPOSITORY_PATH}/git/refs/heads/${BRANCH}` },
      { method: "POST", path: `${REPOSITORY_PATH}/issues/84/comments` },
      { method: "PATCH", path: `${REPOSITORY_PATH}/pulls/84`, body: { state: "closed" } },
    ]);
    const deleteIndex = github.requests.findIndex((request) => request.method === "DELETE");
    expect(github.requests.findLastIndex((request) => request.base === BRANCH)).toBeLessThan(deleteIndex);
    expect(github.requests.findIndex((request) => request.path.endsWith(`/git/ref/heads/${BRANCH}`))).toBeLessThan(deleteIndex);
  });

  it("still preserves a candidate whose own open PR targets a nondefault branch", async () => {
    const github = mockCleanupGithub({ headPulls: [duplicateHeadPull("integration/other")] });
    await main(["--all", "--apply"], ENV);
    expect(github.report()).toMatchObject({
      deleted: [],
      closedPullRequests: [],
      skipped: [{ branch: BRANCH, reason: "open-nondefault-pull-request", pullRequests: [84] }],
    });
    expect(github.mutations()).toEqual([]);
  });

  it("still preserves a candidate whose SHA changed before deletion", async () => {
    const github = mockCleanupGithub({ currentSha: "f".repeat(40), headPulls: [duplicateHeadPull()] });
    await main(["--all", "--apply"], ENV);
    expect(github.report()).toMatchObject({
      deleted: [],
      closedPullRequests: [],
      skipped: [{ branch: BRANCH, reason: "head-changed-after-verification" }],
    });
    expect(github.mutations()).toEqual([]);
  });
});
