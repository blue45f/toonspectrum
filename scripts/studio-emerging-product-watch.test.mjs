import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  STUDIO_EMERGING_PRODUCT_REGISTRY_PATH,
  renderStudioEmergingProductWatchMarkdown,
  validateStudioEmergingProductRegistry,
} from "./studio-emerging-product-watch.mjs";

test("committed emerging-product registry is valid and broad", () => {
  const registry = JSON.parse(fs.readFileSync(STUDIO_EMERGING_PRODUCT_REGISTRY_PATH, "utf8"));
  assert.deepEqual(validateStudioEmergingProductRegistry(registry), []);
  assert.ok(registry.products.length >= 20);
  assert.ok(new Set(registry.products.map((product) => product.category)).size >= 6);
  assert.ok(registry.products.some((product) => product.priority === "P0"));
});

test("emerging-product markdown uses an independent issue marker", () => {
  const markdown = renderStudioEmergingProductWatchMarkdown({
    generatedAt: "2026-09-02T00:00:00.000Z",
    selectedCount: 1,
    okCount: 1,
    failedCount: 0,
    aggregateHash: "a".repeat(64),
    results: [
      {
        name: "Example",
        category: "animation-2d",
        ok: true,
        status: 200,
        title: "Example release notes",
        lastModified: "",
        contentHash: "b".repeat(64),
      },
    ],
  });

  assert.match(markdown, /<!-- studio-emerging-product-watch -->/u);
  assert.match(markdown, /Studio emerging-product source watch/u);
  assert.doesNotMatch(markdown, /<!-- studio-competitor-watch -->/u);
});
