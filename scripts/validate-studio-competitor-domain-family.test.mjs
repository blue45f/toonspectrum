import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  STUDIO_COMPETITOR_REGISTRY_PATH,
  shareStudioOfficialDomainFamily,
  summarizeStudioCompetitorRegistry,
  validateStudioCompetitorRegistry,
} from "./validate-studio-competitor-registry.mjs";

test("recognizes Adobe and Mixamo as one explicit official source family", () => {
  assert.equal(
    shareStudioOfficialDomainFamily("www.mixamo.com", "helpx.adobe.com"),
    true,
  );
  assert.equal(
    shareStudioOfficialDomainFamily("www.adobe.com", "helpx.adobe.com"),
    true,
  );
  assert.equal(
    shareStudioOfficialDomainFamily("www.mixamo.com", "unrelated.example"),
    false,
  );
});

test("the expanded committed competitor registry is internally valid", () => {
  const registry = JSON.parse(fs.readFileSync(STUDIO_COMPETITOR_REGISTRY_PATH, "utf8"));
  assert.deepEqual(validateStudioCompetitorRegistry(registry), []);
  const summary = summarizeStudioCompetitorRegistry(registry);
  assert.equal(summary.productCount, 62);
  assert.ok(Object.values(summary.byCategory).every((count) => count > 0));
});
