import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const retiredWorkflows = [
  ".github/workflows/scene3d-production-asset-admission-bootstrap.yml",
  ".github/workflows/scene3d-production-asset-admission-executor.yml",
] as const;

describe("retired Scene3D asset-admission materializers", () => {
  it("keeps completed branch-only materializers out of the active workflow set", () => {
    for (const workflow of retiredWorkflows) {
      expect(existsSync(resolve(process.cwd(), workflow)), workflow).toBe(false);
    }
  });
});
