import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ACTIVE_EVENTS = new Set(["push", "pull_request", "dynamic"]);
const ACTIVE_STATUSES = ["pending", "queued", "in_progress"];
const WAITING_STATUSES = new Set(["pending", "queued"]);
const DEFAULT_STALE_QUEUED_AFTER_MS = 6 * 60 * 60 * 1_000;
const CODEQL_DEFAULT_SETUP_WORKFLOW_PATH = "dynamic/github-code-scanning/codeql";

export function isProtectedActionsRun(run) {
  if (run.event === "dynamic" && run.path === CODEQL_DEFAULT_SETUP_WORKFLOW_PATH) return true;
  // ci.yml owns coalescing pending main runs; a started main verification must finish.
  if (run.event === "push" && ["main", "refs/heads/main"].includes(run.head_branch) &&
    (run.path === ".github/workflows/ci.yml" || run.name === "CI")) return true;
  // This workflow intentionally runs AFTER a PR closes. Closed is not stale here.
  return run.path === ".github/workflows/cleanup-merged-pr-branches.yml" ||
    run.name === "Cleanup merged PR branches";
}

export function selectSupersededActionsRuns(
  runs,
  {
    currentRunId,
    pullRequestStates = new Map(),
    openPullHeadBranches = new Set(),
    now,
    staleQueuedAfterMs = DEFAULT_STALE_QUEUED_AFTER_MS,
  } = {},
) {
  const current = Number(currentRunId);
  const active = runs.filter((run) =>
    Number(run.id) !== current &&
    ACTIVE_EVENTS.has(run.event) &&
    !isProtectedActionsRun(run),
  );

  const groups = new Map();
  for (const run of active) {
    const key = `${run.workflow_id}:${run.event}:${run.head_branch ?? run.head_sha}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(run);
    groups.set(key, bucket);
  }

  const selected = new Map();
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    for (const run of bucket.slice(1)) {
      selected.set(Number(run.id), { run, reason: "superseded" });
    }
  }

  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (
    Number.isFinite(nowMs) &&
    Number.isFinite(staleQueuedAfterMs) &&
    staleQueuedAfterMs >= 0
  ) {
    for (const run of active) {
      if (!WAITING_STATUSES.has(run.status) || selected.has(Number(run.id))) continue;
      const createdAtMs = Date.parse(run.created_at);
      if (Number.isFinite(createdAtMs) && nowMs - createdAtMs >= staleQueuedAfterMs) {
        selected.set(Number(run.id), { run, reason: "stale-queued" });
      }
    }
  }

  for (const run of active) {
    if (run.event !== "pull_request") continue;

    // A rerun is an explicit diagnostic request even after its PR has closed.
    // Cancelling it on the next main push makes GitHub's "Re-run jobs" action
    // impossible to use for post-merge verification and leaves immutable red
    // checks without evidence. Duplicate/superseded reruns are still selected
    // by the workflow/event/head grouping above.
    if (Number(run.run_attempt ?? 1) > 1) continue;

    const number = run.pull_requests?.[0]?.number;
    const state = Number.isInteger(number) ? pullRequestStates.get(number) : undefined;
    if (state && state !== "open") {
      selected.set(Number(run.id), { run, reason: `pull-request-${state}` });
      continue;
    }

    // GitHub commonly returns an empty pull_requests array for old/closed PR workflow runs.
    // Keep only heads that still belong to an open PR; everything else is stale queue debt.
    const branch = typeof run.head_branch === "string" ? run.head_branch : "";
    if ((!Number.isInteger(number) || !state) && branch && !openPullHeadBranches.has(branch)) {
      selected.set(Number(run.id), { run, reason: "pull-request-no-longer-open" });
    }
  }

  return [...selected.values()];
}

async function githubRequest({ token, repository, path, init = {}, fetchImpl = fetch }) {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "toonspectrum-actions-queue-cleanup",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`${init.method ?? "GET"} ${path} -> ${response.status}: ${text}`);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function listRuns({ token, repository, status, fetchImpl }) {
  const runs = [];
  for (let page = 1; page <= 20; page += 1) {
    const data = await githubRequest({
      token,
      repository,
      path: `/actions/runs?status=${status}&per_page=100&page=${page}`,
      fetchImpl,
    });
    const batch = data?.workflow_runs ?? [];
    runs.push(...batch);
    if (batch.length < 100) break;
  }
  return runs;
}

async function listOpenPulls({ token, repository, fetchImpl }) {
  const pulls = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubRequest({
      token,
      repository,
      path: `/pulls?state=open&per_page=100&page=${page}`,
      fetchImpl,
    });
    pulls.push(...(batch ?? []));
    if (!Array.isArray(batch) || batch.length < 100) break;
  }
  return pulls;
}

function summarizeSelectedRun(run, reason) {
  return {
    id: run.id,
    workflow: run.name,
    event: run.event,
    branch: run.head_branch,
    status: run.status,
    createdAt: run.created_at,
    reason,
  };
}

export async function cleanupSupersededActionsRuns({
  token,
  repository,
  currentRunId,
  apply = false,
  fetchImpl = fetch,
  now = Date.now(),
  staleQueuedAfterMs = DEFAULT_STALE_QUEUED_AFTER_MS,
}) {
  if (!token || !repository || !Number.isFinite(Number(currentRunId))) {
    throw new Error("Missing Actions queue cleanup environment.");
  }

  const [runsByStatus, openPulls] = await Promise.all([
    Promise.all(
      ACTIVE_STATUSES.map((status) => listRuns({ token, repository, status, fetchImpl })),
    ),
    listOpenPulls({ token, repository, fetchImpl }),
  ]);
  const runs = runsByStatus.flat();
  const openPullHeadBranches = new Set(
    openPulls
      .map((pull) => pull?.head?.ref)
      .filter((value) => typeof value === "string" && value.length > 0),
  );

  const prNumbers = new Set(
    runs
      .filter((run) => run.event === "pull_request")
      .map((run) => run.pull_requests?.[0]?.number)
      .filter(Number.isInteger),
  );
  const pullRequestStates = new Map();
  for (const number of prNumbers) {
    const pr = await githubRequest({
      token,
      repository,
      path: `/pulls/${number}`,
      fetchImpl,
    });
    pullRequestStates.set(number, pr?.state ?? "unknown");
  }

  const candidates = selectSupersededActionsRuns(runs, {
    currentRunId,
    pullRequestStates,
    openPullHeadBranches,
    now,
    staleQueuedAfterMs,
  });
  const planned = candidates.map(({ run, reason }) => summarizeSelectedRun(run, reason));
  const cancelled = [];
  const skipped = [];

  if (apply) {
    for (const { run, reason } of candidates) {
      try {
        await githubRequest({
          token,
          repository,
          path: `/actions/runs/${run.id}/cancel`,
          init: { method: "POST" },
          fetchImpl,
        });
        cancelled.push({ ...summarizeSelectedRun(run, reason), operation: "cancel" });
      } catch (error) {
        if (error?.status !== 409) throw error;

        try {
          await githubRequest({
            token,
            repository,
            path: `/actions/runs/${run.id}/force-cancel`,
            init: { method: "POST" },
            fetchImpl,
          });
          cancelled.push({ ...summarizeSelectedRun(run, reason), operation: "force-cancel" });
        } catch (forceError) {
          if (forceError?.status !== 409) throw forceError;
          skipped.push({
            ...summarizeSelectedRun(run, reason),
            failure: "cancel-and-force-cancel-rejected",
          });
        }
      }
    }
  }

  return {
    activeRunsScanned: runs.filter((run) => ACTIVE_EVENTS.has(run.event)).length,
    openPullHeads: openPullHeadBranches.size,
    candidateRuns: candidates.length,
    planned,
    cancelled,
    skipped,
    dryRun: !apply,
  };
}

function parseArgs(argv) {
  let apply = false;
  let reportPath = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") apply = true;
    else if (arg === "--report") reportPath = argv[++index] ?? null;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return { apply, reportPath };
}

async function main() {
  const { apply, reportPath } = parseArgs(process.argv.slice(2));
  const report = await cleanupSupersededActionsRuns({
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    currentRunId: Number(process.env.CURRENT_RUN_ID ?? process.env.GITHUB_RUN_ID),
    apply,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPath) writeFileSync(reportPath, serialized);
  process.stdout.write(serialized);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
