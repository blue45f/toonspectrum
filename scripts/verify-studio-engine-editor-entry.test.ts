import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveStudioRoute } from "../apps/web/src/domains/creator/studio-router/studio-route-manifest";

const verifiers = [
  "verify-studio-hokusai-live-integration.mts",
  "verify-studio-living-ink-integration.mts",
  "verify-studio-hybrid-dcc-integration.mts",
] as const;

describe("production engine verifier entry", () => {
  it.each(verifiers)("%s enters the shipped canvas instead of the project home", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const suffix = source.match(/const studioUrl = `\$\{origin\}([^`]+)`;/u)?.[1];
    expect(suffix).toBe("studio/canvas");
    const url = new URL(suffix ?? "", "http://127.0.0.1:5199/");
    expect(resolveStudioRoute({ pathname: url.pathname })).toMatchObject({ kind: "editor" });
  });

  it("does not confuse the project home with an editor", () => {
    expect(resolveStudioRoute({ pathname: "/studio" }).kind).not.toBe("editor");
  });

  it("builds the exact production bundle before engine preview probes", () => {
    const workflow = readFileSync(new URL("../.github/workflows/main-full-qa-fast-diagnostics.yml", import.meta.url), "utf8");
    const job = workflow.split("  engine-extended:")[1]?.split("  studio-browser-core:")[0] ?? "";
    const buildAt = job.indexOf("run: pnpm run build:bundle");
    const previewAt = job.indexOf("pnpm run verify:studio-hokusai-live-integration");
    expect(buildAt).toBeGreaterThanOrEqual(0);
    expect(previewAt).toBeGreaterThan(buildAt);
    for (const command of [
      "verify:studio-hokusai-wasm", "verify:studio-hokusai-natural-media-quality",
      "verify:studio-hokusai-live-integration", "verify:studio-living-ink-execution",
      "verify:studio-living-ink-integration", "verify:studio-hybrid-dcc-integration",
    ]) expect(job).toContain(`pnpm run ${command}`);
    expect(job).not.toContain("continue-on-error");
    expect(job).not.toContain("|| true");
  });
  it("executes each engine regression exactly once in the mandatory CI static job", () => {
    const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    const staticJob = workflow.split("  static:")[1]?.split("  serial:")[0] ?? "";
    for (const target of [
      "scripts/verify-studio-engine-editor-entry.test.ts",
      "scripts/verify-studio-hokusai-live-integration.test.ts",
      "scripts/verify-studio-living-ink-integration.test.ts",
      "scripts/verify-studio-hybrid-dcc-integration.test.ts",
      "scripts/verify-studio-hybrid-dcc-opfs-race.test.ts",
    ]) {
      expect(
        staticJob.split(target),
        `${target} must remain mandatory without duplicate execution`,
      ).toHaveLength(2);
    }
  });
});
