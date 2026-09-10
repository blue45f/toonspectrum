import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const retiredOneShotWorkflows = [
  ".github/workflows/studio-architecture-ratchet-arm.yml",
  ".github/workflows/studio-architecture-ratchet-executor.yml",
  ".github/workflows/studio-architecture-ratchet-materialize.yml",
  ".github/workflows/studio-architecture-ratchet-slim-executor.yml",
  ".github/workflows/qa-convergence-menubar-test-fix.yml",
  ".github/workflows/scene3d-production-asset-admission-bootstrap.yml",
  ".github/workflows/scene3d-production-asset-admission-executor.yml",
] as const;

describe("retired one-shot GitHub workflows", () => {
  it("keeps completed branch materializers out of the active workflow set", () => {
    for (const workflow of retiredOneShotWorkflows) {
      expect(existsSync(resolve(process.cwd(), workflow)), workflow).toBe(false);
    }
  });
});
