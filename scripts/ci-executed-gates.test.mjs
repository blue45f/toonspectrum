import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { REQUIRED_CORE_GATES } from "./ci-core-gate.mjs";
import { CORE_DATABASE_VITEST_TARGETS } from "./ci-core-regression-shards.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const source = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const productionIntegritySource = readFileSync(
  new URL("../.github/workflows/studio-production-integrity.yml", import.meta.url),
  "utf8",
);
const requiredTargets = readFileSync(
  new URL("./ci-required-vitest-targets.txt", import.meta.url),
  "utf8",
).trim().split(/\r?\n/).filter(Boolean);
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const jobs = source.slice(source.indexOf("\njobs:\n") + 7).split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m);

function job(name) {
  const block = jobs.find((entry) => entry.startsWith(`  ${name}:\n`));
  assert.ok(block, `missing job: ${name}`);
  return block;
}

function targetExists(target) {
  const absoluteTarget = join(repoRoot, target);
  if (existsSync(absoluteTarget)) return true;

  const directory = dirname(absoluteTarget);
  if (!existsSync(directory)) return false;
  const name = basename(target);
  if (!name.includes("*")) {
    return readdirSync(directory).some(
      (entry) => entry.startsWith(name) && /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry),
    );
  }

  const expression = new RegExp(
    `^${name
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replaceAll("*", ".*")}$`,
  );
  return readdirSync(directory).some((entry) => expression.test(entry));
}


test("production integrity follows the real menu verifier and its CI bootstrap", () => {
  for (const path of [
    "scripts/verify-studio-menus.mts",
    "scripts/verify-studio-menus-ci.mjs",
    "apps/web/src/domains/creator/StudioBetaNoticeGate.tsx",
    "apps/web/src/domains/creator/studio-beta-notice-storage.ts",
  ]) {
    assert.equal(
      productionIntegritySource.split(`      - '${path}'`).length - 1,
      2,
      `production integrity must run for pull requests and main pushes that change ${path}`,
    );
  }
  assert.ok(productionIntegritySource.includes(
    "      - name: Inspect actual production browser\n"
      + "        run: pnpm exec tsx scripts/verify-studio-menus-ci.mjs\n",
  ));
  assert.doesNotMatch(productionIntegritySource, /run: pnpm run verify:studio-menus/u);
});

test("core retains every mandatory quality lane without a bypass", () => {
  assert.doesNotMatch(source, /CI_CORE_BYPASS|continue-on-error|if:\s*\$\{\{\s*false/);
  assert.match(source, /permissions:\n {2}contents: read\n {2}pull-requests: read/);

  for (const name of REQUIRED_CORE_GATES) {
    const block = job(name);
    assert.doesNotMatch(block, /^ {4}needs:/m, `${name} must start independently`);
    if (name !== "core") assert.match(block, /pnpm install --frozen-lockfile/);
  }
  const lint = job("lint");
  assert.match(lint, /node scripts\/lint-changed\.mjs --files-from=/);
  assert.match(lint, /--full-on-config/);
  assert.match(lint, /pnpm run lint:strict/);

  assert.match(job("typecheck"), /pnpm run typecheck\n/);
  assert.match(job("typecheck"), /pnpm run typecheck:cloudflare-realtime/);
  assert.ok(
    job("static").includes('node scripts/ci-core-regression-shards.mjs "${{ matrix.shard }}"'),
    "static lanes must execute their semantic shard",
  );
  assert.doesNotMatch(
    job("static"),
    /mapfile -t targets|pnpm exec vitest run/,
    "the matrix job must not duplicate the full regression portfolio in every shard",
  );
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
  assert.ok(job("core").includes("if: ${{ always() && !cancelled() }}"));
  assert.ok(job("core").includes("CORE_RESULTS: ${{ toJSON(needs) }}"));
  for (const name of REQUIRED_CORE_GATES) {
    assert.ok(job("core").includes(`"${name}"`), `inline aggregate is missing ${name}`);
  }
  assert.doesNotMatch(job("core"), /actions\/checkout|pnpm install/);
  assert.ok(job("verify").includes("needs: core"));
  assert.ok(job("verify").includes('test "$CORE_RESULT" = success'));
});

test("review database invariants execute with real PostgreSQL and the accepted graph triggers", () => {
  const database = job("database");
  assert.match(database, /image: postgres:16-alpine/u);
  assert.match(database, /TEST_DATABASE_URL: postgresql:\/\/studio_review_test@127\.0\.0\.1:5432\/studio_review_integration/u);
  assert.match(database, /STUDIO_LIVE_POSTGRES_INTEGRATION_URL: postgresql:\/\/studio_review_test@127\.0\.0\.1:5432\/studio_review_integration/u);
  assert.match(database, /node scripts\/prepare-studio-review-test-db\.mjs/u);
  assert.match(database, /pnpm exec vitest run --no-file-parallelism/u);
  assert.match(database, /studio-review-voice-note\.integration\.test\.ts/u);

  const preparation = readFileSync(
    new URL("./prepare-studio-review-test-db.mjs", import.meta.url),
    "utf8",
  );
  const migrationFiles = [...preparation.matchAll(/"(\d{4}_[a-z0-9_]+\.sql)"/gu)]
    .map((match) => match[1]);
  assert.ok(migrationFiles.includes("0087_studio_pinned_review_share.sql"));
  assert.ok(migrationFiles.includes("0088_studio_review_delivery.sql"));
  assert.ok(migrationFiles.includes("0090_studio_review_voice_note.sql"));
  assert.ok(!migrationFiles.includes("0084_studio_pinned_review_share.sql"));
  for (const migration of migrationFiles) {
    assert.ok(
      existsSync(join(repoRoot, "apps/api/src/db/migrations", migration)),
      `Review DB preparation references a missing migration: ${migration}`,
    );
  }

  for (const suite of CORE_DATABASE_VITEST_TARGETS) {
    assert.ok(database.includes(suite), `Missing real database suite: ${suite}`);
  }
  assert.ok(REQUIRED_CORE_GATES.includes("database"), "database failures must block protected core");
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
    "scripts/ci-core-regression-shards.test.mjs",
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
    assert.match(typecheck, new RegExp(excludedPath.replaceAll(".", "\\.")));
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

test("sparse lanes exclude artwork until foundation restores exactly its required Virtual Studio packs", () => {
  const world = "apps/web/public/assets/virtual-studio/world/default-world.json";
  const requiredArt = [
    "apps/web/public/assets/virtual-studio/production-v2/art-manifest.json",
    "apps/web/public/assets/virtual-studio/production-v2/master-central-lossless.webp",
    "apps/web/public/assets/virtual-studio/production-v2/player-pink-direction-down.png",
    "apps/web/public/assets/virtual-studio/production-v2/player-pink-walk-down.webp",
    "apps/web/public/assets/virtual-studio/living-world/art-manifest.json",
    "apps/web/public/assets/virtual-studio/living-world/master-clean-plate.webp",
    "apps/web/public/assets/virtual-studio/npc-cast-v1/art-manifest.json",
    "apps/web/public/assets/virtual-studio/npc-cast-v1/npc-concierge-direction-down.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v1/npc-editor-state-review.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v1/npc-atelier-state-draw.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v1/npc-archivist-walk-up.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v2/art-manifest.json",
    "apps/web/public/assets/virtual-studio/npc-cast-v2/npc-concierge-direction-down.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v2/npc-editor-state-review.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v2/npc-atelier-state-draw.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v2/npc-archivist-walk-up.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v3/art-manifest.json",
    "apps/web/public/assets/virtual-studio/npc-cast-v3/npc-concierge-direction-down.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v3/npc-producer-state-review.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v3/npc-artist-state-draw.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v3/npc-host-walk-up.png",
    "apps/web/public/assets/virtual-studio/art-v4-manifest.json",
    "apps/web/public/assets/virtual-studio/art-v4/world/sky-island.webp",
    "apps/web/public/assets/virtual-studio/art-v4/authoring/tile-atlas.webp",
    "apps/web/public/assets/virtual-studio/npc-cast-v4/npc-concierge-sheet.webp",
    "apps/web/public/assets/virtual-studio/style-packs/sky-island/npc-cast-v4/npc-concierge-walk-down.webp",
    "apps/web/public/assets/virtual-studio/style-packs/webtoon/tiles/world-base.webp",
    "apps/web/public/assets/virtual-studio/drawn-characters-v1/art-manifest.json",
    ...["gentle-window-rain.ogg", "window-rain.ogg", "provenance.json", "CC0-1.0.txt"].map((name) =>
      `apps/web/public/assets/virtual-studio/ambient-audio/${name}`),
    ...["pink", "silver", "dark", "purple"].flatMap((skin) =>
      ["walk-down", "walk-right", "walk-left", "walk-up", "sit", "wave"].map((state) =>
        `apps/web/public/assets/virtual-studio/drawn-characters-v1/player-${skin}-${state}.png`)),
  ];
  const unrelatedArt = [
    "apps/web/public/assets/3d/environments/refined-v6/large-model.glb",
    "apps/web/public/assets/virtual-studio/unrelated-pack/large-image.png",
  ];
  const excluded = [...requiredArt, ...unrelatedArt];
  const staticJob = job("static");
  const restoreStep = staticJob.split(/(?=^ {6}- )/mu)
    .find((step) => step.includes("git sparse-checkout add"));
  assert.ok(restoreStep, "foundation must restore the real artwork its required tests read");
  assert.match(restoreStep, /^ {8}if: matrix\.shard == 'studio-foundation'$/mu);
  const restoreArgs = restoreStep.match(/^ {8}run: git (.+)$/mu)?.[1].split(/\s+/u);
  assert.deepEqual(restoreArgs, [
    "sparse-checkout", "add",
    "/apps/web/public/assets/virtual-studio/production-v2/",
    "/apps/web/public/assets/virtual-studio/living-world/",
    "/apps/web/public/assets/virtual-studio/drawn-characters-v1/",
    "/apps/web/public/assets/virtual-studio/ambient-audio/",
    "/apps/web/public/assets/virtual-studio/npc-cast-v1/",
    "/apps/web/public/assets/virtual-studio/npc-cast-v2/",
    "/apps/web/public/assets/virtual-studio/npc-cast-v3/",
    "/apps/web/public/assets/virtual-studio/npc-cast-v4/",
    "/apps/web/public/assets/virtual-studio/art-v4/",
    "/apps/web/public/assets/virtual-studio/art-v4-manifest.json",
    "/apps/web/public/assets/virtual-studio/style-packs/",
  ]);
  assert.ok(staticJob.indexOf(restoreStep) < staticJob.indexOf("Run semantic regression shard"),
    "artwork must be present before the required foundation tests execute");
  assert.ok(requiredTargets.includes("scripts/verify-virtual-studio-art-manifest.test.mjs"),
    "the full build art gate does not replace the existing foundation art regression target");
  const artTestScript = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).scripts["test:studio-virtual-art"];
  assert.match(artTestScript, /verify-virtual-studio-v3-art\.test\.mjs/u,
    "the production art gate must execute the v3 NPC/style-pack integrity test");
  assert.match(artTestScript, /verify-virtual-studio-v4-art\.test\.mjs/u,
    "the production art gate must execute the v4 generated campus and NPC integrity test");
  const scratch = mkdtempSync(join(tmpdir(), "virtual-studio-ci-inputs-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: scratch, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git("init", "--quiet");
    for (const file of [world, ...excluded, "package.json"]) {
      const path = join(scratch, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "{}\n");
    }
    git("add", ".");
    git("-c", "user.name=Virtual Studio CI Test", "-c", "user.email=ci@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    git("config", "core.sparseCheckout", "true");
    git("config", "core.sparseCheckoutCone", "false");
    for (const lane of ["lint", "typecheck", "static"]) {
      const checkout = job(lane).match(/sparse-checkout: \|\n((?: {12}[^\n]*\n)+)/u)?.[1];
      assert.ok(checkout, `${lane} must declare its minimal checkout`);
      writeFileSync(join(scratch, ".git/info/sparse-checkout"), checkout.replace(/^ {12}/gmu, ""));
      git("read-tree", "-mu", "HEAD");
      assert.ok(existsSync(join(scratch, world)), `${lane} must include imported world JSON`);
      for (const file of excluded) assert.equal(existsSync(join(scratch, file)), false,
        `${lane} must not download artwork/model binaries: ${file}`);
    }
    git(...restoreArgs);
    for (const file of [world, ...requiredArt]) assert.ok(existsSync(join(scratch, file)),
      `foundation must retain its real art test input: ${file}`);
    for (const file of unrelatedArt) assert.equal(existsSync(join(scratch, file)), false,
      `foundation must still exclude unrelated artwork/models: ${file}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("static regression checkout retains both imported 3D manifests but excludes their model payloads", () => {
  const patterns = job("static").match(/sparse-checkout: \|\n((?: {12}[^\n]*\n)+)/u)?.[1];
  assert.ok(patterns);
  const manifests = ["refined-v6", "expansion-v1"].map((pack) => `apps/web/public/assets/3d/environments/${pack}/manifest.json`);
  const models = ["refined-v6/hospital_reception.glb", "expansion-v1/library_reading_room.glb", "unrelated/large.glb"].map((file) => `apps/web/public/assets/3d/environments/${file}`);
  const scratch = mkdtempSync(join(tmpdir(), "core-3d-manifests-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: scratch, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git("init", "--quiet");
    for (const file of [...manifests, ...models, "package.json"]) { mkdirSync(dirname(join(scratch, file)), { recursive: true }); writeFileSync(join(scratch, file), "{}\n"); }
    git("add", ".");
    git("-c", "user.name=CI Test", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    git("config", "core.sparseCheckout", "true"); git("config", "core.sparseCheckoutCone", "false");
    writeFileSync(join(scratch, ".git/info/sparse-checkout"), patterns.replace(/^ {12}/gmu, "")); git("read-tree", "-mu", "HEAD");
    for (const file of manifests) assert.ok(existsSync(join(scratch, file)), `missing 3D import: ${file}`);
    for (const file of models) assert.equal(existsSync(join(scratch, file)), false, `unrelated binary admitted: ${file}`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("production build verifies Virtual Studio art after the single existing build", () => {
  const build = job("build");
  const buildAt = build.indexOf("pnpm run build:bundle");
  const testsAt = build.indexOf("pnpm run test:studio-virtual-art");
  const verificationAt = build.indexOf("pnpm run verify:studio-virtual-art");
  assert.ok(buildAt >= 0 && testsAt > buildAt && verificationAt > testsAt,
    "the protected build must run art regression tests and output integrity verification");
  assert.equal(build.split("pnpm run build:bundle").length - 1, 1);
  assert.doesNotMatch(build, /sparse-checkout:/u, "art verification needs the existing full build checkout");
});

test("PR caches restore without paying cache-save post steps", () => {
  for (const [name, cacheId] of [
    ["lint", "eslint-cache"],
    ["typecheck", "typescript-cache"],
  ]) {
    const block = job(name);
    assert.match(block, new RegExp(`id: ${cacheId}\\n\\s+uses: actions/cache/restore@v4`));
    assert.match(block, /uses: actions\/cache\/save@v4/);
    assert.match(block, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
    assert.doesNotMatch(block, /uses: actions\/cache@v4/);
  }
});

test("the required Vitest manifest is sorted, unique, resolvable and executed once", () => {
  assert.deepEqual(requiredTargets, [...requiredTargets].sort());
  assert.equal(new Set(requiredTargets).size, requiredTargets.length);
  assert.ok(requiredTargets.length >= 160, "unexpected regression coverage shrink");
  for (const target of requiredTargets) {
    assert.ok(targetExists(target), `missing mandatory Vitest target: ${target}`);
  }
  assert.ok(
    job("static").includes('node scripts/ci-core-regression-shards.mjs "${{ matrix.shard }}"'),
  );
});

test("semantic regression lanes delegate ownership to the shard runner", () => {
  const block = job("static");
  const install = block.indexOf("pnpm install --frozen-lockfile");
  const runner = block.indexOf('node scripts/ci-core-regression-shards.mjs "${{ matrix.shard }}"');
  assert.ok(install >= 0 && runner > install);
  assert.equal(
    block.split("node scripts/ci-core-regression-shards.mjs").length - 1,
    1,
    "each matrix lane must invoke exactly one semantic shard runner",
  );
});

test("production visual audit and protected core share the Vitest policy suite", () => {
  const audit = readFileSync(
    new URL("../.github/workflows/studio-3d-production-visual-audit.yml", import.meta.url),
    "utf8",
  );
  assert.ok(audit.includes("      - name: Verify audit policy\n        run: pnpm exec vitest run scripts/lib/studio-3d-production-audit-policy.test.mjs\n"));
  assert.doesNotMatch(audit, /node\s+--test\s+scripts\/lib\/studio-3d-production-audit-policy\.test\.mjs/);
  assert.ok(requiredTargets.includes("scripts/lib/studio-3d-production-audit-policy.test.mjs"));
  assert.ok(
    job("static").includes('node scripts/ci-core-regression-shards.mjs "${{ matrix.shard }}"'),
  );
});
test("manual validation cannot cancel push validation and retries retain evidence", () => {
  assert.ok(source.includes(
    "group: core-v3-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}",
  ));
  assert.ok(job("serial").includes("name: core-serial-attempt-${{ github.run_attempt }}"));
  assert.ok(job("build").includes("name: core-build-attempt-${{ github.run_attempt }}"));
});

test("ToonStudio session validation shares one setup and delegates full gates to protected core", () => {
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


test("focused ToonStudio checkout includes imported metadata and fault evidence without unrelated artwork/results", () => {
  const workflow = readFileSync(new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url), "utf8");
  const patterns = workflow.match(/sparse-checkout: \|\n((?: {12}[^\n]*\n)+)/u)?.[1];
  assert.ok(patterns, "focused workflow must declare its checkout");
  const manifests = ["3d/environments/refined-v6/manifest.json", "3d/environments/expansion-v1/manifest.json", "virtual-studio/world/default-world.json"].map((file) => `apps/web/public/assets/${file}`);
  const faultEvidence = "tests/benchmarks/results/v12-runtime-fault-matrix.json";
  const unrelatedResult = "tests/benchmarks/results/unrelated-benchmark.json";
  const artwork = "apps/web/public/assets/3d/environments/unrelated-pack/large-model.glb";
  const scratch = mkdtempSync(join(tmpdir(), "toonstudio-focused-inputs-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: scratch, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git("init", "--quiet");
    for (const file of [...manifests, faultEvidence, unrelatedResult, artwork, "package.json"]) {
      mkdirSync(dirname(join(scratch, file)), { recursive: true });
      writeFileSync(join(scratch, file), "{}\n");
    }
    git("add", ".");
    git("-c", "user.name=CI Test", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    git("config", "core.sparseCheckout", "true");
    git("config", "core.sparseCheckoutCone", "false");
    writeFileSync(join(scratch, ".git/info/sparse-checkout"), patterns.replace(/^ {12}/gmu, ""));
    git("read-tree", "-mu", "HEAD");
    for (const file of [...manifests, faultEvidence]) assert.ok(existsSync(join(scratch, file)), `missing import: ${file}`);
    assert.equal(existsSync(join(scratch, unrelatedResult)), false);
    assert.equal(existsSync(join(scratch, artwork)), false);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});


test("reference-project certification executes the real entrypoint and emits its receipt", () => {
  const workflow = readFileSync(new URL("../.github/workflows/studio-competitor-replacement-certification.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes("node scripts/verify-studio-reference-projects.mjs --run --receipt qa-results/studio-reference-projects/receipt.json"));
  assert.doesNotMatch(workflow, /pnpm run verify:studio-reference-projects\b/u);
  assert.ok(existsSync(join(repoRoot, "scripts/verify-studio-reference-projects.mjs")));
  assert.match(workflow, /path: qa-results\/studio-reference-projects/u);
  assert.doesNotMatch(workflow, /continue-on-error|--check\b/u);
});


test("focused session checkout retains every non-brand route-purpose image", () => {
  const focused = readFileSync(new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url), "utf8");
  const profiles = readFileSync(new URL("../apps/web/src/shared/lib/site-route-visual.ts", import.meta.url), "utf8");
  const images = [...new Set([...profiles.matchAll(/image:\s*"(\/assets\/[^"\n]+)"/gu)].map((match) => match[1]))];
  assert.ok(images.length >= 2, "route-purpose fixture must include both spatial and review artwork");
  for (const image of images) {
    assert.ok(
      existsSync(join(repoRoot, "apps/web/public", image.slice(1))),
      `route-purpose artwork is missing from the repository: ${image}`,
    );
    assert.ok(
      focused.includes(`/apps/web/public${image}`),
      `focused checkout omits actual route-purpose artwork: ${image}`,
    );
  }
});


test("full-suite health probes cannot race the target database's NOLOGIN bootstrap gate", () => {
  for (const name of ["full-test-diagnostic.yml"]) {
    const workflow = readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
    assert.match(workflow, /POSTGRES_DB: studio_full_integration/u);
    assert.match(workflow, /--health-cmd "pg_isready -U studio_full_test -d postgres"/u);
    assert.doesNotMatch(workflow, /--health-cmd [^\n]*-d studio_full_integration/u);
    assert.match(workflow, /node scripts\/bootstrap-empty-production-database\.mjs --execute --allow-loopback/u);
    assert.match(workflow, /node scripts\/run-full-test-ci\.mjs/u);
    assert.doesNotMatch(workflow, /continue-on-error/u);
  }
  const bootstrap = readFileSync(new URL("./bootstrap-empty-production-database.mjs", import.meta.url), "utf8");
  assert.ok(bootstrap.includes("database client raced the runtime login gate"));
  assert.ok(bootstrap.includes("ALTER ROLE %I NOLOGIN"));
});
