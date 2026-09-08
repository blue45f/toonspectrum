import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const workspace = parse(readFileSync(new URL("../pnpm-workspace.yaml", import.meta.url), "utf8"));
const lock = parse(readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8"));
const runnerVersion = manifest.devDependencies.vitest;
const cohort = ["vitest", "@vitest/coverage-v8", "@vitest/ui"];

describe("Vitest coverage toolchain contract", () => {
  it("pins the runner and coverage provider to the same exact release", () => {
    expect(runnerVersion).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(manifest.devDependencies["@vitest/coverage-v8"]).toBe(runnerVersion);
  });

  it("does not let security overrides independently upgrade a cohort member", () => {
    for (const name of cohort) {
      expect(workspace.overrides[name], name).toBe(runnerVersion);
      expect(lock.overrides[name], name).toBe(runnerVersion);
    }
  });

  it("resolves the same runner and coverage provider in clean CI installs", () => {
    for (const name of ["vitest", "@vitest/coverage-v8"]) {
      const dependency = lock.importers["."].devDependencies[name];
      expect(dependency.specifier, name).toBe(runnerVersion);
      expect(dependency.version.split("(")[0], name).toBe(runnerVersion);
      const packages = Object.keys(lock.packages).filter(key => key.startsWith(`${name}@`));
      expect(packages, name).toEqual([`${name}@${runnerVersion}`]);
    }
  });
});
