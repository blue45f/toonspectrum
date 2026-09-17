import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { REQUIRED_CORE_GATES } from "./ci-core-gate.mjs";
import {
  loadRequiredTargets,
  resolveRequiredTargets,
} from "./run-core-vitest.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const source = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const requiredTargets = loadRequiredTargets();
const jobs = source.slice(source.indexOf("\njobs:\n") + 7)
  .split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m);

function job(name) {
  const block = jobs.find((entry) => entry.startsWith(`  ${name}:\n`));
  assert.ok(block, `missing job: ${name}`);
  return block;
}

test("core retains every mandatory quality lane without a bypass", () => {
  assert.doesNotMatch(source, /CI_CORE_BYPASS|continue-on-error|if:\s*\$\{\{\s*false/);
  assert.match(source, /permissions:\n {2}contents: read\n {2}pull-requests: read/);

  for (const name of ["lint", "typecheck", "static", "serial", "build"]) {
    assert.doesNotMatch(job(name), /^ {4}if:/m, `${name} must not be conditionally skipped`);
    assert.match(job(name), /pnpm install --frozen-lockfile/);
  }
  const lint = job("lint");
  assert.match(lint, /node scripts\/lint-changed\.mjs --files-from=/);
  assert.match(lint, /--full-on-config/);
  assert.match(lint, /pnpm run lint:strict/);

  assert.match(job("typecheck"), /pnpm run typecheck\n/);
  assert.match(job("typecheck"), /pnpm run typecheck:cloudflare-realtime/);
  for (const command of [
    "node --experimental-strip-types --test --test-concurrency=1",
    "node scripts/run-core-vitest.mjs",
    "pnpm run validate:architecture",
    "pnpm run verify:csp",
    "pnpm run verify:toolchain-coverage",
    "pnpm run test:studio-material-brush",
    "scripts/audit-studio-brush-quality-portfolio.mts",
  ]) {
    assert.ok(job("static").includes(command), `missing static gate: ${command}`);
  }
  for (const script of [
    "scripts/api-followup-ci-policy.test.mjs",
    "scripts/api-followup-unit.test.mjs",
    "scripts/studio-offline-resilience.test.mjs",
    "scripts/verify-studio-menus-ci.test.mjs",
    "scripts/verify-studio-p2p-huddle.test.mjs",
  ]) {
    assert.ok(job("static").includes(script), `missing Node regression contract: ${script}`);
  }
  for (const command of [
    "pnpm --filter @webtoon-nest/api build",
    "pnpm run build:bundle",
    "pnpm run check:studio-bundle",
    "test -s dist/.vite/manifest.json",
  ]) {
    assert.ok(job("build").includes(command), `missing build gate: ${command}`);
  }
  assert.doesNotMatch(job("build"), /pnpm run build(?!:)/, "web typecheck must not repeat in build");
  assert.ok(job("serial").includes("pnpm run test:perf"));
});

test("protected core aggregates every lane without another checkout", () => {
  assert.ok(job("core").includes(`needs: [${REQUIRED_CORE_GATES.join(", ")}]`));
  assert.ok(job("core").includes("if: ${{ always() }}"));
  assert.ok(job("core").includes("CORE_RESULTS: ${{ toJSON(needs) }}"));
  for (const name of REQUIRED_CORE_GATES) {
    assert.ok(job("core").includes(`"${name}"`), `inline aggregate is missing ${name}`);
  }
  assert.doesNotMatch(job("core"), /actions\/checkout|pnpm install/);
  assert.ok(job("verify").includes("needs: core"));
  assert.ok(job("verify").includes('test "$CORE_RESULT" = success'));
});

test("mandatory lanes start independently and dependency-free contracts run first", () => {
  assert.doesNotMatch(source, /^ {2}preflight:\n/m);
  for (const name of ["lint", "typecheck", "static", "serial", "build"]) {
    assert.doesNotMatch(job(name), /^ {4}needs:/m, `${name} should start independently`);
  }
  const typecheck = job("typecheck");
  const contractTest = typecheck.indexOf("node --test scripts/ci-core-gate.test.mjs");
  const fanoutPolicy = typecheck.indexOf("python3 scripts/verify-pr-workflow-fanout.py");
  const install = typecheck.indexOf("pnpm install --frozen-lockfile");
  assert.ok(contractTest >= 0, "typecheck lane must execute CI contract tests");
  assert.ok(fanoutPolicy > contractTest, "fanout policy should follow the contract suite");
  assert.ok(install > fanoutPolicy, "dependency installation must follow dependency-free checks");
  for (const contract of [
    "scripts/lint-changed-policy.test.mjs",
    "scripts/run-core-vitest.test.mjs",
  ]) {
    assert.ok(typecheck.includes(contract), `preflight is missing ${contract}`);
  }

  for (const excludedPath of [
    "!/apps/web/public/assets/",
    "!/apps/web/public/vrm/",
    "!/artifacts/",
    "!/docs/",
    "!/tests/benchmarks/results/",
  ]) {
    assert.ok(typecheck.includes(excludedPath), `typecheck sparse checkout is missing ${excludedPath}`);
  }
  for (const requiredManifest of [
    "/apps/web/public/assets/3d/environments/refined-v6/manifest.json",
    "/apps/web/public/assets/3d/environments/expansion-v1/manifest.json",
  ]) {
    assert.ok(typecheck.includes(requiredManifest), `typecheck checkout is missing ${requiredManifest}`);
  }
});
test("PR lint is scoped while push and merge validation stay repository-wide", () => {
  const lint = job("lint");
  assert.match(lint, /if: github\.event_name == 'pull_request'/);
  assert.match(lint, /pulls\/\$PR_NUMBER\/files\?per_page=100&page=\$page/);
  assert.match(lint, /node scripts\/lint-changed\.mjs --files-from=/);
  assert.match(lint, /--full-on-config/);
  assert.match(lint, /if: github\.event_name != 'pull_request'/);
  assert.match(lint, /run: pnpm run lint:strict/);
  assert.match(lint, /path: node_modules\/\.cache\/eslint\n/);
  for (const path of [
    "filter: blob:none",
    "!/apps/web/public/assets/",
    "/apps/web/public/assets/reference-rebuild/",
    "!/apps/web/public/vrm/",
  ]) {
    assert.ok(lint.includes(path), `lint sparse checkout is missing ${path}`);
  }
});

test("core Vitest coverage is manifest-driven and starts one runner process", () => {
  assert.deepEqual(requiredTargets, [...requiredTargets].sort());
  assert.equal(new Set(requiredTargets).size, requiredTargets.length);
  assert.ok(requiredTargets.length >= 160, "unexpected regression coverage shrink");

  const resolved = resolveRequiredTargets(requiredTargets);
  assert.ok(resolved.length >= requiredTargets.length);
  assert.equal(new Set(resolved).size, resolved.length);

  const staticJob = job("static");
  assert.equal((staticJob.match(/node scripts\/run-core-vitest\.mjs/g) ?? []).length, 1);
  assert.doesNotMatch(staticJob, /pnpm exec vitest run/);
});
test("static regressions use sparse checkout and one consolidated Node test command", () => {
  const staticJob = job("static");
  for (const path of [
    "filter: blob:none",
    "!/apps/web/public/assets/",
    "/apps/web/public/assets/reference-rebuild/",
    "!/apps/web/public/vrm/",
  ]) {
    assert.ok(staticJob.includes(path), `static sparse checkout is missing ${path}`);
  }
  for (const fixture of [
    "/apps/web/public/vrm/AvatarSample_B.vrm",
    "/apps/web/public/vrm/sample.vrm",
    "/docs/studio-selection-benchmark.md",
  ]) {
    assert.ok(staticJob.includes(fixture), `static sparse checkout is missing ${fixture}`);
  }
  assert.equal(
    (staticJob.match(/node --experimental-strip-types --test --test-concurrency=1/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(staticJob, /node --test scripts\//);
  assert.doesNotMatch(staticJob, /node --experimental-strip-types --test scripts\//);
});

test("production visual audit and protected core share the Vitest policy suite", () => {
  const audit = readFileSync(
    new URL("../.github/workflows/studio-3d-production-visual-audit.yml", import.meta.url),
    "utf8",
  );
  assert.ok(audit.includes(
    "      - name: Verify audit policy\n" +
    "        run: pnpm exec vitest run scripts/lib/studio-3d-production-audit-policy.test.mjs\n",
  ));
  assert.ok(requiredTargets.includes("scripts/lib/studio-3d-production-audit-policy.test.mjs"));
  assert.ok(job("static").includes("node scripts/run-core-vitest.mjs"));
});
test("manual validation cannot cancel push validation and retries retain evidence", () => {
  assert.ok(source.includes(
    "group: core-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}",
  ));
  assert.ok(job("serial").includes("name: core-serial-attempt-${{ github.run_attempt }}"));
  assert.ok(job("build").includes("name: core-build-attempt-${{ github.run_attempt }}"));
});

test("ToonStudio session validation shares one setup and delegates full gates", () => {
  const session = readFileSync(
    new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url),
    "utf8",
  );
  const sessionJobs = session.slice(session.indexOf("\njobs:\n") + 7)
    .split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m)
    .filter((entry) => /^ {2}[a-z][a-z0-9-]*:\n/.test(entry));
  assert.equal(sessionJobs.length, 1, "session validation should pay setup cost once");
  assert.match(session, /filter: blob:none/);
  assert.match(session, /!\/apps\/web\/public\/assets\//);
  assert.match(session, /git diff --name-only -z --diff-filter=ACMR "\$BASE_SHA" HEAD/);
  assert.match(session, /pnpm exec eslint --max-warnings=0 --no-warn-ignored/);
  assert.match(session, /pnpm exec vitest related/);
  assert.doesNotMatch(session, /lint:quick|pnpm (?:run )?build(?:\s|$)|pnpm exec tsc/);
});
test("focused integration checks cannot collide with the protected core status", () => {
  const integration = readFileSync(
    new URL("../.github/workflows/toonstudio-integration.yml", import.meta.url),
    "utf8",
  );
  const start = integration.indexOf("\n  validate:\n");
  assert.ok(start >= 0, "missing focused integration validation job");
  const validation = integration.slice(start);
  const displayName = validation.match(/^ {4}name: (.+)$/m)?.[1];
  assert.ok(displayName, "integration checks must declare a namespaced display name");
  const tracks = ["core", "ui", "editor"];
  const checks = tracks.map((track) => displayName.replace("${{ matrix.track }}", track));
  assert.deepEqual(checks, tracks.map((track) => `ToonStudio integration / ${track}`));
  assert.equal(new Set(checks).size, tracks.length);
  assert.ok(checks.every((name) => name !== "core" && name !== "verify"));
  assert.match(job("core"), /^ {4}name: core$/m, "preserve protected merge gate");
  assert.match(
    validation,
    /run: bash scripts\/verify-toonstudio-integration\.sh "\$\{\{ matrix\.track \}\}"/,
  );
});
