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
});
