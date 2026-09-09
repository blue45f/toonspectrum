import { describe, expect, it } from "vitest";

import { selectSupersededActionsRuns } from "./cleanup-superseded-actions-runs.mjs";

function run({
  id,
  workflow = 1,
  event = "pull_request",
  branch = "feature/a",
  createdAt,
  pr = 10,
}) {
  return {
    id,
    workflow_id: workflow,
    event,
    head_branch: branch,
    head_sha: `sha-${id}`,
    created_at: createdAt,
    pull_requests: event === "pull_request" && pr !== null ? [{ number: pr }] : [],
    name: `workflow-${workflow}`,
  };
}

describe("selectSupersededActionsRuns", () => {
  it("keeps only the newest run for the same workflow, event and branch", () => {
    const selected = selectSupersededActionsRuns([
      run({ id: 1, createdAt: "2026-09-10T00:00:00Z" }),
      run({ id: 2, createdAt: "2026-09-10T00:01:00Z" }),
      run({ id: 3, createdAt: "2026-09-10T00:02:00Z" }),
    ]);
    expect(selected.map((item) => item.run.id).sort()).toEqual([1, 2]);
    expect(selected.every((item) => item.reason === "superseded")).toBe(true);
  });

  it("does not mix different workflows or branches", () => {
    const selected = selectSupersededActionsRuns([
      run({ id: 1, workflow: 1, branch: "feature/a", createdAt: "2026-09-10T00:00:00Z" }),
      run({ id: 2, workflow: 2, branch: "feature/a", createdAt: "2026-09-10T00:01:00Z" }),
      run({ id: 3, workflow: 1, branch: "feature/b", createdAt: "2026-09-10T00:02:00Z" }),
    ]);
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
