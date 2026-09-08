import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parse } from 'yaml';

const { test } = process.env.VITEST ? await import('vitest') : await import('node:test');
const workflow = parse(readFileSync(new URL('../../.github/workflows/studio-gpu-soak-repro.yml', import.meta.url), 'utf8'));
const job = workflow.jobs['linux-webgpu'];

test('the dedicated job is limited to the two Linux cases and preserves evidence on failure', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.on.push.branches, ['release/salvage-integration-20260908']);
  assert.deepEqual(workflow.on.push.paths, [
    '.github/workflows/studio-gpu-soak-repro.yml', 'scripts/qa/studio-webgpu-soak-command.mjs',
    'scripts/qa/studio-soak-config.mjs', 'scripts/qa/studio-soak-runner.mjs',
  ]);
  assert.equal(workflow.on.workflow_dispatch.inputs.expected_sha.required, true);
  assert.equal(workflow.concurrency, undefined);
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.ok(job['timeout-minutes'] >= 20 && job['timeout-minutes'] <= 30);
  assert.equal(job.env.QA_SUITE, 'brush-raster');
  assert.deepEqual(job.env.QA_CASE.split(','), ['webgpu-brush-parity', 'professional-bristle']);
  assert.equal(job.env.JIRA_BASE_URL, '');
  const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref, '${{ github.sha }}');
  assert.equal(checkout.with['persist-credentials'], false);
  assert.ok(job.steps.some((step) => step.run === 'node scripts/qa/studio-chromium-inapp-suite-runner.mjs'));
  assert.ok(job.steps.some((step) => step.run === 'pnpm exec playwright install --with-deps chromium'));
  const upload = job.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload.if, 'always()');
  assert.equal(upload.with.path, 'artifacts/studio-gpu-soak-repro');
});

for (const event of ['push', 'workflow_dispatch']) {
  for (const mismatch of [false, true]) {
    test(`the actual ${event} source step ${mismatch ? 'rejects stale source' : 'binds the checked-out SHA'}`, () => {
      const directory = mkdtempSync(join(tmpdir(), 'studio-gpu-soak-workflow-'));
      try {
        execFileSync('git', ['init', '-q', directory]);
        execFileSync('git', ['-c', 'user.name=QA Fixture', '-c', 'user.email=qa@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: directory });
        const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();
        const expected = mismatch ? '0'.repeat(40) : actual;
        const evidence = join(directory, 'evidence');
        const result = spawnSync('/bin/bash', ['-e', '-c', job.steps.find((step) => step.id === 'source').run], {
          cwd: directory, encoding: 'utf8',
          env: { ...process.env, GITHUB_EVENT_NAME: event, EXPECTED_SHA: expected,
            GITHUB_SHA: event === 'push' ? expected : actual, GITHUB_REF: 'refs/heads/release/salvage-integration-20260908',
            QA_SUITE: job.env.QA_SUITE, QA_CASE: job.env.QA_CASE, QA_EVIDENCE_DIR: evidence },
        });
        assert.equal(result.status, mismatch ? 1 : 0, result.stderr);
        const receipt = JSON.parse(readFileSync(join(evidence, 'source.json'), 'utf8'));
        assert.equal(receipt.actual, actual);
        assert.equal(receipt.expected, expected);
        assert.equal(receipt.event, event);
        assert.equal(receipt.cases, job.env.QA_CASE);
        if (mismatch) assert.match(result.stderr, /Source SHA mismatch/);
      } finally { rmSync(directory, { recursive: true, force: true }); }
    });
  }
}
