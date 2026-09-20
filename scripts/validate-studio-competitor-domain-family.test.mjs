import assert from "node:assert/strict";
import fs from "node:fs";
import nodeTest from "node:test";
import { test as vitestTest } from "vitest";

const test = process.env.VITEST ? vitestTest : nodeTest;

import {
  STUDIO_COMPETITOR_REGISTRY_PATH,
  summarizeStudioCompetitorRegistry,
  validateStudioCompetitorRegistry,
} from "./validate-studio-competitor-registry.mjs";

// Exact vendor-family cases remain in validate-studio-competitor-registry.test.mjs.
// This file owns the separate expanded-registry inventory contract.
test("the expanded committed competitor registry is internally valid", () => {
  const registry = JSON.parse(fs.readFileSync(STUDIO_COMPETITOR_REGISTRY_PATH, "utf8"));
  assert.deepEqual(validateStudioCompetitorRegistry(registry), []);
  const summary = summarizeStudioCompetitorRegistry(registry);
  assert.equal(summary.productCount, 62);
  assert.ok(Object.values(summary.byCategory).every((count) => count > 0));
});
