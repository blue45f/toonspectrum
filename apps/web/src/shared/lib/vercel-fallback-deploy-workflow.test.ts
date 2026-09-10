import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const workflowPath = join(
  process.cwd(),
  ".github",
  "workflows",
  "deploy-vercel.yml",
);
const workflow = readFileSync(workflowPath, "utf8");

function positionOf(fragment: string): number {
  const position = workflow.indexOf(fragment);
  expect(position, `${fragment} must exist in deploy-vercel.yml`).toBeGreaterThanOrEqual(0);
  return position;
}

describe("Vercel production fallback workflow", () => {
  it("builds production output before uploading a prebuilt deployment", () => {
    const pull = positionOf(
      'vercel pull --yes --environment=production --token "$VERCEL_TOKEN"',
    );
    const build = positionOf(
      'vercel build --prod --yes --token "$VERCEL_TOKEN"',
    );
    const deploy = positionOf(
      'vercel deploy --prebuilt --prod --yes --archive=tgz --token "$VERCEL_TOKEN"',
    );

    expect(pull).toBeLessThan(build);
    expect(build).toBeLessThan(deploy);
    expect(workflow).not.toMatch(/vercel deploy --prod(?:\s|$)/u);
  });

  it("fails closed without all project credentials and serializes production recovery", () => {
    for (const secret of [
      "secrets.VERCEL_TOKEN",
      "secrets.VERCEL_ORG_ID",
      "secrets.VERCEL_PROJECT_ID",
    ]) {
      expect(workflow).toContain(secret);
    }

    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("group: vercel-production-fallback");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("persist-credentials: false");
  });

  it("verifies the static and Lambda surfaces before deployment", () => {
    const build = positionOf("Build production output on the GitHub runner");
    const verify = positionOf("Verify immutable prebuilt output");
    const deploy = positionOf("Deploy prebuilt output to Vercel production");

    expect(build).toBeLessThan(verify);
    expect(verify).toBeLessThan(deploy);
    expect(workflow).toContain("test -f .vercel/output/config.json");
    expect(workflow).toContain("test -d .vercel/output/static");
    expect(workflow).toContain("test -d .vercel/output/functions");
    expect(workflow).toContain("-name '*.func'");
  });
});
