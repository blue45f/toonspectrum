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
});
