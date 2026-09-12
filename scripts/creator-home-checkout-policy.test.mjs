import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { EMBEDDED_FIRST_PARTY_PORT_NOTICES } from "./generate-third-party-notices.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const workflow = parseYaml(readFileSync(new URL("../.github/workflows/creator-home-quality.yml", import.meta.url), "utf8"));
const steps = workflow.jobs["creator-home"].steps;
const checkout = steps.find((step) => step.uses?.startsWith("actions/checkout@"));
const browserCommands = steps.find((step) => step.name === "Verify selected homepage contracts").run;
const firstVerifier = browserCommands.indexOf('if [[ "${{ steps.scope.outputs.purpose }}"');
const readinessCommands = browserCommands.slice(browserCommands.indexOf("preview_ready=false"), firstVerifier)
  .replaceAll("/tmp/creator-home-preview.log", "/dev/null");

function expectAvailableInCheckout(path) {
  const relativePath = relative(repositoryRoot, path).replaceAll("\\", "/");
  expect(existsSync(path), `${relativePath} must be a shipped source input`).toBe(true);
}

describe("creator homepage production checkout", () => {
  it("checks out the complete production source tree before bundling the whole app", () => {
    expect(checkout.with["sparse-checkout"]).toBeUndefined();
    expect(checkout.with.filter).toBeUndefined();
    expect(checkout.with["persist-credentials"]).toBe(false);
    expect(checkout.with["fetch-depth"]).toBe(1);
  });

  it("includes the checked-in WASM bindings used by browser engine imports", () => {
    for (const sourcePath of [
      "packages/studio-engine-vello/src/render.ts",
      "packages/studio-engine-vello/src/svg-vello.ts",
    ]) {
      const absoluteSource = resolve(repositoryRoot, sourcePath);
      const source = readFileSync(absoluteSource, "utf8");
      const imports = [...source.matchAll(/from\s+["']([^"']*crates\/[^"']+)["']/gu)];
      expect(imports.length, `${sourcePath} must exercise its actual artifact import`).toBeGreaterThan(0);
      for (const [, specifier] of imports) {
        const artifact = resolve(dirname(absoluteSource), specifier);
        expectAvailableInCheckout(artifact);
        expectAvailableInCheckout(artifact.replace(/\.js$/u, "_bg.wasm"));
      }
    }
  });

  it("includes the shared deployment protocol imported by the application", () => {
    const sourcePath = resolve(repositoryRoot, "apps/web/src/domains/creator/studio-realtime-provider-cloudflare-adapter.ts");
    const source = readFileSync(sourcePath, "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']*deploy\/[^"']+)["']/gu)];
    expect(imports.length).toBeGreaterThan(0);
    for (const [, specifier] of imports) {
      expectAvailableInCheckout(resolve(dirname(sourcePath), `${specifier}.ts`));
    }
  });

  it("includes the release-notice inputs required by the unchanged postbuild", () => {
    for (const { licensePath } of EMBEDDED_FIRST_PARTY_PORT_NOTICES) {
      expectAvailableInCheckout(licensePath);
    }
    expectAvailableInCheckout(resolve(repositoryRoot, "docs/third-party/opencascade-lgpl.md"));
    expectAvailableInCheckout(resolve(repositoryRoot, "crates/studio-engine-vello/THIRD_PARTY_INVENTORY.json"));
  });

  it("runs the checkout contract before building the production homepage", () => {
    const contractIndex = steps.findIndex((step) => step.run?.includes("vitest run")
      && step.run.includes("scripts/creator-home-checkout-policy.test.mjs"));
    const buildIndex = steps.findIndex((step) => step.run === "pnpm run build:bundle");
    expect(contractIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(contractIndex);
  });

  it("waits for HTTP readiness before the first verifier on the fixed preview port", () => {
    expect(browserCommands).toContain("--port 4173 --strictPort");
    expect(browserCommands).toContain('trap \'kill "$server_pid" || true\' EXIT');
    const readinessIndex = browserCommands.indexOf("preview_ready=false");
    expect(readinessIndex).toBeGreaterThan(-1);
    expect(firstVerifier).toBeGreaterThan(readinessIndex);
    expect(readinessCommands).toContain("preview_deadline=$((SECONDS + 60))");
  });

  it.each([
    { status: "200", processAlive: true, succeeds: true },
    { status: "204", processAlive: true, succeeds: false },
    { status: "000", processAlive: true, succeeds: false },
    { status: "200", processAlive: false, succeeds: false },
  ])("gates verifiers on an alive process and HTTP 200: $status / $processAlive", ({ status, processAlive, succeeds }) => {
    const result = spawnSync("bash", ["-c", [
      "set -euo pipefail",
      `server_pid=${processAlive ? "$$" : "99999999"}`,
      `curl() { printf '${status}'; }`,
      // Simulate the deadline without slowing down failed-readiness regressions.
      "sleep() { SECONDS=$((SECONDS + 60)); }",
      readinessCommands,
      "printf 'verifier-reached'",
    ].join("\n")], { encoding: "utf8", timeout: 5_000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(succeeds ? 0 : 1);
    expect(result.stdout.includes("verifier-reached")).toBe(succeeds);
  });
});
import { spawnSync } from "node:child_process";
