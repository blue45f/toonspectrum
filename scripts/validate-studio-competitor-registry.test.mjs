import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  STUDIO_COMPETITOR_CATEGORIES,
  STUDIO_COMPETITOR_REGISTRY_PATH,
  summarizeStudioCompetitorRegistry,
  validateStudioCompetitorRegistry,
} from "./validate-studio-competitor-registry.mjs";

const registry = JSON.parse(fs.readFileSync(STUDIO_COMPETITOR_REGISTRY_PATH, "utf8"));

test("the committed registry remains broad, unique, and schema-valid", () => {
  const issues = validateStudioCompetitorRegistry(registry);
  assert.deepEqual(issues, []);

  const summary = summarizeStudioCompetitorRegistry(registry);
  assert.ok(summary.productCount >= 50);
  assert.equal(Object.values(summary.byCategory).filter((count) => count > 0).length, STUDIO_COMPETITOR_CATEGORIES.length);
  assert.ok(summary.byPriority.P0 >= 10);
});

test("duplicate ids, names, and focus tags are rejected", () => {
  const sample = {
    schemaVersion: 1,
    updatedAt: "2026-09-02",
    purpose: "A sufficiently detailed clean-room benchmarking purpose for an isolated unit test.",
    products: [
      {
        id: "sample-tool",
        name: "Sample Tool",
        category: "comic-drawing",
        officialUrl: "https://example.com/",
        watchUrl: "https://example.com/releases",
        priority: "P1",
        focus: ["brush-engine", "brush-engine"],
      },
      {
        id: "sample-tool",
        name: "sample tool",
        category: "comic-drawing",
        officialUrl: "https://example.com/other",
        watchUrl: "https://example.com/news",
        priority: "P1",
        focus: ["layers"],
      },
    ],
  };

  const issues = validateStudioCompetitorRegistry(sample, {
    minimumProductCount: 0,
    requireEveryCategory: false,
  });
  assert.ok(issues.some((issue) => issue.includes("duplicates sample-tool")));
  assert.ok(issues.some((issue) => issue.includes("duplicates sample tool")));
  assert.ok(issues.some((issue) => issue.includes("duplicate tags")));
});

test("unknown categories, insecure URLs, and malformed tags fail closed", () => {
  const sample = {
    schemaVersion: 1,
    updatedAt: "2026-09-02",
    purpose: "A sufficiently detailed clean-room benchmarking purpose for an isolated unit test.",
    products: [
      {
        id: "broken-tool",
        name: "Broken Tool",
        category: "unknown",
        officialUrl: "http://example.com/",
        watchUrl: "not-a-url",
        priority: "P9",
        focus: ["Not Valid"],
      },
    ],
  };

  const issues = validateStudioCompetitorRegistry(sample, {
    minimumProductCount: 0,
    requireEveryCategory: false,
  });
  assert.ok(issues.some((issue) => issue.includes("category is not supported")));
  assert.ok(issues.some((issue) => issue.includes("must use https")));
  assert.ok(issues.some((issue) => issue.includes("must be a valid URL")));
  assert.ok(issues.some((issue) => issue.includes("priority must be")));
  assert.ok(issues.some((issue) => issue.includes("lowercase kebab-case")));
});

test("watch URLs cannot silently point at unrelated third-party hosts", () => {
  const sample = {
    schemaVersion: 1,
    updatedAt: "2026-09-02",
    purpose: "A sufficiently detailed clean-room benchmarking purpose for an isolated unit test.",
    products: [
      {
        id: "sample-tool",
        name: "Sample Tool",
        category: "comic-drawing",
        officialUrl: "https://vendor.example.com/",
        watchUrl: "https://unrelated.example.net/releases",
        priority: "P1",
        focus: ["brush-engine"],
      },
    ],
  };

  const issues = validateStudioCompetitorRegistry(sample, {
    minimumProductCount: 0,
    requireEveryCategory: false,
  });
  assert.ok(issues.some((issue) => issue.includes("official domain family")));
});

test("an official GitHub release stream is accepted for open-source products", () => {
  const sample = {
    schemaVersion: 1,
    updatedAt: "2026-09-02",
    purpose: "A sufficiently detailed clean-room benchmarking purpose for an isolated unit test.",
    products: [
      {
        id: "open-tool",
        name: "Open Tool",
        category: "comic-drawing",
        officialUrl: "https://open-tool.example/",
        watchUrl: "https://github.com/example/open-tool/releases",
        priority: "P1",
        focus: ["open-source"],
      },
    ],
  };

  assert.deepEqual(
    validateStudioCompetitorRegistry(sample, {
      minimumProductCount: 0,
      requireEveryCategory: false,
    }),
    [],
  );
});
