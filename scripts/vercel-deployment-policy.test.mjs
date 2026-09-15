import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const config = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);
const workflowDirectory = new URL("../.github/workflows/", import.meta.url);
const deployWorkflow = parse(
  readFileSync(new URL("deploy-vercel.yml", workflowDirectory), "utf8"),
);
const preflight = deployWorkflow.jobs.deploy.steps[0];
const approval = {
  PATH: process.env.PATH,
  WORKFLOW_REF: "refs/heads/main",
  REQUESTED_REF: "a".repeat(40),
  DEPLOY_CONFIRMATION: "DEPLOY-TOONSPECTRUM-PREBUILT",
  VERCEL_TOKEN: "fixture-not-a-token",
  VERCEL_ORG_ID: "fixture-team",
  VERCEL_PROJECT_ID: "fixture-project",
};

describe("Vercel Git deployment policy", () => {
  it("disables every Git-triggered deployment, including main", () => {
    expect(config.ignoreCommand).toBeUndefined();
    expect(config.git?.deploymentEnabled).toEqual({ "**": false });
    expect(Object.values(config.git?.deploymentEnabled ?? {})).not.toContain(true);
  });
});

describe("manual-only minimum-cost release policy", () => {
  it("requires explicit SHA and confirmation inputs on the sole Vercel deploy workflow", () => {
    expect(Object.keys(deployWorkflow.on)).toEqual(["workflow_dispatch"]);
    for (const key of ["ref", "confirm"]) {
      expect(deployWorkflow.on.workflow_dispatch.inputs[key]).toMatchObject({
        required: true,
        type: "string",
      });
    }
    expect(preflight.env).toEqual({
      REQUESTED_REF: "${{ inputs.ref }}",
      DEPLOY_CONFIRMATION: "${{ inputs.confirm }}",
      WORKFLOW_REF: "${{ github.ref }}",
    });
    expect(deployWorkflow.concurrency["cancel-in-progress"]).toBe(false);
    expect(deployWorkflow.jobs.deploy.environment).toBe("production");
    expect(deployWorkflow.jobs.deploy.steps[1].with.ref).toBe("${{ inputs.ref }}");
  });

  it.each([
    { DEPLOY_CONFIRMATION: "" },
    { DEPLOY_CONFIRMATION: "[deploy]" },
    { REQUESTED_REF: "" },
    { REQUESTED_REF: "main" },
    { REQUESTED_REF: "abcdef1" },
    { REQUESTED_REF: `${"a".repeat(40)}; echo unexpected` },
    { WORKFLOW_REF: "refs/heads/feature" },
    { VERCEL_TOKEN: "" },
  ])("refuses unsafe or unapproved release inputs: %j", (override) => {
    const result = spawnSync("bash", ["-c", preflight.run], {
      env: { ...approval, ...override },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain(approval.VERCEL_TOKEN);
  });

  it("permits preflight only for an approved exact SHA without deploying anything", () => {
    const result = spawnSync("bash", ["-c", preflight.run], {
      env: approval,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(approval.VERCEL_TOKEN);
  });

  it("has no second Vercel deployment workflow or automatic deployment trigger", () => {
    const publishers = [];
    for (const filename of readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/u.test(name))) {
      const source = readFileSync(new URL(filename, workflowDirectory), "utf8");
      if (!/\bvercel\s+(?:deploy|--prod)\b/u.test(source)) continue;
      publishers.push(filename);
      expect(Object.keys(parse(source).on)).toEqual(["workflow_dispatch"]);
      expect(source).not.toMatch(/vercel deploy --prod(?:\s|$)/u);
    }
    expect(publishers).toEqual(["deploy-vercel.yml"]);
  });

  it("removes legacy Vercel aliases from the normal package scripts", () => {
    const scripts = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ).scripts;
    for (const key of ["vercel:deploy", "vercel:preview", "vercel:status", "vercel:inspect"]) {
      expect(scripts[key]).toBeUndefined();
    }
    expect(scripts["verify:vercel-fallback"]).toBe(
      "node scripts/cloudflare-static-rules.mjs --check-vercel-fallback",
    );
  });
});
