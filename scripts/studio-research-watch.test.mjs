import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  STUDIO_RESEARCH_REGISTRY_PATH,
  buildResearchFingerprint,
  mergeResearchEntries,
  parseArxivAtomFeed,
  renderStudioResearchWatchMarkdown,
  validateStudioResearchRegistry,
} from "./studio-research-watch.mjs";

test("committed research registry is valid and covers broad implementation targets", () => {
  const registry = JSON.parse(fs.readFileSync(STUDIO_RESEARCH_REGISTRY_PATH, "utf8"));
  assert.deepEqual(validateStudioResearchRegistry(registry), []);
  assert.ok(registry.papers.length >= 10);
  assert.ok(registry.queries.length >= 5);
  assert.ok(registry.papers.some((paper) => paper.focus.includes("watercolor")));
  assert.ok(registry.papers.some((paper) => paper.focus.includes("differentiable-vector")));
});

test("parses arXiv Atom entries and preserves query targets", () => {
  const xml = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>https://arxiv.org/abs/2609.01234v2</id>
        <updated>2026-09-02T11:00:00Z</updated>
        <published>2026-09-01T09:00:00Z</published>
        <title>  A Better   Digital Brush </title>
        <summary>Progressive mixing &amp; stable replay.</summary>
        <author><name>Alice Example</name></author>
        <author><name>Bob Example</name></author>
        <category term="cs.GR" scheme="http://arxiv.org/schemas/atom" />
      </entry>
    </feed>`;
  const entries = parseArxivAtomFeed(xml, {
    id: "digital-painting",
    focus: ["brush-engine", "natural-media"],
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "2609.01234");
  assert.equal(entries[0].title, "A Better Digital Brush");
  assert.deepEqual(entries[0].authors, ["Alice Example", "Bob Example"]);
  assert.deepEqual(entries[0].categories, ["cs.GR"]);
  assert.deepEqual(entries[0].focus, ["brush-engine", "natural-media"]);
});

test("deduplicates a paper found by multiple research queries", () => {
  const base = {
    id: "2609.00001",
    url: "https://arxiv.org/abs/2609.00001",
    title: "Shared paper",
    summary: "",
    published: "2026-09-01T00:00:00Z",
    authors: [],
    categories: ["cs.GR"],
  };
  const entries = mergeResearchEntries([
    {
      entries: [
        { ...base, updated: "2026-09-01T00:00:00Z", queryId: "paint", focus: ["brush-engine"] },
      ],
    },
    {
      entries: [
        { ...base, updated: "2026-09-02T00:00:00Z", queryId: "vector", focus: ["vector-engine"] },
      ],
    },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].updated, "2026-09-02T00:00:00Z");
  assert.deepEqual(entries[0].queryIds, ["paint", "vector"]);
  assert.deepEqual(entries[0].focus, ["brush-engine", "vector-engine"]);
});

test("research fingerprint is deterministic for equivalent data", () => {
  const seed = { aggregateHash: "a".repeat(64) };
  const entries = [
    { id: "1", updated: "2026-09-02", title: "One", focus: ["brush"] },
  ];
  const queries = [{ id: "q", ok: true, status: 200 }];
  assert.equal(
    buildResearchFingerprint(seed, entries, queries),
    buildResearchFingerprint(seed, entries, queries),
  );
});

test("renders a stable issue marker and implementation-oriented table", () => {
  const markdown = renderStudioResearchWatchMarkdown({
    generatedAt: "2026-09-02T00:00:00Z",
    seedReport: { okCount: 1, selectedCount: 1 },
    queryReports: [{ id: "q", ok: true, status: 200 }],
    discoveredCount: 1,
    aggregateHash: "c".repeat(64),
    entries: [
      {
        updated: "2026-09-02T00:00:00Z",
        published: "2026-09-01T00:00:00Z",
        title: "Paper",
        categories: ["cs.GR"],
        focus: ["vector-engine"],
      },
    ],
  });
  assert.match(markdown, /<!-- studio-research-watch -->/u);
  assert.match(markdown, /Capability targets/u);
  assert.match(markdown, /vector-engine/u);
});
