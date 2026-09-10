import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const workflowDirectory = join(repositoryRoot, ".github", "workflows");
const workflows = readdirSync(workflowDirectory)
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort()
  .map((name) => ({
    name,
    source: readFileSync(join(workflowDirectory, name), "utf8"),
  }));

const retiredArtifacts = [
  ".github/code-scanning-open-alerts.json",
  ".github/code-scanning-open-alerts.md",
  ".github/workflows/apply-learn-landmark-fix.yml",
  ".github/workflows/apply-studio-effects-workspace.yml",
  ".github/workflows/character-3d-ux-patch-20260909.yml",
  ".github/workflows/character-modeler-assets-20260909.yml",
  ".github/workflows/code-scanning-audit-temp.yml",
  ".github/workflows/fix-mannequin-terminal-scale-once.yml",
  ".github/workflows/fix-pr1057-ci.yml",
  ".github/workflows/patch-mannequin-foot-scaling.yml",
  ".github/workflows/restore-ci-after-bulk-integration.yml",
] as const;

describe("GitHub workflow safety", () => {
  it("reserves the protected core check name for the canonical CI workflow", () => {
    for (const workflow of workflows) {
      if (workflow.name === "ci.yml") continue;

      expect(workflow.source, `${workflow.name} must not define a core job`).not.toMatch(
        /^ {2}core:\s*(?:#.*)?$/mu,
      );
      expect(workflow.source, `${workflow.name} must not rename a job to core`).not.toMatch(
        /^ {4}name:\s*["']?core["']?\s*$/imu,
      );
    }
  });

  it("rejects pull-request workflows that can write a hard-coded product branch", () => {
    for (const workflow of workflows) {
      const handlesPullRequests = /^\s*pull_request\s*:/mu.test(workflow.source);
      const writesRepositoryContents = /^\s*contents:\s*write\s*$/mu.test(
        workflow.source,
      );
      if (!handlesPullRequests || !writesRepositoryContents) continue;

      expect(
        workflow.source,
        `${workflow.name} must not write a hard-coded branch from a pull request`,
      ).not.toMatch(
        /(?:ref:|BRANCH_NAME:|HEAD:)\s*["']?(?:fix|feat|chore|ci)\//u,
      );
    }
  });

  it("keeps retired one-shot writers and alert snapshots out of the repository", () => {
    for (const relativePath of retiredArtifacts) {
      expect(existsSync(join(repositoryRoot, relativePath)), relativePath).toBe(false);
    }
  });
});
