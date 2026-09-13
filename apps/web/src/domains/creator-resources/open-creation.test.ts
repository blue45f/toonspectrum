import assert from "node:assert/strict";
import { test } from "vitest";

import {
  BOARD_LIMIT, BOARD_PREFIX, CACHE_TTL, KIT_FORMATS, buildCreationKit,
  fromExistingResource, openSearchQuery, openSearchUrl, parseOpenReferences,
  parseSavedOpenReference, readOpenBoard, readOpenCache, safeOpenUrl,
  saveOpenReference, writeOpenCache,
} from "./open-creation";
import type { KeyValueStorage, OpenReference } from "./open-creation";

const NOW = "2026-09-13T08:00:00.000Z";
class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const artwork: OpenReference = {
  id: "artic:1", provider: "artic", title: "Reference object", creator: "Artist", date: "1900",
  sourceUrl: "https://www.artic.edu/artworks/1", imageUrl: "https://www.artic.edu/iiif/2/test/full/400,/0/default.jpg",
  rights: "CC0", credit: "Museum credit", fetchedAt: NOW,
};

test("Korean single-character topics are supported and dictionary mappings are transparent", () => {
  assert.equal(openSearchQuery("artic", "꽃"), "flowers");
  assert.equal(openSearchQuery("cleveland", "한복 가구"), "Korean clothing furniture");
  assert.equal(openSearchQuery("wikipedia", "한복 가구"), "한복 가구");
  assert.equal(openSearchQuery("artic", "미등록단어"), "미등록단어");
});
test("empty/overlong queries and excessive pagination fail before requests", () => {
  assert.throws(() => openSearchUrl("artic", "  "));
  assert.throws(() => openSearchUrl("artic", "a".repeat(81)));
  for (const page of [0, -1, 1.5, 11, Infinity]) assert.throws(() => openSearchUrl("artic", "armor", page));
});
test("requests target fixed HTTPS APIs and request public-domain filtering", () => {
  const aic = new URL(openSearchUrl("artic", "갑옷", 2));
  assert.equal(aic.origin, "https://api.artic.edu");
  assert.equal(aic.searchParams.get("q"), "armor");
  assert.equal(aic.searchParams.get("query[term][is_public_domain]"), "true");
  assert.equal(aic.searchParams.get("page"), "2");
  assert.ok(!aic.searchParams.get("fields")?.split(",").includes("description"));
  const cma = new URL(openSearchUrl("cleveland", "Korea", 3));
  assert.equal(cma.searchParams.get("skip"), "36");
  assert.equal(cma.searchParams.get("cc0"), "1");
  const wiki = new URL(openSearchUrl("wikipedia", "한복"));
  assert.equal(wiki.searchParams.get("origin"), "*");
  assert.equal(wiki.searchParams.get("srprop"), "timestamp");
});
test("unsafe URLs, credentials, deceptive hosts and non-HTTPS sources are rejected", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,bad", "http://www.artic.edu", "https://user:pass@www.artic.edu", "https://127.0.0.1", "https://localhost", "https://www.artic.edu:444/"]) assert.equal(safeOpenUrl(url), "");
  assert.equal(safeOpenUrl("https://www.artic.edu.evil.example/", ["www.artic.edu"]), "");
  assert.equal(safeOpenUrl("https://www.artic.edu/artworks/1", ["www.artic.edu"]), artwork.sourceUrl);
});
test("AIC non-public and malformed artwork records fail closed", () => {
  const parsed = parseOpenReferences("artic", { config: { iiif_url: "https://www.artic.edu/iiif/2" }, data: [
    { id: 1, title: "Open", is_public_domain: true, image_id: "abc-123" },
    { id: 2, title: "Restricted", is_public_domain: false },
    { id: 3, title: "Unknown" }, { id: 4, title: "String true", is_public_domain: "true" },
    { id: -1, title: "Bad id", is_public_domain: true },
  ] }, NOW);
  assert.equal(parsed.length, 1); assert.equal(parsed[0].rights, "CC0");
  assert.ok(parsed[0].imageUrl.endsWith("/full/400,/0/default.jpg"));
});
test("AIC ignores an untrusted IIIF host but preserves a valid source link", () => {
  const [item] = parseOpenReferences("artic", { config: { iiif_url: "https://evil.example" }, data: [{ id: 1, title: "Open", is_public_domain: true, image_id: "abc" }] }, NOW);
  assert.equal(item.imageUrl, ""); assert.equal(item.sourceUrl, artwork.sourceUrl);
});
test("Cleveland requires explicit image CC0, not merely CC0 metadata", () => {
  const parsed = parseOpenReferences("cleveland", { data: [
    { id: 1, title: "Open", share_license_status: "CC0", url: "https://www.clevelandart.org/art/1", images: { web: { url: "https://openaccess-cdn.clevelandart.org/1.jpg" } } },
    { id: 2, title: "Closed", share_license_status: "Copyrighted", url: "https://www.clevelandart.org/art/2" },
    { id: 3, title: "Unknown", url: "https://www.clevelandart.org/art/3" },
    { id: 4, title: "Untrusted source", share_license_status: "CC0", url: "https://evil.example" },
  ] }, NOW);
  assert.equal(parsed.length, 1); assert.equal(parsed[0].rights, "CC0");
});
test("Wikipedia emits title/link metadata, never snippets or implied image permissions", () => {
  const [item] = parseOpenReferences("wikipedia", { query: { search: [{ pageid: 10, title: "한복", snippet: "Do not redistribute me", timestamp: NOW }] } }, NOW);
  assert.equal(item.rights, "원문 확인"); assert.equal(item.imageUrl, "");
  assert.ok(!JSON.stringify(item).includes("Do not redistribute"));
});
test("provider errors or unexpected response schemas are not empty success", () => {
  assert.throws(() => parseOpenReferences("wikipedia", { error: { code: "ratelimited" } }));
  assert.throws(() => parseOpenReferences("cleveland", { data: "bad" }));
  assert.throws(() => parseOpenReferences("artic", null));
});
test("duplicate records are deduplicated and text markup is stripped", () => {
  const item = { id: 1, title: "<b>Armor</b>", is_public_domain: true };
  const parsed = parseOpenReferences("artic", { data: [item, item] }, NOW);
  assert.equal(parsed.length, 1); assert.equal(parsed[0].title, "Armor");
});
test("existing resources are copied conservatively without promoting book image rights", () => {
  const book = fromExistingResource({ id: "kakao:123", provider: "kakao", title: "Book", sourceUrl: "https://search.daum.net/", imageUrl: "https://example.com/book.jpg", license: "CC0", fetchedAt: NOW });
  assert.ok(book); assert.equal(book.rights, "원문 확인"); assert.equal(book.imageUrl, "");
  assert.equal(fromExistingResource({ id: "bad", title: "Bad", sourceUrl: "javascript:alert(1)", fetchedAt: NOW }), null);
});
test("stored references validate IDs, dates, provider consistency and image hosts", () => {
  assert.equal(parseSavedOpenReference({ ...artwork, id: "wikipedia:1" }), null);
  assert.equal(parseSavedOpenReference({ ...artwork, fetchedAt: "not-a-date" }), null);
  assert.equal(parseSavedOpenReference({ ...artwork, imageUrl: "https://evil.example/a.jpg" })?.imageUrl, "");
  const wiki = parseSavedOpenReference({ ...artwork, id: "wikipedia:1", provider: "wikipedia" });
  assert.equal(wiki?.rights, "원문 확인"); assert.equal(wiki?.imageUrl, "");
});
test("per-item board writes preserve existing workspace data and other tabs' additions", () => {
  const storage = new MemoryStorage(); storage.setItem("existing-workspace", "keep");
  saveOpenReference(storage, artwork); saveOpenReference(storage, { ...artwork, id: "artic:2" });
  assert.equal(readOpenBoard(storage).length, 2); assert.equal(storage.getItem("existing-workspace"), "keep");
  saveOpenReference(storage, artwork, true); assert.equal(readOpenBoard(storage)[0].id, "artic:2");
});
test("corrupt board data blocks writes without destroying the original", () => {
  const storage = new MemoryStorage(); storage.setItem(`${BOARD_PREFIX}artic:1`, "{bad json");
  assert.throws(() => saveOpenReference(storage, artwork));
  assert.equal(storage.getItem(`${BOARD_PREFIX}artic:1`), "{bad json");
});
test("board capacity is bounded and existing items can still be removed", () => {
  const storage = new MemoryStorage();
  for (let i = 1; i <= BOARD_LIMIT; i += 1) saveOpenReference(storage, { ...artwork, id: `artic:${i}` });
  assert.throws(() => saveOpenReference(storage, { ...artwork, id: "artic:999" }));
  assert.equal(saveOpenReference(storage, artwork, true).length, BOARD_LIMIT - 1);
});
test("quota failure does not claim a successful board write", () => {
  class FullStorage extends MemoryStorage { setItem() { throw new Error("QuotaExceededError"); } }
  assert.throws(() => saveOpenReference(new FullStorage(), artwork), /QuotaExceededError/u);
});
test("search cache expires after 24 hours while preserving stale fallback metadata", () => {
  const storage = new MemoryStorage(); writeOpenCache(storage, "artic:armor:1", [artwork], 1000);
  assert.equal(readOpenCache(storage, "artic:armor:1", 1001)?.stale, false);
  assert.equal(readOpenCache(storage, "artic:armor:1", 1000 + CACHE_TTL)?.stale, true);
  assert.equal(readOpenCache(storage, "artic:armor:1", 999), null);
});
test("cache evicts older keys and ignores storage failure", () => {
  const storage = new MemoryStorage();
  for (let i = 0; i < 20; i += 1) writeOpenCache(storage, `key:${i}`, [artwork], i);
  assert.equal(readOpenCache(storage, "key:0", 100), null);
  assert.equal(readOpenCache(storage, "key:19", 100)?.items.length, 1);
  class FullStorage extends MemoryStorage { setItem() { throw new Error("quota"); } }
  assert.doesNotThrow(() => writeOpenCache(new FullStorage(), "key", [artwork]));
});
test("all six local kit formats carry provenance and disclose their limitations", () => {
  for (const format of KIT_FORMATS) {
    const kit = buildCreationKit(format.id, "소품의 비밀", "긴장감 있게", [artwork]);
    assert.ok(kit.includes(format.title)); assert.ok(kit.includes(artwork.sourceUrl));
    assert.ok(kit.includes(artwork.credit)); assert.ok(kit.includes(NOW));
    assert.ok(kit.includes("로컬 규칙 기반")); assert.ok(kit.includes("제3자 권리"));
  }
});
test("kit escaping prevents reference titles from injecting Markdown links", () => {
  const kit = buildCreationKit("comic", "[bad](javascript:alert(1))", "<script>alert(1)</script>", [{ ...artwork, title: "[link](bad)" }]);
  assert.ok(!kit.includes("[bad]")); assert.ok(!kit.includes("<script>"));
  assert.ok(kit.includes("\\[link\\]"));
});


test("malformed and nested markup never leaves HTML delimiters in metadata", () => {
  for (const value of ["<scr<script>ipt>alert(1)</script>", "<img src=x onerror=alert(1)", "text > tail", "<<b>Armor</b>>"]) {
    const [item] = parseOpenReferences("artic", { data: [{ id: 1, title: "Safe title", artist_display: value, credit_line: value, is_public_domain: true }] }, NOW);
    assert.ok(!/[<>]/u.test(item.creator));
    assert.ok(!/[<>]/u.test(item.credit));
    const saved = parseSavedOpenReference({ ...artwork, creator: value, credit: value });
    assert.ok(saved);
    assert.ok(!/[<>]/u.test(saved.creator));
    assert.ok(!/[<>]/u.test(saved.credit));
    assert.ok(!buildCreationKit("comic", value, value, [artwork]).includes("<script"));
  }
});
test("dictionary lookup does not translate inherited object properties", () => {
  for (const word of ["constructor", "toString", "__proto__"]) {
    assert.equal(openSearchQuery("artic", word), word);
  }
});
