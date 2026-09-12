import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import {
  parseSearchPageQuery, searchPageItems, searchPagination, searchPageQueryFromParams, searchParamsFromBody,
} from "../packages/core/src/search-pagination.ts";
import { serverlessRouteGroup } from "../apps/api/src/runtime/serverless-route-group.ts";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const require = createRequire(import.meta.url);
const { buildOgTitleShards } = require("./build-og-title-shards.cjs");
const { titleBucket, createTitleMetadataReader } = require("../apps/api/og-title-files.cjs");

test("search defaults, explicit pages, upper bounds and empty saved collection", () => {
  assert.deepEqual(parseSearchPageQuery({}), { page: 1, pageSize: 24 });
  const options = parseSearchPageQuery({ page: "2", pageSize: "80", ids: "one,one,two" });
  assert.deepEqual([...options.ids], ["one", "two"]);
  assert.equal(parseSearchPageQuery({ ids: "" }).ids.size, 0);
  assert.deepEqual(searchPageItems(Array.from({ length: 200 }, (_, i) => i), options), Array.from({ length: 80 }, (_, i) => i + 80));
  assert.deepEqual(searchPagination(200, options), { page: 2, pageSize: 80, total: 200, hasMore: true, nextPage: 3 });
  assert.equal(searchPagination(160, options).hasMore, false);
});

for (const value of ["", "0", "-1", "1.5", "1e2", "NaN", "Infinity", "81", [], {}, ["1", "2"], "1\n"]) {
  test(`reject invalid pageSize ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseSearchPageQuery({ pageSize: value }));
  });
}

test("reject repeated URL fields, oversized IDs and excessive page numbers", () => {
  for (const name of ["page", "pageSize", "ids"]) {
    const query = searchPageQueryFromParams(new URLSearchParams(`${name}=1&${name}=2`));
    assert.throws(() => parseSearchPageQuery(query));
  }
  assert.throws(() => parseSearchPageQuery({ page: 1_000_001 }));
  assert.throws(() => parseSearchPageQuery({ ids: "x".repeat(129) }));
  assert.throws(() => parseSearchPageQuery({ ids: Array(1001).fill("x").join(",") }));
});

test("all pages are bounded and concatenate without loss or duplicates", () => {
  for (const total of [0, 1, 23, 24, 25, 80, 81, 193, 1001]) {
    const values = Array.from({ length: total }, (_, id) => ({ id }));
    for (const pageSize of [1, 24, 80]) {
      let page = 1;
      const collected = [];
      do {
        const options = parseSearchPageQuery({ page, pageSize });
        const items = searchPageItems(values, options);
        assert.ok(items.length <= pageSize);
        collected.push(...items);
        page = searchPagination(total, options).nextPage;
      } while (page !== null);
      assert.deepEqual(collected, values);
    }
  }
});

for (const prefix of ["creator", "creator-resources", "studio-ai", "studio-music", "studio-realtime"]) {
  test(`route group covers ${prefix} without prefix lookalikes`, () => {
    assert.equal(serverlessRouteGroup(`/api/${prefix}`), "studio");
    assert.equal(serverlessRouteGroup(`/api/${prefix}/example`), "studio");
    assert.equal(serverlessRouteGroup(`/api/${prefix}-unknown`), "general");
  });
}

test("auth partition, rollback and unknown routes preserve default full API", () => {
  assert.equal(serverlessRouteGroup("/API/AUTH/session"), "auth");
  for (const route of ["/api/me", "/api/authentication", "/api/home", "/api/search", "/socket.io"]) {
    assert.equal(serverlessRouteGroup(route), "general");
  }
  assert.equal(serverlessRouteGroup("/api/auth/session", false), "full");
  assert.equal(serverlessRouteGroup(), "full");
});

test("OG metadata uses sharded files, supports id/slug and excludes private/full records", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "og-followup-"));
  try {
    const source = Array.from({ length: 200 }, (_, i) => ({
      id: `id-${i}`, slug: `작품-${i}`, title: `Title ${i}`, synopsis: "story".repeat(150),
      author: "Author", genres: ["fantasy"], availability: [{ url: "private-unused" }],
      secret: "must-not-copy", stats: { ratingAvg: 4, ratingCount: 50, views: 900 },
    }));
    const output = buildOgTitleShards(source, directory);
    assert.equal(output.titles, 200);
    assert.ok(output.shards <= 256);
    let reads = 0;
    const read = createTitleMetadataReader(directory, (...args) => { reads++; return readFileSync(...args); });
    for (const row of source) {
      assert.equal(read(row.slug).title, row.title);
      assert.equal(read(row.id).title, row.title);
    }
    const item = read("id-0");
    assert.equal(item.synopsis.length, 500);
    assert.equal(item.secret, undefined);
    assert.equal(item.availability, undefined);
    assert.equal(item.stats.views, undefined);
    const count = reads;
    assert.equal(read("id-0").title, "Title 0");
    assert.equal(reads, count);
    assert.equal(read("../../etc/passwd"), null);
    assert.equal(read("toString"), null);
    assert.equal(read("x".repeat(513)), null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("OG misses recover, old buckets are removed and cache capacity is bounded", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "og-followup-"));
  try {
    const read = createTitleMetadataReader(directory);
    assert.equal(read("later"), null);
    buildOgTitleShards([{ id: "later", slug: "later", title: "Arrived" }], directory);
    assert.equal(read("later").title, "Arrived");
    writeFileSync(path.join(directory, "zz.keep"), "keep");
    buildOgTitleShards([], directory);
    assert.equal(createTitleMetadataReader(directory)("later"), null);
    assert.equal(readFileSync(path.join(directory, "zz.keep"), "utf8"), "keep");
    const buckets = new Set();
    const identifiers = [];
    for (let i = 0; identifiers.length < 3; i++) {
      const id = `candidate-${i}`;
      if (!buckets.has(titleBucket(id))) { identifiers.push(id); buckets.add(titleBucket(id)); }
    }
    let reads = 0;
    const limited = createTitleMetadataReader(directory, () => { reads++; return "{}"; }, 2);
    identifiers.forEach(limited);
    limited(identifiers[0]);
    assert.equal(reads, 4);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("OG handler renders local metadata without HTTP and rechecks mutable releases", async () => {
  const { createOgHandler } = require("../api/og.js");
  const id = "123e4567-e89b-42d3-a456-426614174000";
  let visible = true;
  let reads = 0;
  const handler = createOgHandler({
    readTitle: () => ({ title: "Test <story>", author: "Author", stats: { ratingAvg: 4, ratingCount: 5 } }),
    readMarketResource: () => { reads++; if (!visible) throw new Error("hidden"); return { id, name: "Visible release", kind: "brush", publisher: { name: "Author" } }; },
  });
  const response = () => ({ headers: {}, html: "", setHeader(k, v) { this.headers[k] = v; }, status() { return this; }, send(html) { this.html = html; } });
  const title = response();
  await handler({ query: { slug: "story" }, headers: { "user-agent": "Googlebot", host: "bad.invalid" } }, title);
  assert.ok(title.html.includes("Test &lt;story&gt;"));
  assert.ok(!title.html.includes("bad.invalid"));
  const req = { query: { marketResourceId: id }, headers: { "user-agent": "Twitterbot" } };
  const first = response(); await handler(req, first); assert.ok(first.html.includes("Visible release"));
  visible = false;
  const second = response(); await handler(req, second);
  assert.ok(!second.html.includes("Visible release")); assert.equal(second.headers["Cache-Control"], "no-store"); assert.equal(reads, 2);
  assert.ok(!readFileSync(path.join(process.cwd(), "api/og.js"), "utf8").includes("await fetch("));
});


test("saved search bodies reject invalid shapes and preserve empty filters", () => {
  assert.equal(searchParamsFromBody({ ids: "", page: "1", pageSize: "24" }).get("ids"), "");
  for (const invalid of [null, [], "q=x", { ids: ["one"] }, { unknown: "x" }, { pageSize: "81" }]) {
    assert.throws(() => searchParamsFromBody(invalid));
  }
  assert.throws(() => searchPageQueryFromParams(new URLSearchParams("q=one&q=two")));
});
