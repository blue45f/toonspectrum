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
  it("accepts only immutable commits already reviewed into main", () => {
    const checkout = positionOf("uses: actions/checkout@v6");
    const sourceGate = positionOf(
      "Require a reviewed commit from the current main history",
    );
    const pull = positionOf("Pull production project settings and environment");

    expect(checkout).toBeLessThan(sourceGate);
    expect(sourceGate).toBeLessThan(pull);
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("git fetch --no-tags origin main");
    expect(workflow).toContain(
      'git merge-base --is-ancestor "$deploy_sha" "$main_sha"',
    );
    expect(workflow).toContain("not contained in origin/main");
  });

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

  it("fails closed without credentials and serializes production recovery", () => {
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

  it("publishes only a validated HTTPS deployment URL", () => {
    expect(workflow).toContain("deployment_output=");
    expect(workflow).toContain("awk '/^https:\\/\\//{url=$0} END{print url}'");
    expect(workflow).toContain('[[ ! "$deployment_url" =~ ^https:// ]]');
    expect(workflow).toContain("Vercel CLI did not return a production deployment URL");
    expect(workflow).toContain("Immutable commit:");
    expect(workflow).toContain("Main at validation:");
  });
});
