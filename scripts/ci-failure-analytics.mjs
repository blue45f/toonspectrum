#!/usr/bin/env node

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULTS = Object.freeze({
  lookbackDays: 30,
  maxRuns: 1_000,
  maxLogRuns: 80,
  maxFailedJobsPerRun: 4,
  concurrency: 4,
  outputDir: 'artifacts/ci-failure-analytics',
});

const RETRYABLE_STATUS = new Set([403, 408, 409, 425, 429, 500, 502, 503, 504]);
const DYNAMIC_PATH_PREFIXES = ['dynamic/', 'dynamic\\'];
const SELF_WORKFLOW_PATH = '.github/workflows/webtoon-ci-failure-summary.yml';

function integer(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer from ${min} to ${max}, received: ${value}`);
  }
  return parsed;
}

function boolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Expected a boolean, received: ${value}`);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const [rawKey, inlineValue] = argument.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

const ESCAPE_CHARACTER = String.fromCodePoint(27);
const BELL_CHARACTER = String.fromCodePoint(7);
const ANSI_CSI_PATTERN = new RegExp(`${ESCAPE_CHARACTER}\\[[0-?]*[ -/]*[@-~]`, 'gu');
const ANSI_OSC_PATTERN = new RegExp(
  `${ESCAPE_CHARACTER}\\][^${BELL_CHARACTER}]*(?:${BELL_CHARACTER}|${ESCAPE_CHARACTER}\\\\)`,
  'gu',
);

export function stripAnsi(value) {
  const withoutAnsi = String(value ?? '')
    .replace(ANSI_CSI_PATTERN, '')
    .replace(ANSI_OSC_PATTERN, '');
  return [...withoutAnsi].filter((character) => {
    const codePoint = character.codePointAt(0);
    return [9, 10, 13].includes(codePoint) || (codePoint > 31 && codePoint !== 127);
  }).join('');
}

export function normalizeDiagnostic(value) {
  return stripAnsi(value)
    .replaceAll('\\', '/')
    .replace(/(?:[A-Za-z]:)?\/(?:home|Users)\/[^\s]+?\/work\/[^\s/]+\/[^\s/]+\//gu, '')
    .replace(/\/github\/workspace\//gu, '')
    .replace(/\b[0-9a-f]{40}\b/giu, '<sha>')
    .replace(/\b(run|job|artifact)[-_ ]?id\s*[:=]?\s*\d+\b/giu, '$1 id <id>')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 500);
}

function addSignature(target, category, signature, line) {
  const normalized = normalizeDiagnostic(signature);
  if (!normalized) return;
  const key = `${category}:${normalized.toLowerCase()}`;
  if (!target.has(key)) {
    target.set(key, {
      category,
      signature: normalized,
      example: normalizeDiagnostic(line),
    });
  }
}

function fallbackCategory(stepName = '') {
  const step = stepName.toLowerCase();
  if (/typecheck|typescript|\btsc\b/u.test(step)) return 'typescript';
  if (/lint|eslint/u.test(step)) return 'lint';
  if (/test|vitest|jest|playwright|cypress|regression|contract/u.test(step)) return 'test';
  if (/build|bundle|compile/u.test(step)) return 'build';
  if (/install|dependenc|setup|lockfile/u.test(step)) return 'dependency';
  if (/deploy|release|publish/u.test(step)) return 'deploy';
  if (/security|codeql|scan|audit/u.test(step)) return 'security';
  if (/upload|artifact/u.test(step)) return 'artifact';
  if (/generated|reproduce|drift|git diff/u.test(step)) return 'generated-drift';
  return 'unknown';
}

export function extractFailureSignatures(logText, failedStepName = '') {
  const signatures = new Map();
  const clean = stripAnsi(logText);
  const lines = clean.split(/\r?\n/u);

  for (const rawLine of lines) {
    const line = rawLine.replace(/^\d{4}-\d{2}-\d{2}T[^Z\s]+Z\s*/u, '').trim();
    if (!line) continue;

    const typeScript = line.match(/(?:^|\s)([^\s:()]+\.(?:[cm]?tsx?|d\.ts))\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/iu);
    if (typeScript) {
      addSignature(signatures, 'typescript', `${typeScript[4]}: ${typeScript[5]}`, line);
      continue;
    }

    const eslint = line.match(/^\s*(\d+):(\d+)\s+error\s+(.+?)\s+([@\w./-]+)$/u);
    if (eslint) {
      addSignature(signatures, 'lint', `${eslint[4]}: ${eslint[3]}`, line);
      continue;
    }

    const assertion = line.match(/(?:AssertionError|JestAssertionError):\s*(.+)$/iu);
    if (assertion) {
      addSignature(signatures, 'test', `AssertionError: ${assertion[1]}`, line);
      continue;
    }

    const playwright = line.match(/(?:Error:\s*)?(?:expect\([^)]*\)|locator\.[\w]+|page\.[\w]+).*?(?:failed|timed out|timeout|received|expected).*/iu);
    if (playwright && /error|failed|timed out|timeout|expected|received/iu.test(line)) {
      addSignature(signatures, 'test', line.replace(/^.*?##\[error\]/u, ''), line);
      continue;
    }

    if (/FATAL ERROR:.*(?:heap|allocation)|JavaScript heap out of memory|Reached heap limit/iu.test(line)) {
      addSignature(signatures, 'resource', 'JavaScript heap out of memory', line);
      continue;
    }

    if (/No space left on device|ENOSPC/iu.test(line)) {
      addSignature(signatures, 'resource', 'Runner disk space exhausted', line);
      continue;
    }

    const packageManager = line.match(/(?:ERR_PNPM_[A-Z0-9_]+|npm ERR!|YN\d{4}|error An unexpected error occurred).*$/u);
    if (packageManager) {
      addSignature(signatures, 'dependency', packageManager[0], line);
      continue;
    }

    if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network.*(?:error|failure)|TLS.*(?:error|failure)/iu.test(line)) {
      addSignature(signatures, 'network', line, line);
      continue;
    }

    if (/Resource not accessible by integration|Bad credentials|Permission denied|HTTP (?:401|403)|status code (?:401|403)/iu.test(line)) {
      addSignature(signatures, 'permission', line, line);
      continue;
    }

    if (/timed out after|The operation was canceled|The job running on runner.*exceeded|cancell?ed because/iu.test(line)) {
      addSignature(signatures, 'timeout', line, line);
      continue;
    }

    if (/fatal:.*|remote:.*(?:error|fatal)|merge conflict|CONFLICT \(/iu.test(line)) {
      addSignature(signatures, 'git', line, line);
      continue;
    }

    if (/##\[error\]/u.test(line) && !/Process completed with exit code/iu.test(line)) {
      addSignature(signatures, fallbackCategory(failedStepName), line.replace(/^.*?##\[error\]\s*/u, ''), line);
    }
  }

  if (signatures.size === 0) {
    const category = fallbackCategory(failedStepName);
    addSignature(
      signatures,
      category,
      failedStepName ? `Failed step: ${failedStepName}` : 'No recognized failure marker',
      failedStepName,
    );
  }

  return [...signatures.values()];
}

export function isDynamicRun(run) {
  const workflowPath = String(run?.path ?? '');
  const name = String(run?.name ?? '');
  return run?.event === 'dynamic'
    || DYNAMIC_PATH_PREFIXES.some((prefix) => workflowPath.startsWith(prefix))
    || /code scanning ai findings/iu.test(name);
}

export function isSelfRun(run) {
  return String(run?.path ?? '') === SELF_WORKFLOW_PATH
    || /ci failure (?:analytics|summary)/iu.test(String(run?.name ?? ''));
}

function runTimestamp(run) {
  return Date.parse(run?.created_at ?? run?.run_started_at ?? 0) || 0;
}

export function selectRunsForLogSampling(runs, maxRuns) {
  if (maxRuns <= 0) return [];
  const sorted = [...runs].sort((left, right) => runTimestamp(right) - runTimestamp(left));
  const buckets = new Map();
  for (const run of sorted) {
    const key = run.path || run.name || 'unknown';
    const bucket = buckets.get(key) ?? [];
    bucket.push(run);
    buckets.set(key, bucket);
  }

  const selected = [];
  const selectedIds = new Set();
  let depth = 0;
  while (selected.length < maxRuns) {
    let added = false;
    for (const bucket of buckets.values()) {
      const run = bucket[depth];
      if (!run || selectedIds.has(run.id)) continue;
      selected.push(run);
      selectedIds.add(run.id);
      added = true;
      if (selected.length >= maxRuns) break;
    }
    if (!added) break;
    depth += 1;
  }
  return selected.sort((left, right) => runTimestamp(right) - runTimestamp(left));
}

function increment(map, key, initializer) {
  const value = map.get(key) ?? initializer();
  map.set(key, value);
  return value;
}

export function aggregateFailureData({ runs, jobDiagnostics = [], totalCount = runs.length, truncated = false }) {
  const dynamicRuns = runs.filter(isDynamicRun);
  const selfRuns = runs.filter(isSelfRun);
  const actionableRuns = runs.filter((run) => !isDynamicRun(run) && !isSelfRun(run));
  const workflows = new Map();
  const events = new Map();
  const branches = new Map();

  for (const run of actionableRuns) {
    const workflowKey = run.path || run.name || 'unknown';
    const workflow = increment(workflows, workflowKey, () => ({
      workflow: run.name || workflowKey,
      path: run.path || '',
      failures: 0,
      commits: new Set(),
      branches: new Set(),
      latestAt: '',
      latestUrl: '',
    }));
    workflow.failures += 1;
    if (run.head_sha) workflow.commits.add(run.head_sha);
    if (run.head_branch) workflow.branches.add(run.head_branch);
    if (!workflow.latestAt || runTimestamp(run) > Date.parse(workflow.latestAt)) {
      workflow.latestAt = run.created_at ?? run.run_started_at ?? '';
      workflow.latestUrl = run.html_url ?? '';
    }
    events.set(run.event || 'unknown', (events.get(run.event || 'unknown') ?? 0) + 1);
    branches.set(run.head_branch || 'unknown', (branches.get(run.head_branch || 'unknown') ?? 0) + 1);
  }

  const steps = new Map();
  const causes = new Map();
  const unavailableLogs = jobDiagnostics.filter((diagnostic) => diagnostic.logUnavailable).length;

  for (const diagnostic of jobDiagnostics) {
    const step = diagnostic.failedStepName || 'Unknown failed step';
    const stepGroup = increment(steps, step, () => ({
      step,
      failures: 0,
      workflows: new Set(),
      latestAt: '',
    }));
    stepGroup.failures += 1;
    stepGroup.workflows.add(diagnostic.workflowName || diagnostic.workflowPath || 'unknown');
    if (!stepGroup.latestAt || Date.parse(diagnostic.createdAt) > Date.parse(stepGroup.latestAt)) {
      stepGroup.latestAt = diagnostic.createdAt;
    }

    for (const cause of diagnostic.signatures ?? []) {
      const key = `${cause.category}:${cause.signature.toLowerCase()}`;
      const group = increment(causes, key, () => ({
        category: cause.category,
        signature: cause.signature,
        occurrences: 0,
        runs: new Set(),
        jobs: new Set(),
        workflows: new Set(),
        steps: new Set(),
        latestAt: '',
        latestUrl: '',
        example: cause.example || '',
      }));
      const occurrenceKey = `${diagnostic.runId}:${diagnostic.jobId}`;
      if (!group.jobs.has(occurrenceKey)) {
        group.occurrences += 1;
        group.jobs.add(occurrenceKey);
      }
      group.runs.add(diagnostic.runId);
      group.workflows.add(diagnostic.workflowName || diagnostic.workflowPath || 'unknown');
      group.steps.add(step);
      if (!group.latestAt || Date.parse(diagnostic.createdAt) > Date.parse(group.latestAt)) {
        group.latestAt = diagnostic.createdAt;
        group.latestUrl = diagnostic.runUrl || '';
      }
    }
  }

  const uniqueCommits = new Set(actionableRuns.map((run) => run.head_sha).filter(Boolean));
  return {
    totalCount,
    fetchedRuns: runs.length,
    truncated,
    actionableRuns,
    dynamicRuns,
    selfRuns,
    uniqueCommits: uniqueCommits.size,
    workflows: [...workflows.values()].sort((a, b) => b.failures - a.failures),
    events: [...events.entries()].sort((a, b) => b[1] - a[1]),
    branches: [...branches.entries()].sort((a, b) => b[1] - a[1]),
    steps: [...steps.values()].sort((a, b) => b.failures - a.failures),
    causes: [...causes.values()].sort((a, b) => b.occurrences - a.occurrences),
    sampledRuns: new Set(jobDiagnostics.map((diagnostic) => diagnostic.runId)).size,
    sampledJobs: jobDiagnostics.length,
    unavailableLogs,
  };
}

function markdownCell(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
    .trim();
}

function compactDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return date.toISOString().replace('T', ' ').replace(/:\d{2}\.\d{3}Z$/u, ' UTC');
}

function link(label, url) {
  return url ? `[${markdownCell(label)}](${url})` : markdownCell(label);
}

function table(headers, rows) {
  if (rows.length === 0) return '_No data._\n';
  const head = `| ${headers.join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`).join('\n');
  return `${head}\n${divider}\n${body}\n`;
}

export function renderMarkdownReport(summary, context = {}) {
  const generatedAt = context.generatedAt ?? new Date().toISOString();
  const repository = context.repository ?? 'unknown/unknown';
  const lookbackLabel = context.lookbackDays > 0
    ? `${context.lookbackDays} days`
    : 'all retained history';
  const coverage = summary.truncated
    ? `${summary.fetchedRuns.toLocaleString()} fetched of ${summary.totalCount.toLocaleString()} matching runs (truncated)`
    : `${summary.fetchedRuns.toLocaleString()} matching runs fetched`;

  const workflowRows = summary.workflows.slice(0, 25).map((workflow) => [
    link(workflow.workflow, workflow.latestUrl),
    workflow.failures,
    workflow.commits.size,
    workflow.branches.size,
    compactDate(workflow.latestAt),
  ]);

  const causeRows = summary.causes.slice(0, 30).map((cause) => [
    cause.category,
    link(cause.signature, cause.latestUrl),
    cause.occurrences,
    cause.runs.size,
    cause.workflows.size,
    compactDate(cause.latestAt),
  ]);

  const stepRows = summary.steps.slice(0, 25).map((step) => [
    step.step,
    step.failures,
    step.workflows.size,
    compactDate(step.latestAt),
  ]);

  const fanout = summary.causes
    .filter((cause) => cause.workflows.size > 1)
    .slice(0, 15);

  const latestRows = [...summary.actionableRuns]
    .sort((left, right) => runTimestamp(right) - runTimestamp(left))
    .slice(0, 30)
    .map((run) => [
      link(run.name || run.path || 'unknown', run.html_url),
      run.event || 'unknown',
      run.head_branch || 'unknown',
      String(run.head_sha ?? '').slice(0, 8),
      compactDate(run.created_at),
    ]);

  const recommendations = [];
  const duplicatedGlobalGates = summary.steps.filter((step) => (
    /typecheck|production build|\btsc\b/iu.test(step.step)
    && [...step.workflows].some((workflow) => workflow !== 'CI')
  ));
  if (duplicatedGlobalGates.length > 0) {
    recommendations.push(
      `Centralize repository-wide typecheck/build in the required core workflow; ${duplicatedGlobalGates.reduce((total, step) => total + step.failures, 0)} sampled failed jobs repeated a global gate in product workflows.`,
    );
  }
  if (fanout.length > 0) {
    recommendations.push(
      `${fanout.length} normalized root-cause signatures fanned out across multiple workflows; fix the shared cause before rerunning downstream jobs.`,
    );
  }
  if (summary.dynamicRuns.length > 0) {
    recommendations.push(
      `Keep ${summary.dynamicRuns.length.toLocaleString()} dynamic/security-bot failures separate from repository-authored CI reliability metrics.`,
    );
  }
  if (summary.unavailableLogs > 0) {
    recommendations.push(
      `${summary.unavailableLogs} sampled failed jobs no longer had readable logs; retain this report artifact so normalized signatures survive Actions log expiry.`,
    );
  }
  if (summary.truncated) {
    recommendations.push('Increase CI_FAILURE_MAX_RUNS for a complete metadata census; log analysis remains intentionally sampled.');
  }
  if (recommendations.length === 0) {
    recommendations.push('No systemic fan-out pattern was detected in the sampled failed-job logs.');
  }

  return [
    '# CI failure analytics',
    '',
    `- Repository: \`${repository}\``,
    `- Generated: ${compactDate(generatedAt)}`,
    `- Window: ${lookbackLabel}`,
    `- Coverage: ${coverage}`,
    `- Repository-authored failures: **${summary.actionableRuns.length.toLocaleString()}** across **${summary.workflows.length.toLocaleString()}** workflows and **${summary.uniqueCommits.toLocaleString()}** commits`,
    `- Separated dynamic/security-bot failures: **${summary.dynamicRuns.length.toLocaleString()}**`,
    `- Root-cause sample: **${summary.sampledRuns.toLocaleString()}** runs / **${summary.sampledJobs.toLocaleString()}** failed jobs; unavailable logs: **${summary.unavailableLogs.toLocaleString()}**`,
    '',
    '## Top failing workflows',
    '',
    table(['Workflow', 'Failures', 'Commits', 'Branches', 'Latest'], workflowRows),
    '## Normalized root-cause signatures',
    '',
    table(['Category', 'Signature', 'Jobs', 'Runs', 'Workflows', 'Latest'], causeRows),
    '## Failed steps',
    '',
    table(['Step', 'Failed jobs', 'Workflows', 'Latest'], stepRows),
    '## Cross-workflow fan-out',
    '',
    fanout.length > 0
      ? fanout.map((cause) => `- **${cause.occurrences} jobs / ${cause.workflows.size} workflows** — \`${cause.category}\`: ${cause.signature}`).join('\n')
      : '_No normalized signature appeared in more than one workflow in the sampled logs._',
    '',
    '## Latest repository-authored failures',
    '',
    table(['Workflow', 'Event', 'Branch', 'SHA', 'Created'], latestRows),
    '## Recommended actions',
    '',
    recommendations.map((recommendation) => `- ${recommendation}`).join('\n'),
    '',
  ].join('\n');
}

function serializableSummary(summary, context) {
  return {
    generatedAt: context.generatedAt,
    repository: context.repository,
    lookbackDays: context.lookbackDays,
    totalCount: summary.totalCount,
    fetchedRuns: summary.fetchedRuns,
    truncated: summary.truncated,
    actionableFailures: summary.actionableRuns.length,
    dynamicFailures: summary.dynamicRuns.length,
    selfRunsExcluded: summary.selfRuns.length,
    uniqueCommits: summary.uniqueCommits,
    sampledRuns: summary.sampledRuns,
    sampledJobs: summary.sampledJobs,
    unavailableLogs: summary.unavailableLogs,
    workflows: summary.workflows.map((workflow) => ({
      ...workflow,
      commits: [...workflow.commits],
      branches: [...workflow.branches],
    })),
    events: summary.events.map(([event, failures]) => ({ event, failures })),
    branches: summary.branches.map(([branch, failures]) => ({ branch, failures })),
    steps: summary.steps.map((step) => ({
      ...step,
      workflows: [...step.workflows],
    })),
    causes: summary.causes.map((cause) => ({
      ...cause,
      runs: [...cause.runs],
      jobs: [...cause.jobs],
      workflows: [...cause.workflows],
      steps: [...cause.steps],
    })),
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class GitHubClient {
  constructor({ token, apiUrl = 'https://api.github.com' }) {
    this.token = token;
    this.apiUrl = apiUrl.replace(/\/$/u, '');
  }

  async request(urlOrPath, { accept = 'application/vnd.github+json', retries = 4 } = {}) {
    const url = urlOrPath.startsWith('http') ? urlOrPath : `${this.apiUrl}${urlOrPath}`;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(url, {
          redirect: 'follow',
          headers: {
            Accept: accept,
            Authorization: `Bearer ${this.token}`,
            'User-Agent': 'toonspectrum-ci-failure-analytics',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
        if (response.ok) return response;
        const body = await response.text();
        const error = new Error(`GitHub API ${response.status} for ${url}: ${body.slice(0, 500)}`);
        error.status = response.status;
        if (!RETRYABLE_STATUS.has(response.status) || attempt === retries) throw error;
        lastError = error;
      } catch (error) {
        lastError = error;
        const status = Number(error?.status ?? 0);
        if ((status && !RETRYABLE_STATUS.has(status)) || attempt === retries) throw error;
      }
      await sleep(Math.min(8_000, 500 * (2 ** attempt)));
    }
    throw lastError;
  }

  async json(pathname) {
    const response = await this.request(pathname);
    return response.json();
  }

  async text(pathname) {
    const response = await this.request(pathname, { accept: 'text/plain' });
    return response.text();
  }
}

async function mapLimit(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function isoDateDaysAgo(days) {
  const timestamp = Date.now() - days * 24 * 60 * 60 * 1_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

async function fetchFailedRuns(client, repository, { lookbackDays, maxRuns }) {
  const runs = [];
  let page = 1;
  let totalCount = 0;
  while (runs.length < maxRuns) {
    const query = new URLSearchParams({
      status: 'failure',
      per_page: '100',
      page: String(page),
      exclude_pull_requests: 'true',
    });
    if (lookbackDays > 0) query.set('created', `>=${isoDateDaysAgo(lookbackDays)}`);
    const payload = await client.json(`/repos/${repository}/actions/runs?${query}`);
    totalCount = Number(payload.total_count ?? totalCount);
    const pageRuns = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
    runs.push(...pageRuns.slice(0, Math.max(0, maxRuns - runs.length)));
    if (pageRuns.length < 100 || runs.length >= maxRuns) break;
    page += 1;
  }
  return {
    runs,
    totalCount,
    truncated: totalCount > runs.length,
  };
}

function failedStep(job) {
  return [...(job.steps ?? [])].reverse().find((step) => step.conclusion === 'failure')?.name
    ?? [...(job.steps ?? [])].reverse().find((step) => step.status === 'completed' && step.conclusion !== 'success')?.name
    ?? 'Unknown failed step';
}

async function inspectRun(client, repository, run, maxFailedJobsPerRun) {
  let jobsPayload;
  try {
    jobsPayload = await client.json(`/repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
  } catch (error) {
    return [{
      runId: run.id,
      runUrl: run.html_url,
      jobId: 0,
      jobName: 'Unavailable jobs metadata',
      workflowName: run.name,
      workflowPath: run.path,
      createdAt: run.created_at,
      failedStepName: 'Unable to read failed jobs',
      signatures: [{ category: 'api', signature: normalizeDiagnostic(error.message), example: '' }],
      logUnavailable: true,
    }];
  }

  const failedJobs = (jobsPayload.jobs ?? [])
    .filter((job) => job.conclusion === 'failure')
    .slice(0, maxFailedJobsPerRun);
  if (failedJobs.length === 0) {
    return [{
      runId: run.id,
      runUrl: run.html_url,
      jobId: 0,
      jobName: 'No failed job returned',
      workflowName: run.name,
      workflowPath: run.path,
      createdAt: run.created_at,
      failedStepName: 'Workflow failed without a failed job',
      signatures: [{ category: 'workflow', signature: 'Workflow failed without a failed job', example: '' }],
      logUnavailable: true,
    }];
  }

  return mapLimit(failedJobs, 2, async (job) => {
    const failedStepName = failedStep(job);
    try {
      const log = await client.text(`/repos/${repository}/actions/jobs/${job.id}/logs`);
      return {
        runId: run.id,
        runUrl: run.html_url,
        jobId: job.id,
        jobName: job.name,
        workflowName: run.name,
        workflowPath: run.path,
        createdAt: run.created_at,
        failedStepName,
        signatures: extractFailureSignatures(log, failedStepName),
        logUnavailable: false,
      };
    } catch (error) {
      return {
        runId: run.id,
        runUrl: run.html_url,
        jobId: job.id,
        jobName: job.name,
        workflowName: run.name,
        workflowPath: run.path,
        createdAt: run.created_at,
        failedStepName,
        signatures: extractFailureSignatures('', failedStepName),
        logUnavailable: true,
        logError: normalizeDiagnostic(error.message),
      };
    }
  });
}

function configuration(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  return {
    repository: String(args.repository ?? env.GITHUB_REPOSITORY ?? '').trim(),
    token: String(env.GH_TOKEN ?? env.GITHUB_TOKEN ?? '').trim(),
    apiUrl: String(env.GITHUB_API_URL ?? 'https://api.github.com').trim(),
    lookbackDays: integer(args.lookbackDays ?? env.CI_FAILURE_LOOKBACK_DAYS, DEFAULTS.lookbackDays, { min: 0, max: 3_650 }),
    maxRuns: integer(args.maxRuns ?? env.CI_FAILURE_MAX_RUNS, DEFAULTS.maxRuns, { min: 1, max: 50_000 }),
    maxLogRuns: integer(args.maxLogRuns ?? env.CI_FAILURE_MAX_LOG_RUNS, DEFAULTS.maxLogRuns, { min: 0, max: 1_000 }),
    maxFailedJobsPerRun: integer(args.maxFailedJobsPerRun ?? env.CI_FAILURE_MAX_FAILED_JOBS_PER_RUN, DEFAULTS.maxFailedJobsPerRun, { min: 1, max: 20 }),
    concurrency: integer(args.concurrency ?? env.CI_FAILURE_CONCURRENCY, DEFAULTS.concurrency, { min: 1, max: 10 }),
    includeDynamic: boolean(args.includeDynamic ?? env.CI_FAILURE_INCLUDE_DYNAMIC, false),
    outputDir: String(args.outputDir ?? env.CI_FAILURE_OUTPUT_DIR ?? DEFAULTS.outputDir),
  };
}

async function main() {
  const config = configuration();
  if (!config.repository.includes('/')) throw new Error('GITHUB_REPOSITORY or --repository must be owner/name');
  if (!config.token) throw new Error('GH_TOKEN or GITHUB_TOKEN is required');

  const client = new GitHubClient({ token: config.token, apiUrl: config.apiUrl });
  const census = await fetchFailedRuns(client, config.repository, config);
  const inspectableRuns = census.runs.filter((run) => (
    !isSelfRun(run) && (config.includeDynamic || !isDynamicRun(run))
  ));
  const sampledRuns = selectRunsForLogSampling(inspectableRuns, config.maxLogRuns);
  const nestedDiagnostics = await mapLimit(
    sampledRuns,
    config.concurrency,
    (run) => inspectRun(client, config.repository, run, config.maxFailedJobsPerRun),
  );
  const jobDiagnostics = nestedDiagnostics.flat();
  const summary = aggregateFailureData({
    runs: census.runs,
    jobDiagnostics,
    totalCount: census.totalCount,
    truncated: census.truncated,
  });
  const context = {
    generatedAt: new Date().toISOString(),
    repository: config.repository,
    lookbackDays: config.lookbackDays,
  };
  const markdown = renderMarkdownReport(summary, context);
  const json = `${JSON.stringify(serializableSummary(summary, context), null, 2)}\n`;

  await mkdir(config.outputDir, { recursive: true });
  const markdownPath = path.join(config.outputDir, 'report.md');
  const jsonPath = path.join(config.outputDir, 'report.json');
  await Promise.all([
    writeFile(markdownPath, markdown, 'utf8'),
    writeFile(jsonPath, json, 'utf8'),
  ]);

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, 'utf8');
  }
  process.stdout.write(markdown);
  process.stdout.write(`\nJSON report: ${jsonPath}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
