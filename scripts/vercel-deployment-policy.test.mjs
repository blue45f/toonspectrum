import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const config = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);

describe("Vercel Git deployment policy", () => {
  it("disables every Git deployment, including main and slash-named branches", () => {
    expect(config.ignoreCommand).toBeUndefined();
    expect(config.git?.deploymentEnabled).toBe(false);
  });
});

const workflowDirectory = new URL("../.github/workflows/", import.meta.url);
const deployWorkflow = parse(readFileSync(new URL("deploy-vercel.yml", workflowDirectory), "utf8"));
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

describe("manual-only minimum-cost release policy", () => {
  it("requires an explicit SHA and owner confirmation on the sole manual deployment workflow", () => {
    expect(Object.keys(deployWorkflow.on)).toEqual(["workflow_dispatch"]);
    for (const key of ["ref", "confirm"]) {
      expect(deployWorkflow.on.workflow_dispatch.inputs[key]).toMatchObject({ required: true, type: "string" });
    }
    expect(preflight.env).toEqual({
      REQUESTED_REF: "${{ inputs.ref }}",
      DEPLOY_CONFIRMATION: "${{ inputs.confirm }}",
      WORKFLOW_REF: "${{ github.ref }}",
    });
    expect(deployWorkflow.concurrency["cancel-in-progress"]).toBe(false);
    expect(deployWorkflow.jobs.deploy.environment).toBe("production");
  });

  it.each([
    { DEPLOY_CONFIRMATION: "" },
    { DEPLOY_CONFIRMATION: "[deploy]" },
    { REQUESTED_REF: "" },
    { REQUESTED_REF: "main" },
    { REQUESTED_REF: "abcdef1" },
    { REQUESTED_REF: "a".repeat(40) + "; echo unexpected" },
    { WORKFLOW_REF: "refs/heads/feature" },
    { VERCEL_TOKEN: "" },
  ])("refuses unsafe or unapproved release inputs: %j", (override) => {
    const result = spawnSync("bash", ["-c", preflight.run], {
      env: { ...approval, ...override }, encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain(approval.VERCEL_TOKEN);
  });

  it("permits preflight only for an approved exact SHA without deploying anything", () => {
    const result = spawnSync("bash", ["-c", preflight.run], { env: approval, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain(approval.VERCEL_TOKEN);
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

  it.each(["vercel:deploy", "vercel:preview"])("blocks the legacy %s alias without network access", (key) => {
    const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
    expect(scripts[key]).toContain("node scripts/manual-deployment-policy.mjs");
    const result = spawnSync(process.execPath, [new URL("./manual-deployment-policy.mjs", import.meta.url).pathname], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Deployment was NOT started");
  });
});
