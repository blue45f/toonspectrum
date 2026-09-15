import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { loadPublicCatalog } = require("./build-og-title-shards.cjs");

function title(id) {
  return { id, slug: id, title: id };
}

test("loads the generated sharded public catalog in manifest order", () => {
  const data = mkdtempSync(path.join(tmpdir(), "catalog-shards-"));
  mkdirSync(path.join(data, "catalog"), { recursive: true });
  writeFileSync(path.join(data, "catalog", "00.json"), JSON.stringify([title("a")]));
  writeFileSync(path.join(data, "catalog", "01.json"), JSON.stringify([title("b")]));
  writeFileSync(path.join(data, "catalog", "manifest.json"), JSON.stringify({
    version: "toonspectrum.catalog-shards.v1",
    count: 2,
    shards: [
      { file: "catalog/00.json", count: 1 },
      { file: "catalog/01.json", count: 1 },
    ],
  }));
  assert.deepEqual(loadPublicCatalog(data).map((item) => item.id), ["a", "b"]);
});

test("rejects missing, traversing and count-mismatched shard manifests", () => {
  const data = mkdtempSync(path.join(tmpdir(), "catalog-shards-invalid-"));
  mkdirSync(path.join(data, "catalog"), { recursive: true });
  writeFileSync(path.join(data, "catalog", "00.json"), JSON.stringify([title("a")]));
  const manifest = path.join(data, "catalog", "manifest.json");
  writeFileSync(manifest, JSON.stringify({ count: 2, shards: [{ file: "catalog/00.json", count: 1 }] }));
  assert.throws(() => loadPublicCatalog(data), /manifest total/u);
  writeFileSync(manifest, JSON.stringify({ count: 1, shards: [{ file: "../outside.json", count: 1 }] }));
  assert.throws(() => loadPublicCatalog(data), /escaped/u);
});
