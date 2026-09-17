import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { REQUIRED_CORE_GATES } from "./ci-core-gate.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const source = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const requiredTargets = readFileSync(
  new URL("./ci-required-vitest-targets.txt", import.meta.url),
  "utf8",
).trim().split(/\r?\n/).filter(Boolean);
const jobs = source.slice(source.indexOf("\njobs:\n") + 7).split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m);

function job(name) {
  const block = jobs.find((entry) => entry.startsWith(`  ${name}:\n`));
  assert.ok(block, `missing job: ${name}`);
  return block;
}

// Lex the limited shell syntax used by explicit CI commands. This is intentionally
// dependency-free so the contract runs before pnpm install.
function normalizeShellSource(block) {
  let result = "";
  let quote = null;
  let wordStart = true;
  for (let index = 0; index < block.length; index += 1) {
    const char = block[index];
    const next = block[index + 1];
    if (quote === null && char === "#" && wordStart) {
      while (index < block.length && block[index] !== "\n") index += 1;
      result += "\n";
      wordStart = true;
      continue;
    }
    if (quote !== "'" && char === "\\" && next !== undefined) {
      if (next === "\n" || (next === "\r" && block[index + 2] === "\n")) {
        index += next === "\r" ? 2 : 1;
        continue;
      }
      if (quote === null || /[$`"\\]/.test(next)) {
        result += char + next;
        index += 1;
        wordStart = false;
        continue;
      }
    }
    if (quote === null && (char === "'" || char === '"')) quote = char;
    else if (quote === char) quote = null;
    result += char;
    wordStart = quote === null && /[\s|&;()<>]/.test(char);
  }
  return result;
}

function executedVitestTargets(block) {
  return normalizeShellSource(block)
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:-\s*)?(?:run:\s*)?pnpm exec vitest run(?:\s|$)/.test(line))
    .flatMap((line) => line.trim().split(/\s+/))
    .map((word) => word.replace(/^["']|["']$/g, ""))
    .filter((word) => /^(?:apps|packages|scripts)\/[\w./*?-]+$/.test(word));
}

function assertRequiredTargets(block) {
  const targets = executedVitestTargets(block);
  const actual = new Set(targets);
  assert.equal(actual.size, targets.length, "duplicate Vitest target arguments in static CI");
  for (const path of requiredTargets) {
    assert.ok(actual.has(path), `missing mandatory Vitest target: ${path}`);
  }
}

test("core retains every mandatory quality lane without a bypass", () => {
  assert.doesNotMatch(source, /CI_CORE_BYPASS|continue-on-error|if:\s*\$\{\{\s*false/);
  assert.match(source, /permissions:\n {2}contents: read/);

  for (const name of ["lint", "typecheck", "static", "serial", "build"]) {
    assert.doesNotMatch(job(name), /^ {4}if:/m, `${name} must not be conditionally skipped`);
    assert.match(job(name), /pnpm install --frozen-lockfile/);
  }

  assert.match(job("lint"), /pnpm run lint:strict/);
  assert.match(job("typecheck"), /pnpm run typecheck\n/);
  assert.match(job("typecheck"), /pnpm run typecheck:cloudflare-realtime/);
  for (const command of [
    "pnpm run validate:architecture",
    "pnpm run verify:csp",
    "pnpm run verify:toolchain-coverage",
    "pnpm exec vitest run",
    "node --test scripts/verify-studio-p2p-huddle.test.mjs",
    "node --test scripts/studio-offline-resilience.test.mjs",
    "node --test scripts/verify-studio-menus-ci.test.mjs",
    "node --experimental-strip-types --test scripts/api-followup-unit.test.mjs",
    "node --test scripts/api-followup-ci-policy.test.mjs",
    "pnpm run test:studio-material-brush",
    "scripts/audit-studio-brush-quality-portfolio.mts",
  ]) {
    assert.ok(job("static").includes(command), `missing static gate: ${command}`);
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

test("protected core aggregates every lane without checking out the repository again", () => {
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

test("workflow contracts share the sparse typecheck lane while expensive lanes start independently", () => {
  assert.doesNotMatch(source, /^ {2}preflight:\n/m, "standalone preflight should not consume a runner");
  for (const name of ["lint", "typecheck", "static", "serial", "build"]) {
    assert.doesNotMatch(job(name), /^ {4}needs:/m, `${name} should start independently`);
  }

  const typecheck = job("typecheck");
  const contractTest = typecheck.indexOf("node --test scripts/ci-core-gate.test.mjs scripts/ci-executed-gates.test.mjs");
  const fanoutPolicy = typecheck.indexOf("python3 scripts/verify-pr-workflow-fanout.py");
  const install = typecheck.indexOf("pnpm install --frozen-lockfile");
  assert.ok(contractTest >= 0, "typecheck lane must execute CI contract tests");
  assert.ok(fanoutPolicy > contractTest, "fanout policy should follow the contract suite");
  assert.ok(install > fanoutPolicy, "dependency installation must follow dependency-free preflight checks");

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
    assert.ok(typecheck.includes(requiredManifest), `typecheck sparse checkout is missing ${requiredManifest}`);
  }
  assert.ok(typecheck.includes("filter: blob:none"));

  const lint = job("lint");
  assert.ok(lint.includes("filter: blob:none"));
  assert.ok(lint.includes("!/apps/web/public/assets/"));
  assert.ok(lint.includes("/apps/web/public/assets/reference-rebuild/"));
  assert.ok(lint.includes("!/apps/web/public/vrm/"));
  assert.doesNotMatch(job("static"), /^\s+if:/m, "mandatory regressions cannot be skipped");
});

test("the required Vitest manifest is sorted, unique and fully executed", () => {
  assert.deepEqual(requiredTargets, [...requiredTargets].sort());
  assert.equal(new Set(requiredTargets).size, requiredTargets.length);
  assert.ok(requiredTargets.length >= 160, "unexpected regression coverage shrink");
  assertRequiredTargets(job("static"));
});

test("additional Vitest coverage remains allowed", () => {
  const extra = `${job("static")}\n      - name: Additional regressions\n        run: pnpm exec vitest run apps/web/src/Additional.test.tsx packages/core/src/additional.test.ts\n`;
  assertRequiredTargets(extra);
});

test("comments, echo output and duplicate arguments cannot fake execution", () => {
  const path = requiredTargets[0];
  const missing = job("static").replace(path, "apps/web/src/unrelated-replacement.test.ts");
  const decoys = `${missing}\n      # pnpm exec vitest run ${path}\n      - run: echo "pnpm exec vitest run ${path}"\n`;
  assert.throws(() => assertRequiredTargets(decoys), /missing mandatory Vitest target/);

  const duplicated = `${job("static")}\n      - run: pnpm exec vitest run ${path}\n`;
  assert.throws(() => assertRequiredTargets(duplicated), /duplicate Vitest target/);
});

test("production visual audit and protected core both use the Vitest policy suite", () => {
  const audit = readFileSync(
    new URL("../.github/workflows/studio-3d-production-visual-audit.yml", import.meta.url),
    "utf8",
  );
  assert.ok(audit.includes("      - name: Verify audit policy\n        run: pnpm exec vitest run scripts/lib/studio-3d-production-audit-policy.test.mjs\n"));
  assert.doesNotMatch(audit, /node\s+--test\s+scripts\/lib\/studio-3d-production-audit-policy\.test\.mjs/);
  assert.ok(job("static").includes("run: pnpm exec vitest run scripts/lib/studio-3d-production-audit-policy.test.mjs"));
});

test("manual validation cannot cancel push validation and retries retain evidence", () => {
  assert.ok(source.includes("group: core-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}"));
  assert.ok(job("serial").includes("name: core-serial-attempt-${{ github.run_attempt }}"));
  assert.ok(job("build").includes("name: core-build-attempt-${{ github.run_attempt }}"));
});

const shellCommentFixtures = [
  ["continued comment argument", "pnpm exec vitest run apps/kept.test.ts \\\n  # packages/hidden.test.ts\n", ["apps/kept.test.ts"]],
  ["inline comment", "pnpm exec vitest run apps/kept.test.ts # packages/hidden.test.ts\n", ["apps/kept.test.ts"]],
  ["comment backslash cannot consume the next command", "pnpm exec vitest run apps/first.test.ts # ignored \\\npnpm exec vitest run packages/second.test.ts\n", ["apps/first.test.ts", "packages/second.test.ts"]],
  ["standalone comment continuation cannot enable a bare path", "pnpm exec vitest run apps/kept.test.ts \\\n  # ignored \\\n  packages/hidden.test.ts\n", ["apps/kept.test.ts"]],
  ["quoted hashes are not comments", "pnpm exec vitest run --testNamePattern '#literal' \"apps/kept.test.ts\" # packages/hidden.test.ts\n", ["apps/kept.test.ts"]],
  ["escaped hashes are not comments", "pnpm exec vitest run --testNamePattern \\#literal apps/kept.test.ts # packages/hidden.test.ts\n", ["apps/kept.test.ts"]],
  ["valid continued and quoted arguments remain visible", "pnpm exec vitest run \\\n  'apps/kept.test.ts' \\\n  \"packages/kept.test.tsx\"\n", ["apps/kept.test.ts", "packages/kept.test.tsx"]],
];

test("regression target extraction respects shell comments, quotes and continuations", () => {
  for (const [name, command, expected] of shellCommentFixtures) {
    assert.deepEqual(executedVitestTargets(command), expected, name);
  }
});


test("ToonStudio session validation shares one setup and delegates full gates to protected core", () => {
  const session = readFileSync(
    new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url),
    "utf8",
  );
  const sessionJobs = session.slice(session.indexOf("\njobs:\n") + 7)
    .split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m)
    .filter((entry) => /^ {2}[a-z][a-z0-9-]*:\n/.test(entry));
  assert.equal(sessionJobs.length, 1, "session validation should pay checkout/install cost once");
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
  assert.match(job("core"), /^ {4}name: core$/m, "preserve the existing protected merge gate");
  assert.match(validation, /run: bash scripts\/verify-toonstudio-integration\.sh "\$\{\{ matrix\.track \}\}"/);
});
