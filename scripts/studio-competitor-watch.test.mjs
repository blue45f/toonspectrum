import assert from "node:assert/strict";
import nodeTest from "node:test";
import { test as vitestTest } from "vitest";

const test = process.env.VITEST ? vitestTest : nodeTest;

import {
  buildCompetitorFingerprint,
  extractCompetitorPageTitle,
  normalizeCompetitorBody,
  renderStudioCompetitorWatchMarkdown,
  selectStudioCompetitors,
} from "./studio-competitor-watch.mjs";

test("HTML normalization removes scripts, styles, comments, and unstable tokens", () => {
  const normalized = normalizeCompetitorBody(`
    <html>
      <head><style>.x { color: red }</style><script>window.now = 123</script></head>
      <body><!-- build 44 --><h1>New &amp; improved</h1><p>session-token=abc123</p></body>
    </html>
  `);
  assert.equal(normalized, "New & improved");
});

test("page title extraction returns readable normalized text", () => {
  assert.equal(
    extractCompetitorPageTitle("<html><head><title> Product &amp; Release Notes </title></head></html>"),
    "Product & Release Notes",
  );
  assert.equal(extractCompetitorPageTitle("<main>No title</main>"), "");
});

test("selection defaults to P0 and supports explicit priorities or all", () => {
  const registry = {
    products: [
      { id: "a", priority: "P0" },
      { id: "b", priority: "P1" },
      { id: "c", priority: "P2" },
    ],
  };
  assert.deepEqual(selectStudioCompetitors(registry).map((row) => row.id), ["a"]);
  assert.deepEqual(
    selectStudioCompetitors(registry, { priorities: ["P1", "P2"] }).map((row) => row.id),
    ["b", "c"],
  );
  assert.deepEqual(selectStudioCompetitors(registry, { all: true }).map((row) => row.id), ["a", "b", "c"]);
});

test("aggregate fingerprint is deterministic and excludes timestamps", () => {
  const row = {
    id: "sample",
    ok: true,
    status: 200,
    finalUrl: "https://example.com/releases",
    title: "Release notes",
    etag: "v1",
    lastModified: "Wed, 02 Sep 2026 00:00:00 GMT",
    contentHash: "abc",
    errorCode: "",
    checkedAt: "2026-09-02T00:00:00.000Z",
  };
  const first = buildCompetitorFingerprint([row]);
  const second = buildCompetitorFingerprint([
    { ...row, checkedAt: "2026-09-03T00:00:00.000Z" },
  ]);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/u);
});

test("markdown report carries the machine marker and compact evidence", () => {
  const markdown = renderStudioCompetitorWatchMarkdown({
    generatedAt: "2026-09-02T00:00:00.000Z",
    selectedCount: 1,
    okCount: 1,
    failedCount: 0,
    aggregateHash: "a".repeat(64),
    results: [
      {
        name: "Example | Tool",
        category: "comic-drawing",
        ok: true,
        status: 200,
        title: "Release | notes",
        lastModified: "-",
        contentHash: "b".repeat(64),
        errorCode: "",
        error: "",
      },
    ],
  });
  assert.match(markdown, /studio-competitor-watch/u);
  assert.match(markdown, /Example \\| Tool/u);
  assert.match(markdown, /`bbbbbbbbbbbb`/u);
});
