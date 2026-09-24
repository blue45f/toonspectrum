import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, matchesGlob } from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const repositoryRoot = new URL("../", import.meta.url);

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, repositoryRoot), "utf8"));
}

function readYaml(relativePath) {
  return parseYaml(readFileSync(new URL(relativePath, repositoryRoot), "utf8"));
}

function readText(relativePath) {
  return readFileSync(new URL(relativePath, repositoryRoot), "utf8");
}

function runCommands(job) {
  return (job?.steps ?? [])
    .map((step) => step.run)
    .filter((command) => typeof command === "string");
}

function usesActions(job) {
  return (job?.steps ?? []).map((step) => step.uses).filter(Boolean);
}

const PLAYWRIGHT_INSTALL = "pnpm exec playwright install --with-deps chromium";
const HEADED_PARITY_COMMAND =
  'xvfb-run -a --server-args="-screen 0 1920x1200x24" pnpm run verify:studio-3d-console';

describe("database integration runner CI policy", () => {
  it("runs the protected core on main PRs, pushes and merge groups", () => {
    const workflow = readYaml(".github/workflows/ci.yml");
    expect(workflow.on.pull_request.branches).toEqual(["main"]);
    expect(workflow.on.push.branches).toEqual(["main"]);
    expect(workflow.on).toHaveProperty("merge_group");
    expect(workflow.on).toHaveProperty("workflow_dispatch");
  });

  it.each(["bg3d-runtime-regression.yml", "studio-ink-live-commit.yml"])(
    "does not resurrect superseded PR 1280 workflow %s", (filename) => {
      const workflow = readYaml(`.github/workflows/${filename}`);
      expect(workflow.on).not.toHaveProperty("pull_request");
      expect(workflow.on.push.branches).toEqual(["integration/final-main-consolidation-20260910"]);
      expect(workflow.jobs.retired.if).toBe("${{ false }}");
      expect(workflow.on.push.paths).toEqual([`.github/workflows/${filename}`]);
    },
  );

  it.each([
    "studio-production-integrity.yml", "character-merge-validation.yml",
    "studio-finishing-quality.yml",
  ])("reruns %s when shared bundle validation changes", (filename) => {
    const workflow = readYaml(`.github/workflows/${filename}`);
    // The CRDT classifier repair changed only tooling, so these failed lanes previously never
    // reran. Evaluate the event filters against real repair/dependency paths on both event types.
    for (const event of ["pull_request", "push"]) {
      const paths = workflow.on[event].paths;
      for (const changedFile of [
        "scripts/check-studio-bundle.mjs",
        "scripts/lib/studio-crdt-bundle-boundary.mjs",
        "scripts/lib/studio-crdt-bundle-boundary.test.mjs",
        "scripts/lib/repo-paths.mjs",
        "scripts/integration-test-runner-ci-policy.test.mjs",
        "vite.config.ts", "package.json", "pnpm-lock.yaml",
      ]) {
        expect(paths.some((pattern) => matchesGlob(changedFile, pattern)),
          `${filename} ${event} misses ${changedFile}`).toBe(true);
      }
      expect(paths.some((pattern) => matchesGlob("README.md", pattern))).toBe(false);
    }
  });

  it.each([
    "marketplace-integrity.yml",
    "marketplace-authoring.yml",
    "studio-mesh-sync-repair.yml",
    "character-merge-validation.yml",
    "studio-cc0-library.yml",
    "feedback-community-validation.yml",
    "studio-manual.yml",
    "studio-2d-asset-quality.yml",
    "character-shaper-discovery-quality.yml",
    "studio-production-integrity.yml",
    "studio-manuscript-delivery-acceptance.yml",
    "studio-ai-comic-director-complete.yml",
    "studio-finishing-quality.yml",
    "learning-quality.yml",
    "studio-collaboration-sync.yml",
    "studio-promo-video.yml",
    "character-contact-naturalness.yml",
    "studio-brush-filter-stability.yml",
    "studio-discovery-ux.yml",
    "creator-resources.yml",
    "studio-vrm-asset-quality.yml",
    "kmas-reference-library.yml",
  ])("runs %s on PR updates and target-branch pushes without duplicate feature pushes", (filename) => {
    const workflow = readYaml(`.github/workflows/${filename}`);
    expect(workflow.on.pull_request.types).toEqual(["opened", "reopened", "synchronize", "ready_for_review"]);
    expect(workflow.on.pull_request.paths).toEqual(workflow.on.push.paths);
    expect(workflow.on.push.branches).toEqual(workflow.on.pull_request.branches ?? ["main"]);
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.concurrency).toEqual({
      group: "${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}",
      "cancel-in-progress": true,
    });
  });

  it("retains exhaustive preview coverage nightly and on demand without a merge fanout", () => {
    const workflow = readYaml(".github/workflows/main-full-qa-studio.yml");
    expect(readText("scripts/lib/studio-verify-preview-harness.mts")).toContain("export function spawnVitePreview");
    expect(workflow.on.schedule).toEqual([{ cron: "17 19 * * *" }]);
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.on).not.toHaveProperty("push");
  });

  it("keeps the package entrypoints bound to the reviewed integration runners", () => {
    const packageManifest = readJson("package.json");

    expect(packageManifest.scripts?.["test:postgres:integration"]).toBe(
      "node scripts/run-postgres-integration-tests.mjs",
    );
    expect(packageManifest.scripts?.["test:redis:integration"]).toBe(
      "node scripts/run-redis-integration-tests.mjs",
    );
  });

  it("keeps `pnpm test` equal to the root suite plus the quiet perf-budget pass", () => {
    const packageManifest = readJson("package.json");

    // CI shards `test:root` and runs `test:perf` on its own runner; `pnpm test` must stay the
    // exact union so a local run and CI prove the same thing.
    expect(packageManifest.scripts?.["test:root"]).toBe("node scripts/verify-workspace-package-links.mjs && vitest run");
    expect(packageManifest.scripts?.test).toBe("pnpm run test:root && pnpm run test:perf");
    expect(packageManifest.scripts?.["test:perf"]).toBe(
      "vitest run --config vitest.perf.config.ts",
    );
    // The bundle-only build the browser gates use must be exactly the `vite build` half of
    // `build`: tsc is `noEmit`, so the dist is byte-identical and `typecheck` proves the types.
    expect(packageManifest.scripts?.build).toBe(
      "NODE_OPTIONS='--max-old-space-size=12288' tsc -p tsconfig.json && NODE_OPTIONS='--max-old-space-size=12288' vite build",
    );
    expect(packageManifest.scripts?.["build:bundle"]).toBe(
      "NODE_OPTIONS='--max-old-space-size=12288' vite build",
    );
    // pnpm runs `pre<script>`/`post<script>` around any script name. `build` gets the catalog
    // generation (apps/web/public/data/ is gitignored, so without it the bundle ships no catalog) and the
    // third-party notices plus CSP verification; the bundle-only build must get the same, or the
    // dist the browser gates drive is not the dist production serves.
    expect(packageManifest.scripts?.prebuild).toBe("node scripts/verify-workspace-package-links.mjs && pnpm catalog:gen && pnpm i18n:builtins:gen");
    expect(packageManifest.scripts?.["prebuild:bundle"]).toBe("pnpm run prebuild");
    expect(packageManifest.scripts?.["postbuild:bundle"]).toBe("pnpm run postbuild");
    expect(packageManifest.scripts?.postbuild).toContain(
      "dist/legal/THIRD_PARTY_NOTICES.generated.md",
    );
  });

  it.each(["full-test-diagnostic.yml"])(
    "runs %s with a fresh real database, separated runtime role and actual shell tests", (filename) => {
      const workflow = readYaml(`.github/workflows/${filename}`);
      const full = workflow.jobs["full-test"];
      expect(full["continue-on-error"]).not.toBe(true);
      expect(full.services.postgres.image).toBe("postgres:16-alpine");
      expect(full.services.postgres.ports).toEqual(["5432:5432"]);
      expect(full.services.postgres.options).toContain("pg_isready");
      const target = new URL(full.env.TEST_DATABASE_URL);
      expect(target.hostname).toBe("127.0.0.1");
      expect(target.pathname).toBe("/studio_full_integration");
      expect(target.username).toBe(full.services.postgres.env.POSTGRES_USER);
      expect(full.env.TEST_RUNTIME_DATABASE_ROLE).not.toBe(target.username);
      const commands = runCommands(full);
      const install = commands.findIndex((command) => command.includes("apt-get install"));
      expect(commands[install]).toMatch(/\bzsh\b/u);
      expect(commands[install]).toMatch(/\bpostgresql-client\b/u);
      const bootstrap = commands.findIndex((command) => command.includes("bootstrap-empty-production-database.mjs"));
      expect(bootstrap).toBeGreaterThan(install);
      expect(commands[bootstrap]).toContain("--execute --allow-loopback");
      expect(commands[bootstrap]).toContain('--runtime-database-role "$TEST_RUNTIME_DATABASE_ROLE"');
      expect(commands[bootstrap]).toContain('--release-sha "$GITHUB_SHA"');
      expect(commands[bootstrap]).toContain("--confirmation BOOTSTRAP-EMPTY-TOONSPECTRUM-DATABASE");
      expect(commands[bootstrap]).not.toContain("--reset-confirmation");
      const execute = commands.indexOf("node scripts/run-full-test-ci.mjs");
      expect(execute).toBeGreaterThan(bootstrap);
      expect(commands.filter((command) => command.includes("run-full-test-ci.mjs"))).toHaveLength(1);
      expect(full.steps.find((step) => step.run === commands[bootstrap]).env.MIGRATION_DATABASE_URL).toBe("${{ env.TEST_DATABASE_URL }}");
    },
  );

  it("never forwards a standalone `--` through `pnpm run`", () => {
    const workflow = readYaml(".github/workflows/ci.yml");

    // pnpm 11 passes a standalone `--` to the script verbatim. Vitest then puts everything after
    // it in options["--"] and Playwright stops parsing options at it, so `--shard` and `--grep`
    // silently vanish: every shard and both visual lanes ran the entire suite in run 2643.
    for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
      for (const command of runCommands(job)) {
        for (const line of command.split("\n")) {
          if (!line.trimStart().startsWith("pnpm run ")) continue;
          expect(line.split(/\s+/u), `${jobId}: ${line.trim()}`).not.toContain("--");
        }
      }
    }
    for (const entry of workflow.jobs?.["studio-3d-visual"]?.strategy?.matrix?.include ?? []) {
      expect(entry.filter.split(/\s+/u), entry.lane).not.toContain("--");
    }
  });

  // CI v3 replaced historical numbered shards with protected semantic shards.
  // Exhaustive Studio browser evidence remains in main-full-qa-studio.yml.
  const shards = ["product", "studio-foundation", "studio-editing", "studio-3d", "studio-character"];
  it.each(shards)("keeps semantic shard %s behind core", (shard) => {
    const workflow = readYaml(".github/workflows/ci.yml");
    const job = workflow.jobs.static;
    expect(job.strategy.matrix.shard).toEqual(shards);
    expect(job.strategy.matrix.shard).toContain(shard);
    expect(job.strategy["fail-fast"]).toBe(false);
    expect(runCommands(job)).toContain('node scripts/ci-core-regression-shards.mjs "${{ matrix.shard }}"');
    expect(workflow.jobs.core.needs).toContain("static");
    expect(job["continue-on-error"]).not.toBe(true);
  });

  it("retains the reusable Sonar workflow's coverage import before analysis", () => {
    const sonar = readYaml(".github/workflows/sonarqube.yml");
    expect(sonar.on).toHaveProperty("workflow_call");
    expect(sonar.on).not.toHaveProperty("pull_request");
    const steps = sonar.jobs.sonarqube.steps;
    const download = steps.findIndex((step) => step.uses?.startsWith("actions/download-artifact@"));
    const guard = steps.findIndex((step) => step.name === "Require all four nonempty coverage reports");
    const scan = steps.findIndex((step) => step.uses?.startsWith("SonarSource/sonarqube-scan-action@"));
    expect(download).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(download);
    expect(scan).toBeGreaterThan(guard);
    expect(steps[download].with).toMatchObject({ pattern: "sonar-coverage-*", path: "coverage" });
    for (const shard of [1, 2, 3, 4]) {
      expect(readText("sonar-project.properties")).toContain(`coverage/sonar-coverage-${shard}/lcov.info`);
    }
  });

  it("fails the actual SonarQube report guard when any shard is missing or empty", () => {
    const sonar = readYaml(".github/workflows/sonarqube.yml");
    const steps = sonar.jobs.sonarqube.steps;
    const guardIndex = steps.findIndex((step) => step.name === "Require all four nonempty coverage reports");
    const downloadIndex = steps.findIndex((step) => step.uses?.startsWith("actions/download-artifact@"));
    const scanIndex = steps.findIndex((step) => step.uses?.startsWith("SonarSource/sonarqube-scan-action@"));
    expect(guardIndex).toBeGreaterThan(downloadIndex);
    expect(guardIndex).toBeLessThan(scanIndex);

    const directory = mkdtempSync(join(tmpdir(), "sonar-coverage-policy-"));
    const reports = [1, 2, 3, 4].map((shard) => {
      const artifactDirectory = join(directory, "coverage", `sonar-coverage-${shard}`);
      mkdirSync(artifactDirectory, { recursive: true });
      return join(artifactDirectory, "lcov.info");
    });
    // Match the fail-fast Bash semantics used by GitHub Actions' run steps.
    const runGuard = () => spawnSync("bash", ["-e", "-o", "pipefail", "-c", steps[guardIndex].run], {
      cwd: directory,
      encoding: "utf8",
    });
    const coverage = "TN:\nSF:apps/web/src/app/main.tsx\nDA:1,1\nend_of_record\n";
    try {
      for (const report of reports) writeFileSync(report, coverage);
      expect(runGuard().status).toBe(0);
      for (const report of reports) {
        rmSync(report);
        expect(runGuard().status, `missing ${report}`).toBe(1);
        writeFileSync(report, "");
        expect(runGuard().status, `empty ${report}`).toBe(1);
        writeFileSync(report, coverage);
      }
      expect(runGuard().status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  const required = ["lint", "typecheck", "static", "serial", "a11y", "build", "database"];
  const coreGate = () => readYaml(".github/workflows/ci.yml").jobs.core.steps.find(
    (step) => step.name === "Require actual success from every mandatory check",
  );
  const runCore = (results) => spawnSync("bash", ["-e", "-o", "pipefail", "-c", coreGate().run], {
    encoding: "utf8", env: { ...process.env, CORE_RESULTS: JSON.stringify(results) },
  });
  it("aggregates all mandatory jobs and executes a fail-closed core gate", () => {
    const workflow = readYaml(".github/workflows/ci.yml");
    expect(workflow.permissions).toEqual({ contents: "read", "pull-requests": "read" });
    expect(workflow.jobs.core.needs).toEqual(required);
    expect(workflow.jobs.core.if).toBe("${{ always() && !cancelled() }}");
    expect(usesActions(workflow.jobs.core)).toEqual([]);
    expect(coreGate().env.CORE_RESULTS).toBe("${{ toJSON(needs) }}");
    for (const dependency of required) {
      expect(workflow.jobs[dependency]).toBeDefined();
      expect(workflow.jobs[dependency]["continue-on-error"]).not.toBe(true);
    }
    expect(runCore(Object.fromEntries(required.map((key) => [key, { result: "success" }]))).status).toBe(0);
    for (const incomplete of [null, [], {}, { lint: { result: "success" } }]) {
      expect(runCore(incomplete).status).not.toBe(0);
    }
  });
  it.each(required)("fails core when mandatory job %s does not succeed", (job) => {
    for (const result of ["failure", "skipped", "cancelled", "timed_out", "neutral"]) {
      const results = Object.fromEntries(required.map((key) => [key, { result: "success" }]));
      results[job] = { result };
      expect(runCore(results).status, `${job}: ${result}`).not.toBe(0);
    }
  });
  it("runs the quiet performance lane once and preserves active main checks", () => {
    const workflow = readYaml(".github/workflows/ci.yml");
    const job = workflow.jobs.serial;
    expect(job.services).toBeUndefined();
    expect(job.strategy).toBeUndefined();
    expect(runCommands(job).join("\n")).toContain("pnpm run test:perf");
    const all = Object.values(workflow.jobs).flatMap(runCommands).join("\n");
    expect(all.match(/pnpm run test:perf/gu)).toHaveLength(1);
    expect(workflow.concurrency["cancel-in-progress"]).toBe("${{ github.event_name == 'pull_request' }}");
    expect(workflow.concurrency.group).toContain("github.event_name");
    expect(workflow.concurrency.group).toContain("github.event.pull_request.number || github.ref");
  });
  it("retains strict lint, application typechecks, real accessibility and bundle checks", () => {
    const { jobs } = readYaml(".github/workflows/ci.yml");
    expect(runCommands(jobs.lint).join("\n")).toContain("node scripts/lint-changed.mjs --files-from=");
    expect(runCommands(jobs.lint)).toContain("pnpm run quality:imports");
    expect(runCommands(jobs.lint)).toContain("pnpm run quality:secrets");
    expect(runCommands(jobs.typecheck).join("\n")).toContain("pnpm run typecheck\n");
    expect(runCommands(jobs.typecheck).join("\n")).toContain("pnpm run typecheck:cloudflare-realtime");
    expect(runCommands(jobs.typecheck)).toContain("python3 scripts/verify-pr-workflow-fanout.py");
    expect(runCommands(jobs.a11y)).toContain(PLAYWRIGHT_INSTALL);
    expect(runCommands(jobs.a11y)).toContain("pnpm run test:a11y");
    const build = runCommands(jobs.build).join("\n");
    expect(build).toContain("pnpm --filter @webtoon-nest/api build");
    expect(build).toContain("pnpm run build:bundle");
    expect(build).toContain("pnpm run check:studio-bundle");
    expect(build).toContain("test -s dist/.vite/manifest.json");
  });
  it("keeps nightly browser proof on main with a shared exact production build", () => {
    const workflow = readYaml(".github/workflows/main-full-qa-studio.yml");
    expect(workflow.on).toHaveProperty("schedule");
    expect(workflow.on).not.toHaveProperty("push");
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.on).not.toHaveProperty("pull_request");
    const build = workflow.jobs["production-build"];
    const audit = workflow.jobs["studio-audit"];
    expect(runCommands(build)).toContain("pnpm run build:bundle");
    expect(audit.needs).toBe("production-build");
    expect(audit.strategy["fail-fast"]).toBe(false);
    const commands = audit.strategy.matrix.include.flatMap((lane) => lane.commands.trim().split("\n"));
    const names = commands.map((command) => command.split("|", 1)[0]);
    expect(new Set(names).size).toBe(names.length);
    expect(commands).toContain(`studio-3d-console|${HEADED_PARITY_COMMAND}`);
    for (const command of ["verify:studio-inapp-browser", "verify:studio-mobile-top", "verify:studio-inapp-feature-sweep", "verify:studio-bg3d-inapp-editor", "verify:studio-filter-dialog"]) {
      expect(commands.filter((line) => line.includes(`pnpm run ${command}`))).toHaveLength(1);
    }
    const download = audit.steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
    expect(download.with).toEqual({ name: "main-full-qa-dist-${{ github.sha }}", path: "dist" });
    const proof = runCommands(audit).join("\n");
    expect(proof).toContain("status=${PIPESTATUS[0]}");
    expect(proof).toContain('[[ -s "$output_dir/failures.txt" ]]');
    expect(proof).toContain("exit 1");
    expect(audit.steps.some((step) => step["continue-on-error"] === true)).toBe(false);
  });
});
