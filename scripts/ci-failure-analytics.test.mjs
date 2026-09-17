import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateFailureData,
  extractFailureSignatures,
  isDynamicRun,
  normalizeDiagnostic,
  renderMarkdownReport,
  selectRunsForLogSampling,
  stripAnsi,
} from './ci-failure-analytics.mjs';

test('stripAnsi and normalizeDiagnostic remove terminal and runner-specific noise', () => {
  assert.equal(stripAnsi('\u001b[31mboom\u001b[0m'), 'boom');
  assert.equal(
    normalizeDiagnostic('/home/runner/work/toonspectrum/toonspectrum/apps/web/a.tsx(1,2): error'),
    'apps/web/a.tsx(1,2): error',
  );
});

test('extractFailureSignatures groups repeated TypeScript errors by normalized cause', () => {
  const log = [
    "2026-09-17T15:58:39.0668970Z ##[error]apps/web/a.tsx(441,8): error TS18048: 'task.assigneeIds' is possibly 'undefined'.",
    "2026-09-17T15:58:39.0853580Z ##[error]apps/web/a.tsx(444,31): error TS18048: 'task.assigneeIds' is possibly 'undefined'.",
    '2026-09-17T15:58:41.5956490Z ##[error]Process completed with exit code 2.',
  ].join('\n');
  assert.deepEqual(extractFailureSignatures(log, 'Typecheck'), [{
    category: 'typescript',
    signature: "TS18048: 'task.assigneeIds' is possibly 'undefined'.",
    example: "##[error]apps/web/a.tsx(441,8): error TS18048: 'task.assigneeIds' is possibly 'undefined'.",
  }]);
});

test('extractFailureSignatures recognizes resource failures and step fallback', () => {
  assert.equal(
    extractFailureSignatures('FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory', 'Build')[0].category,
    'resource',
  );
  assert.deepEqual(extractFailureSignatures('', 'Install dependencies')[0], {
    category: 'dependency',
    signature: 'Failed step: Install dependencies',
    example: 'Install dependencies',
  });
});

test('dynamic runs are separated from repository-authored workflows', () => {
  assert.equal(isDynamicRun({ event: 'dynamic', path: 'dynamic/agents/security' }), true);
  assert.equal(isDynamicRun({ event: 'push', path: '.github/workflows/ci.yml' }), false);
});

test('log sampling is round-robin across workflows before taking deeper history', () => {
  const runs = [
    { id: 1, path: 'a.yml', created_at: '2026-09-18T03:00:00Z' },
    { id: 2, path: 'a.yml', created_at: '2026-09-18T02:00:00Z' },
    { id: 3, path: 'b.yml', created_at: '2026-09-18T01:00:00Z' },
  ];
  assert.deepEqual(selectRunsForLogSampling(runs, 2).map((run) => run.id).sort(), [1, 3]);
});

test('aggregate and markdown expose cross-workflow root-cause fan-out', () => {
  const runs = [
    {
      id: 11,
      name: 'A',
      path: '.github/workflows/a.yml',
      event: 'push',
      head_branch: 'main',
      head_sha: 'a'.repeat(40),
      created_at: '2026-09-18T01:00:00Z',
      html_url: 'https://example.test/11',
    },
    {
      id: 12,
      name: 'B',
      path: '.github/workflows/b.yml',
      event: 'push',
      head_branch: 'main',
      head_sha: 'a'.repeat(40),
      created_at: '2026-09-18T02:00:00Z',
      html_url: 'https://example.test/12',
    },
    {
      id: 13,
      name: 'Code scanning AI findings',
      path: 'dynamic/agents/security',
      event: 'dynamic',
      head_branch: 'feature',
      head_sha: 'b'.repeat(40),
      created_at: '2026-09-18T03:00:00Z',
    },
  ];
  const signature = {
    category: 'typescript',
    signature: "TS18048: property is possibly 'undefined'.",
    example: '',
  };
  const diagnostics = [
    {
      runId: 11,
      runUrl: 'https://example.test/11',
      jobId: 101,
      workflowName: 'A',
      workflowPath: '.github/workflows/a.yml',
      createdAt: '2026-09-18T01:00:00Z',
      failedStepName: 'Typecheck',
      signatures: [signature],
      logUnavailable: false,
    },
    {
      runId: 12,
      runUrl: 'https://example.test/12',
      jobId: 102,
      workflowName: 'B',
      workflowPath: '.github/workflows/b.yml',
      createdAt: '2026-09-18T02:00:00Z',
      failedStepName: 'Typecheck and production build',
      signatures: [signature],
      logUnavailable: false,
    },
  ];
  const summary = aggregateFailureData({ runs, jobDiagnostics: diagnostics, totalCount: 3 });
  assert.equal(summary.actionableRuns.length, 2);
  assert.equal(summary.dynamicRuns.length, 1);
  assert.equal(summary.causes[0].occurrences, 2);
  assert.equal(summary.causes[0].workflows.size, 2);
  const markdown = renderMarkdownReport(summary, {
    repository: 'blue45f/toonspectrum',
    generatedAt: '2026-09-18T04:00:00Z',
    lookbackDays: 120,
  });
  assert.match(markdown, /Cross-workflow fan-out/u);
  assert.match(markdown, /Repository-authored failures: \*\*2\*\*/u);
  assert.match(markdown, /TS18048/u);
});
