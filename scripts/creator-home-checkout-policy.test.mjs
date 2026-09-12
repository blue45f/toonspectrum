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
const includedDirectories = checkout.with["sparse-checkout"].trim().split(/\s+/u);

function expectAvailableInCheckout(path) {
  const relativePath = relative(repositoryRoot, path).replaceAll("\\", "/");
  expect(existsSync(path), `${relativePath} must be a shipped source input`).toBe(true);
  expect(includedDirectories.some((directory) => relativePath.startsWith(`${directory}/`)),
    `${relativePath} must be present before the production build`).toBe(true);
}

describe("creator homepage production checkout", () => {
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
});
