import { describe, expect, it } from "vitest";

import {
  cleanupSupersededActionsRuns,
  selectSupersededActionsRuns,
} from "./cleanup-superseded-actions-runs.mjs";

function run({
  id,
  workflow = 1,
  event = "pull_request",
  branch = "feature/a",
  createdAt,
  pr = 10,
  attempt = 1,
  status = "queued",
  path = null,
}) {
  return {
    id,
    workflow_id: workflow,
    event,
    head_branch: branch,
    head_sha: `sha-${id}`,
    created_at: createdAt,
    run_attempt: attempt,
    status,
    path,
    pull_requests: event === "pull_request" && pr !== null ? [{ number: pr }] : [],
    name: `workflow-${workflow}`,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createCleanupFetch(forceCancelStatus) {
  const calls = [];
  const staleRun = run({
    id: 50,
    branch: "feature/closed",
    createdAt: "2026-09-17T00:00:00Z",
    pr: null,
  });

  return {
    calls,
    async fetchImpl(url, init = {}) {
      const request = new URL(url);
      calls.push(`${init.method ?? "GET"} ${request.pathname}${request.search}`);
      if (request.searchParams.get("status") === "queued") {
        return jsonResponse({ workflow_runs: [staleRun] });
      }
      if (["pending", "in_progress"].includes(request.searchParams.get("status"))) {
        return jsonResponse({ workflow_runs: [] });
      }
      if (request.pathname.endsWith("/pulls")) return jsonResponse([]);
      if (request.pathname.endsWith("/50/cancel")) {
        return jsonResponse({ message: "not queued yet" }, 409);
      }
      if (request.pathname.endsWith("/50/force-cancel")) {
        return jsonResponse(
          forceCancelStatus === 204 ? null : { message: "not queued yet" },
          forceCancelStatus,
        );
      }
      throw new Error(`Unexpected request: ${request}`);
    },
  };
}

describe("selectSupersededActionsRuns", () => {
  it("keeps only the newest run for the same workflow, event and branch", () => {
    const selected = selectSupersededActionsRuns(
      [
        run({ id: 1, createdAt: "2026-09-10T00:00:00Z" }),
        run({ id: 2, createdAt: "2026-09-10T00:01:00Z" }),
        run({ id: 3, createdAt: "2026-09-10T00:02:00Z" }),
      ],
      { pullRequestStates: new Map([[10, "open"]]) },
    );
    expect(selected.map((item) => item.run.id).sort()).toEqual([1, 2]);
    expect(selected.every((item) => item.reason === "superseded")).toBe(true);
  });

  it("does not mix different workflows or branches", () => {
    const selected = selectSupersededActionsRuns(
      [
        run({ id: 1, workflow: 1, branch: "feature/a", createdAt: "2026-09-10T00:00:00Z" }),
        run({ id: 2, workflow: 2, branch: "feature/a", createdAt: "2026-09-10T00:01:00Z" }),
        run({ id: 3, workflow: 1, branch: "feature/b", createdAt: "2026-09-10T00:02:00Z" }),
      ],
      { pullRequestStates: new Map([[10, "open"]]) },
    );
    expect(selected).toEqual([]);
  });

  it("cancels a closed PR run even when it is the newest run", () => {
    const selected = selectSupersededActionsRuns(
      [run({ id: 9, createdAt: "2026-09-10T00:02:00Z", pr: 77 })],
      { pullRequestStates: new Map([[77, "closed"]]) },
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ reason: "pull-request-closed" });
  });

  it("preserves an explicitly requested rerun after its PR closes", () => {
    const selected = selectSupersededActionsRuns(
      [run({ id: 10, createdAt: "2026-09-10T00:03:00Z", pr: 77, attempt: 2 })],
      { pullRequestStates: new Map([[77, "closed"]]) },
    );
    expect(selected).toEqual([]);
  });

  it("preserves an explicitly requested unlinked rerun after branch cleanup", () => {
    const selected = selectSupersededActionsRuns(
      [
        run({
          id: 11,
          branch: "feature/merged-and-deleted",
          createdAt: "2026-09-10T00:03:00Z",
          pr: null,
          attempt: 2,
        }),
      ],
      { openPullHeadBranches: new Set() },
    );
    expect(selected).toEqual([]);
  });

  it("cancels an unlinked PR run when its head is no longer open", () => {
    const selected = selectSupersededActionsRuns(
      [run({ id: 12, branch: "feature/closed", createdAt: "2026-09-10T00:02:00Z", pr: null })],
      { openPullHeadBranches: new Set(["feature/open"]) },
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ reason: "pull-request-no-longer-open" });
  });

  it("keeps an unlinked run when its head still belongs to an open PR", () => {
    const selected = selectSupersededActionsRuns(
      [run({ id: 13, branch: "feature/open", createdAt: "2026-09-10T00:02:00Z", pr: null })],
      { openPullHeadBranches: new Set(["feature/open"]) },
    );
    expect(selected).toEqual([]);
  });

  it("preserves GitHub CodeQL default-setup runs even when superseded or stale", () => {
    const selected = selectSupersededActionsRuns(
      [
        run({
          id: 20,
          event: "dynamic",
          branch: "refs/pull/1578/head",
          pr: null,
          createdAt: "2026-09-17T00:00:00Z",
          path: "dynamic/github-code-scanning/codeql",
        }),
        run({
          id: 21,
          event: "dynamic",
          branch: "refs/pull/1578/head",
          pr: null,
          createdAt: "2026-09-17T00:01:00Z",
          path: "dynamic/github-code-scanning/codeql",
        }),
      ],
      {
        now: Date.parse("2026-09-17T12:00:00Z"),
      },
    );
    expect(selected).toEqual([]);
  });

  it("still cancels superseded non-CodeQL dynamic runs", () => {
    const selected = selectSupersededActionsRuns([
      run({
        id: 22,
        event: "dynamic",
        branch: "refs/pull/1578/head",
        pr: null,
        createdAt: "2026-09-17T00:00:00Z",
        path: "dynamic/other",
      }),
      run({
        id: 23,
        event: "dynamic",
        branch: "refs/pull/1578/head",
        pr: null,
        createdAt: "2026-09-17T00:01:00Z",
        path: "dynamic/other",
      }),
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ reason: "superseded", run: { id: 22 } });
  });

  it.each(["pending", "queued"])(
    "cancels a %s run that has remained unscheduled for six hours",
    (status) => {
      const selected = selectSupersededActionsRuns(
        [run({ id: 30, createdAt: "2026-09-17T00:00:00Z", status })],
        {
          now: Date.parse("2026-09-17T06:00:00Z"),
          pullRequestStates: new Map([[10, "open"]]),
        },
      );
      expect(selected).toHaveLength(1);
      expect(selected[0]).toMatchObject({ reason: "stale-queued", run: { id: 30 } });
    },
  );

  it("keeps recent queued runs and never age-cancels in-progress work", () => {
    const selected = selectSupersededActionsRuns(
      [
        run({ id: 31, createdAt: "2026-09-17T05:30:00Z", status: "queued" }),
        run({
          id: 32,
          workflow: 2,
          createdAt: "2026-09-16T00:00:00Z",
          status: "in_progress",
        }),
      ],
      {
        now: Date.parse("2026-09-17T06:00:00Z"),
        pullRequestStates: new Map([[10, "open"]]),
      },
    );
    expect(selected).toEqual([]);
  });

  it("protects the cleanup workflow's current run", () => {
    const selected = selectSupersededActionsRuns(
      [
        run({ id: 100, event: "push", branch: "main", pr: null, createdAt: "2026-09-10T00:00:00Z" }),
        run({ id: 101, event: "push", branch: "main", pr: null, createdAt: "2026-09-10T00:01:00Z" }),
      ],
      { currentRunId: 100 },
    );
    expect(selected).toEqual([]);
  });

  it("ignores schedule and manual runs", () => {
    const selected = selectSupersededActionsRuns([
      run({ id: 1, event: "schedule", pr: null, createdAt: "2026-09-10T00:00:00Z" }),
      run({ id: 2, event: "schedule", pr: null, createdAt: "2026-09-10T00:01:00Z" }),
      run({ id: 3, event: "workflow_dispatch", pr: null, createdAt: "2026-09-10T00:02:00Z" }),
    ]);
    expect(selected).toEqual([]);
  });
});

describe("cleanupSupersededActionsRuns", () => {
  it.each([
    {
      name: "falls back to force-cancel after GitHub rejects ordinary cancel",
      forceCancelStatus: 204,
      cancelled: 1,
      skipped: 0,
      operation: "force-cancel",
    },
    {
      name: "reports an uncancellable ghost when both cancellation APIs reject it",
      forceCancelStatus: 409,
      cancelled: 0,
      skipped: 1,
      operation: undefined,
    },
  ])("$name", async ({ forceCancelStatus, cancelled, skipped, operation }) => {
    const { calls, fetchImpl } = createCleanupFetch(forceCancelStatus);
    const report = await cleanupSupersededActionsRuns({
      token: "test-token",
      repository: "owner/repository",
      currentRunId: 999,
      apply: true,
      fetchImpl,
      now: Date.parse("2026-09-17T01:00:00Z"),
    });

    expect(report.planned).toHaveLength(1);
    expect(report.planned[0]).toMatchObject({ id: 50, reason: "pull-request-no-longer-open" });
    expect(report.cancelled).toHaveLength(cancelled);
    expect(report.skipped).toHaveLength(skipped);
    if (operation) expect(report.cancelled[0]).toMatchObject({ operation });
    if (skipped > 0) {
      expect(report.skipped[0]).toMatchObject({
        failure: "cancel-and-force-cancel-rejected",
      });
    }
    expect(calls).toContain("POST /repos/owner/repository/actions/runs/50/cancel");
    expect(calls).toContain("POST /repos/owner/repository/actions/runs/50/force-cancel");
  });
});
