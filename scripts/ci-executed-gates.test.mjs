import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { REQUIRED_CORE_GATES } from "./ci-core-gate.mjs";
import {
  REQUIRED_VITEST_TARGETS,
  SHARD_NAMES,
  assertShardManifest,
  executionTargetsByShard,
  targetIsCovered,
  targetsByShard,
} from "./ci-core-regression-shards.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const source = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const jobs = source.slice(source.indexOf("\njobs:\n") + 7).split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m);

function job(name) {
  const block = jobs.find((entry) => entry.startsWith(`  ${name}:\n`));
  assert.ok(block, `missing job: ${name}`);
  return block;
}

function indexBefore(block, first, second) {
  const left = block.indexOf(first);
  const right = block.indexOf(second);
  assert.ok(left >= 0, `missing command: ${first}`);
  assert.ok(right > left, `${first} must run before ${second}`);
}

test("mandatory lanes start independently and retain fail-closed coverage", () => {
  assert.doesNotMatch(source, /CI_CORE_BYPASS|continue-on-error|if:\s*\$\{\{\s*false/);
  assert.match(source, /permissions:\n {2}contents: read/);

  for (const name of REQUIRED_CORE_GATES) {
    const block = job(name);
    assert.doesNotMatch(block, /^ {4}needs:/m, `${name} must start independently`);
    if (name !== "core") assert.match(block, /pnpm install --frozen-lockfile/);
  }

  assert.match(job("lint"), /pnpm run lint:strict/);
  assert.match(job("typecheck"), /pnpm run typecheck\n/);
  assert.match(job("typecheck"), /pnpm run typecheck:cloudflare-realtime/);
  assert.match(job("serial"), /pnpm run test:perf/);
  assert.match(job("build"), /pnpm run build:bundle/);
  assert.match(job("build"), /pnpm run check:studio-bundle/);
  assert.doesNotMatch(job("build"), /pnpm run build(?!:)/);
});

test("product regressions execute as five semantic matrix shards", () => {
  const block = job("static");
  assert.match(block, /name: Core regression shard \/ \$\{\{ matrix\.shard \}\}/);
  assert.match(block, /fail-fast: false/);
  assert.match(block, /node scripts\/ci-core-regression-shards\.mjs "\$\{\{ matrix\.shard \}\}"/);
  assert.doesNotMatch(block, /pnpm exec vitest run/);
  for (const name of SHARD_NAMES) assert.match(block, new RegExp(`- ${name}\\n`));
});

test("required regression manifest is sorted, unique and covered exactly once", () => {
  assert.doesNotThrow(() => assertShardManifest());
  assert.ok(REQUIRED_VITEST_TARGETS.length >= 160, "unexpected regression coverage shrink");
  assert.deepEqual(REQUIRED_VITEST_TARGETS, [...REQUIRED_VITEST_TARGETS].sort());
  assert.equal(new Set(REQUIRED_VITEST_TARGETS).size, REQUIRED_VITEST_TARGETS.length);

  const required = targetsByShard();
  const execution = executionTargetsByShard();
  const flattened = SHARD_NAMES.flatMap((name) => required[name]);
  assert.deepEqual(flattened.sort(), [...REQUIRED_VITEST_TARGETS].sort());
  assert.equal(new Set(flattened).size, flattened.length);

  for (const name of SHARD_NAMES) {
    assert.ok(required[name].length > 0, `${name} cannot be empty`);
    for (const target of required[name]) {
      assert.ok(targetIsCovered(target, execution[name]), `${name}:${target}`);
    }
  }
});

test("dependency-free workflow contracts run before installation", () => {
  const typecheck = job("typecheck");
  indexBefore(typecheck, "node --test", "pnpm install --frozen-lockfile");
  indexBefore(typecheck, "python3 scripts/verify-pr-workflow-fanout.py", "pnpm install --frozen-lockfile");
  for (const contract of [
    "scripts/ci-core-gate.test.mjs",
    "scripts/ci-core-regression-shards.test.mjs",
    "scripts/ci-executed-gates.test.mjs",
    "scripts/studio-bundle-temporary-allowance.test.mjs",
    "scripts/ci-merge-reliability.test.mjs",
  ]) {
    assert.match(typecheck, new RegExp(contract.replaceAll(".", "\\.")));
  }
  assert.match(typecheck, /filter: blob:none/);
  assert.match(typecheck, /!\/apps\/web\/public\/assets\//);
  assert.match(job("lint"), /filter: blob:none/);
});

test("protected core aggregates every mandatory lane without another checkout", () => {
  const core = job("core");
  assert.match(core, new RegExp(`needs: \\[${REQUIRED_CORE_GATES.join(", ")}\\]`));
  assert.match(core, /if: \$\{\{ always\(\) && !cancelled\(\) \}\}/);
  assert.match(core, /CORE_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
  assert.doesNotMatch(core, /actions\/checkout|actions\/setup-node|pnpm install/);
  for (const name of REQUIRED_CORE_GATES) assert.match(core, new RegExp(`"${name}"`));

  const verify = job("verify");
  assert.match(verify, /needs: core/);
  assert.match(verify, /if: \$\{\{ always\(\) && !cancelled\(\) \}\}/);
  assert.match(verify, /test "\$CORE_RESULT" = success/);
});

test("focused workflows preserve one setup and distinct status names", () => {
  const session = readFileSync(
    new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url),
    "utf8",
  );
  const sessionJobs = session.slice(session.indexOf("\njobs:\n") + 7)
    .split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m)
    .filter((entry) => /^ {2}[a-z][a-z0-9-]*:\n/.test(entry));
  assert.equal(sessionJobs.length, 1, "session validation should pay setup cost once");
  assert.match(session, /pnpm exec vitest related/);
  assert.doesNotMatch(session, /pnpm (?:run )?build(?:\s|$)|pnpm exec tsc/);

  const integration = readFileSync(
    new URL("../.github/workflows/toonstudio-integration.yml", import.meta.url),
    "utf8",
  );
  assert.match(integration, /name: ToonStudio integration \/ \$\{\{ matrix\.track \}\}/);
  assert.match(integration, /run: bash scripts\/verify-toonstudio-integration\.sh "\$\{\{ matrix\.track \}\}"/);
});

test("production visual audit and protected core share the Vitest policy test", () => {
  const audit = readFileSync(
    new URL("../.github/workflows/studio-3d-production-visual-audit.yml", import.meta.url),
    "utf8",
  );
  assert.match(audit, /pnpm exec vitest run scripts\/lib\/studio-3d-production-audit-policy\.test\.mjs/);
  assert.equal(
    targetsByShard()["studio-3d"].filter((target) => (
      target === "scripts/lib/studio-3d-production-audit-policy.test.mjs"
    )).length,
    1,
  );
});
