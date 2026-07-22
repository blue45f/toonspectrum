import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateNoDuplicateVercelTrigger,
  validateVercelFallbackWorkflow,
} from "./vercel-workflow-policy.mjs";

const ROOT = process.cwd();
const fallback = fs.readFileSync(
  path.join(ROOT, ".github/workflows/deploy-vercel.yml"),
  "utf8",
);

function mutate(source, before, after) {
  expect(source).toContain(before);
  return source.replace(before, after);
}

describe("Vercel fallback workflow policy", () => {
  it("accepts the checked-in manual, project-bound workflow", () => {
    expect(validateVercelFallbackWorkflow(fallback)).toEqual([]);
  });

  it("rejects automatic triggers and commented-out project bindings", () => {
    const automatic = mutate(
      fallback,
      "on:\n  workflow_dispatch:",
      "on:\n  push:\n    branches: [main]\n  workflow_dispatch:",
    );
    expect(validateVercelFallbackWorkflow(automatic)).toContain(
      "Vercel CLI fallback must expose workflow_dispatch as its only trigger",
    );

    const commented = mutate(
      fallback,
      "      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}",
      "      # VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}",
    );
    expect(validateVercelFallbackWorkflow(commented)).toContain(
      "Vercel fallback workflow is missing the exact VERCEL_PROJECT_ID secret binding",
    );

    const elevated = mutate(fallback, "permissions:\n  contents: read", "permissions: write-all");
    expect(validateVercelFallbackWorkflow(elevated)).toContain(
      "Vercel CLI fallback must grant only contents: read permission",
    );
  });

  it("rejects a successful no-op and project overrides", () => {
    const noFailure = mutate(fallback, "            exit 1\n", "            echo \"skipped\"\n");
    expect(validateVercelFallbackWorkflow(noFailure)).toContain(
      "Vercel fallback preflight must fail instead of reporting a successful no-op",
    );

    const override = mutate(
      fallback,
      "      - name: Deploy frontend to Vercel production\n",
      "      - name: Deploy frontend to Vercel production\n        env:\n          VERCEL_PROJECT_ID: wrong-project\n",
    );
    expect(validateVercelFallbackWorkflow(override)).toContain(
      "Vercel fallback step 5 must not override job-level VERCEL_PROJECT_ID",
    );
  });

  it("rejects alternate workspace installs and a weakened deploy command", () => {
    const workspaceInstall = mutate(
      fallback,
      "          npm install --global --no-audit --no-fund \"vercel@${VERCEL_CLI_VERSION}\"\n",
      "          pnpm i\n          npm install --global --no-audit --no-fund \"vercel@${VERCEL_CLI_VERSION}\"\n",
    );
    expect(validateVercelFallbackWorkflow(workspaceInstall)).toContain(
      "Vercel source fallback must not install workspace dependencies: pnpm i",
    );

    const previewDeploy = mutate(
      fallback,
      '        run: vercel deploy --prod --yes --token "$VERCEL_TOKEN"',
      '        run: vercel deploy --yes --token "$VERCEL_TOKEN"',
    );
    expect(validateVercelFallbackWorkflow(previewDeploy)).toContain(
      "Vercel fallback workflow is missing its exact production deploy command",
    );
  });
});

describe("automatic content update deployment policy", () => {
  it("rejects hook, workflow-dispatch, CLI, and elevated-permission duplicates", () => {
    expect(validateNoDuplicateVercelTrigger("VERCEL_DEPLOY_HOOK_URL=x")).not.toEqual([]);
    expect(validateNoDuplicateVercelTrigger("gh workflow run deploy-vercel.yml")).not.toEqual([]);
    expect(validateNoDuplicateVercelTrigger("vercel deploy --prod")).not.toEqual([]);
    expect(
      validateNoDuplicateVercelTrigger("permissions:\n  actions: write\n", { workflow: true }),
    ).not.toEqual([]);
    expect(
      validateNoDuplicateVercelTrigger("permissions: write-all\n", { workflow: true }),
    ).not.toEqual([]);
  });
});
