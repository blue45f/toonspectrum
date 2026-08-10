import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const repositoryRoot = new URL("../", import.meta.url);

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, repositoryRoot), "utf8"));
}

function readYaml(relativePath) {
  return parseYaml(readFileSync(new URL(relativePath, repositoryRoot), "utf8"));
}

describe("database integration runner CI policy", () => {
  it("keeps the package entrypoints bound to the reviewed integration runners", () => {
    const packageManifest = readJson("package.json");

    expect(packageManifest.scripts?.["test:postgres:integration"]).toBe(
      "node scripts/run-postgres-integration-tests.mjs",
    );
    expect(packageManifest.scripts?.["test:redis:integration"]).toBe(
      "node scripts/run-redis-integration-tests.mjs",
    );
  });

  it("runs disposable Redis integration after root tests and before the build", () => {
    const workflow = readYaml(".github/workflows/ci.yml");
    const verifyJob = workflow.jobs?.verify;
    const steps = workflow.jobs?.verify?.steps ?? [];
    const commands = steps
      .map((step) => step.run)
      .filter((command) => typeof command === "string");
    const rootTestIndex = commands.indexOf("pnpm run test");
    const redisTestIndex = commands.indexOf("pnpm run test:redis:integration");
    const buildIndex = commands.indexOf("pnpm run build");

    expect(rootTestIndex).toBeGreaterThanOrEqual(0);
    expect(redisTestIndex).toBeGreaterThan(rootTestIndex);
    expect(buildIndex).toBeGreaterThan(redisTestIndex);
    expect(
      commands.filter((command) => command === "pnpm run test:redis:integration"),
    ).toHaveLength(1);

    const rootTestStep = steps.find((step) => step.run === "pnpm run test");
    expect(verifyJob?.["timeout-minutes"]).toBe(75);
    expect(rootTestStep).toMatchObject({
      name: "Run the complete root Vitest suite with per-file progress",
      "timeout-minutes": 40,
      run: "pnpm run test",
    });
  });

  it("derives migration summary expectations from the canonical manifest", () => {
    const workflow = readYaml(".github/workflows/ci.yml");
    const steps = workflow.jobs?.verify?.steps ?? [];
    const adoptionStep = steps.find(
      (step) => step.name === "Adopt verified history and apply genuine pending migrations",
    );
    const rerunStep = steps.find(
      (step) => step.name === "Prove pending-only migration rerun",
    );

    expect(adoptionStep?.run).toContain(
      "manifest_count=\"$(grep -cve '^[[:space:]]*$' \"$manifest_path\")\"",
    );
    expect(adoptionStep?.run).toContain(
      "expected_applied=$((manifest_count - adoption_baseline - bootstrap_count))",
    );
    expect(adoptionStep?.run).toContain(
      "expected_verified=$((adoption_baseline + bootstrap_count))",
    );
    expect(adoptionStep?.run).not.toMatch(
      /19 adopted, [0-9]+ applied, [0-9]+ checksum-verified skips/u,
    );
    expect(rerunStep?.run).toContain(
      "0 applied, ${manifest_count} checksum-verified skips",
    );
    expect(rerunStep?.run).not.toMatch(
      /0 applied, [0-9]+ checksum-verified skips/u,
    );
  });

  it("keeps the Studio 3D parity proof on a fresh hard-gated runner", () => {
    const workflow = readYaml(".github/workflows/ci.yml");
    const coreJob = workflow.jobs?.verify;
    const parityJob = workflow.jobs?.["studio-3d-runtime"];
    const paritySteps = parityJob?.steps ?? [];
    const coreCommands = (coreJob?.steps ?? [])
      .map((step) => step.run)
      .filter((command) => typeof command === "string");
    const parityCommands = (parityJob?.steps ?? [])
      .map((step) => step.run)
      .filter((command) => typeof command === "string");

    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(coreJob?.name).toBe("core");
    expect(coreCommands).not.toContain("pnpm run verify:studio-3d-console");
    expect(coreCommands).toContain("pnpm run check:studio-bundle");
    expect(coreCommands).toContain("pnpm run build:all");

    expect(parityJob).toMatchObject({
      name: "verify",
      needs: "verify",
      if: "${{ always() }}",
      "runs-on": "ubuntu-latest",
      "timeout-minutes": 20,
      env: {
        NODE_OPTIONS: "--max-old-space-size=8192",
      },
    });
    expect(parityJob?.services).toBeUndefined();
    expect(paritySteps.map((step) => step.uses).filter(Boolean)).toEqual([
      "actions/checkout@v6",
      "pnpm/action-setup@v6",
      "actions/setup-node@v6",
    ]);

    const coreResultGate = paritySteps.find(
      (step) => step.name === "Require successful core CI",
    );
    expect(coreResultGate?.env?.CORE_RESULT).toBe("${{ needs.verify.result }}");
    expect(coreResultGate?.run).toContain('if [[ "$CORE_RESULT" != "success" ]]');
    expect(coreResultGate?.if).toBeUndefined();
    expect(coreResultGate?.["continue-on-error"]).not.toBe(true);

    const checkout = paritySteps.find(
      (step) => step.uses === "actions/checkout@v6",
    );
    expect(checkout?.with?.["persist-credentials"]).toBe(false);

    const installIndex = parityCommands.indexOf("pnpm install --frozen-lockfile");
    const browserInstallIndex = parityCommands.indexOf(
      "pnpm exec playwright install --with-deps chromium",
    );
    const buildIndex = parityCommands.indexOf("pnpm run build");
    const headedParityCommand =
      'xvfb-run -a --server-args="-screen 0 1920x1200x24" pnpm run verify:studio-3d-console';
    const parityIndex = parityCommands.indexOf(headedParityCommand);
    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(browserInstallIndex).toBeGreaterThan(installIndex);
    expect(buildIndex).toBeGreaterThan(browserInstallIndex);
    expect(parityIndex).toBeGreaterThan(buildIndex);
    expect(
      parityCommands.filter((command) => command === headedParityCommand),
    ).toHaveLength(1);
    expect(parityCommands).not.toContain("pnpm run verify:studio-3d-console");

    const parityStep = paritySteps.find(
      (step) => step.run === headedParityCommand,
    );
    expect(parityStep?.if).toBeUndefined();
    expect(parityStep?.["continue-on-error"]).not.toBe(true);
  });
});
