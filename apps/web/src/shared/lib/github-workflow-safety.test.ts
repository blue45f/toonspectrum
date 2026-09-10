import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type UnknownRecord = Record<string, unknown>;

const repositoryRoot = process.cwd();
const workflowDirectory = join(repositoryRoot, ".github", "workflows");
const branchTargetKeys = new Set(["ref", "BRANCH_NAME", "HEAD"]);
const protectedCoreName = "core";
const pullRequestTriggers = new Set(["pull_request", "pull_request_target"]);
const protectedBranchNames = new Set([
  "main",
  "master",
  "develop",
  "development",
  "staging",
  "production",
  "release",
]);
const productBranchPrefixPattern = /^(?:ci|chore|feat|feature|fix|hotfix|release)\//u;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseWorkflow(name: string, source: string): UnknownRecord {
  try {
    const parsed: unknown = parse(source);
    if (!isRecord(parsed)) {
      throw new TypeError("workflow root must be a YAML mapping");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${name}: ${message}`);
  }
}

const workflows = readdirSync(workflowDirectory)
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort()
  .map((name) => {
    const source = readFileSync(join(workflowDirectory, name), "utf8");
    return { name, parsed: parseWorkflow(name, source) };
  });

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

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function hasPullRequestTrigger(trigger: unknown): boolean {
  if (typeof trigger === "string") return pullRequestTriggers.has(trigger);
  if (Array.isArray(trigger)) {
    return trigger.some((event) =>
      typeof event === "string" && pullRequestTriggers.has(event),
    );
  }
  return (
    isRecord(trigger)
    && [...pullRequestTriggers].some((event) => hasOwn(trigger, event))
  );
}

function grantsContentsWrite(permissions: unknown): boolean {
  if (permissions === "write-all") return true;
  return isRecord(permissions) && permissions.contents === "write";
}

function jobGrantsContentsWrite(
  workflow: UnknownRecord,
  job: UnknownRecord,
): boolean {
  if (hasOwn(job, "permissions")) return grantsContentsWrite(job.permissions);
  return grantsContentsWrite(workflow.permissions);
}

function findProtectedCoreJobs(workflow: UnknownRecord): string[] {
  if (!isRecord(workflow.jobs)) return [];

  const matches: string[] = [];
  for (const [jobId, rawJob] of Object.entries(workflow.jobs)) {
    const resolvedName = isRecord(rawJob) && typeof rawJob.name === "string"
      ? rawJob.name.trim()
      : null;
    if (jobId === protectedCoreName || resolvedName === protectedCoreName) {
      matches.push(jobId);
    }
  }
  return matches;
}

function isDynamicBranchTarget(value: string): boolean {
  return value.includes("${{") || /^\$(?:\{?[A-Za-z_][A-Za-z0-9_]*\}?)/u.test(value);
}

function isHardCodedBranchTarget(key: string, value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized || isDynamicBranchTarget(normalized)) return false;
  if (key !== "ref") return true;

  const normalizedRef = normalized.replace(/^(?:refs\/heads\/|origin\/)/u, "");
  return (
    protectedBranchNames.has(normalizedRef)
    || productBranchPrefixPattern.test(normalizedRef)
  );
}

function collectHardCodedBranchTargets(value: unknown, path: string): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectHardCodedBranchTargets(item, `${path}[${index}]`),
    );
  }
  if (!isRecord(value)) return [];

  const findings: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (branchTargetKeys.has(key) && isHardCodedBranchTarget(key, child)) {
      findings.push(`${childPath}=${JSON.stringify(child)}`);
    }
    findings.push(...collectHardCodedBranchTargets(child, childPath));
  }
  return findings;
}

function findUnsafePullRequestBranchTargets(workflow: UnknownRecord): string[] {
  if (!hasPullRequestTrigger(workflow.on) || !isRecord(workflow.jobs)) return [];

  const findings = new Set<string>();
  for (const [jobId, rawJob] of Object.entries(workflow.jobs)) {
    if (!isRecord(rawJob) || !jobGrantsContentsWrite(workflow, rawJob)) continue;

    for (const finding of collectHardCodedBranchTargets(workflow.env, "env")) {
      findings.add(finding);
    }
    for (const finding of collectHardCodedBranchTargets(rawJob, `jobs.${jobId}`)) {
      findings.add(finding);
    }
  }
  return [...findings].sort();
}

describe("GitHub workflow safety", () => {
  it("reserves the protected core check name for the canonical CI workflow", () => {
    for (const workflow of workflows) {
      if (workflow.name === "ci.yml") continue;
      expect(
        findProtectedCoreJobs(workflow.parsed),
        `${workflow.name} must not define the protected core check`,
      ).toEqual([]);
    }
  });

  it("rejects pull-request workflows that can write a hard-coded product branch", () => {
    for (const workflow of workflows) {
      expect(
        findUnsafePullRequestBranchTargets(workflow.parsed),
        `${workflow.name} must not write a hard-coded branch from a pull request`,
      ).toEqual([]);
    }
  });

  it("covers YAML forms that raw-text checks can miss", () => {
    const commentedCoreName = parseWorkflow(
      "commented-core.yml",
      `
on: push
jobs:
  aggregate:
    name: core # protected
    runs-on: ubuntu-latest
    steps: []
`,
    );
    expect(findProtectedCoreJobs(commentedCoreName)).toEqual(["aggregate"]);

    const flowWriteAll = parseWorkflow(
      "flow-write-all.yml",
      `
on: [pull_request]
permissions: write-all
jobs:
  patch:
    runs-on: ubuntu-latest
    env: { BRANCH_NAME: main }
    steps: []
`,
    );
    expect(findUnsafePullRequestBranchTargets(flowWriteAll)).toContain(
      "jobs.patch.env.BRANCH_NAME=\"main\"",
    );

    const flowMappings = parseWorkflow(
      "flow-mappings.yml",
      `
on: { pull_request: {} }
jobs:
  patch:
    permissions: { contents: write }
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with: { ref: feat/hard-coded }
`,
    );
    expect(findUnsafePullRequestBranchTargets(flowMappings)).toContain(
      "jobs.patch.steps[0].with.ref=\"feat/hard-coded\"",
    );

    const dynamicTarget = parseWorkflow(
      "dynamic-target.yml",
      `
on: [pull_request]
permissions: write-all
jobs:
  patch:
    runs-on: ubuntu-latest
    env: { BRANCH_NAME: "\${{ github.head_ref }}" }
    steps:
      - uses: actions/checkout@v6
        with: { ref: "\${{ github.event.pull_request.head.sha }}" }
`,
    );
    expect(findUnsafePullRequestBranchTargets(dynamicTarget)).toEqual([]);
  });

  it("keeps retired one-shot writers and alert snapshots out of the repository", () => {
    for (const relativePath of retiredArtifacts) {
      expect(
        existsSync(join(repositoryRoot, relativePath)),
        relativePath,
      ).toBe(false);
    }
  });
});
