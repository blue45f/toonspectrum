import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ACTIVE_EVENTS = new Set(["push", "pull_request"]);
const ACTIVE_STATUSES = ["queued", "in_progress"];

export function selectSupersededActionsRuns(
  runs,
  { currentRunId, pullRequestStates = new Map() } = {},
) {
  const current = Number(currentRunId);
  const active = runs.filter((run) =>
    Number(run.id) !== current && ACTIVE_EVENTS.has(run.event),
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

  for (const run of active) {
    if (run.event !== "pull_request") continue;
    const number = run.pull_requests?.[0]?.number;
    if (!Number.isInteger(number)) continue;
    const state = pullRequestStates.get(number);
    if (state && state !== "open") {
      selected.set(Number(run.id), { run, reason: `pull-request-${state}` });
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

export async function cleanupSupersededActionsRuns({
  token,
  repository,
  currentRunId,
  apply = false,
  fetchImpl = fetch,
}) {
  if (!token || !repository || !Number.isFinite(Number(currentRunId))) {
    throw new Error("Missing Actions queue cleanup environment.");
  }

  const runs = (
    await Promise.all(
      ACTIVE_STATUSES.map((status) => listRuns({ token, repository, status, fetchImpl })),
    )
  ).flat();

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
  });
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
        cancelled.push({
          id: run.id,
          workflow: run.name,
          event: run.event,
          branch: run.head_branch,
          reason,
        });
      } catch (error) {
        if (error?.status === 409) {
          skipped.push({ id: run.id, reason: "already-terminal" });
          continue;
        }
        throw error;
      }
    }
  }

  return {
    activeRunsScanned: runs.filter((run) => ACTIVE_EVENTS.has(run.event)).length,
    candidateRuns: candidates.length,
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
