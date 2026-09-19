import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { readBrowserPreference, writeBrowserPreference } from "../apps/web/src/shared/lib/browser-preferences.ts";
import { createNavigationMemory } from "../apps/web/src/shared/lib/navigation-memory.ts";
import { safeDecodeRouteText } from "../apps/web/src/shared/lib/safe-route-text.ts";
import { MAX_LIBRARY_BACKUP_BYTES, parseLibraryBackup } from "../apps/web/src/shared/lib/library-backup.ts";
import { EXPERIENCE_DESTINATIONS, experienceDestinationForHref, nextExperienceDestinations, parseExperienceMode, supportsSiteExperience } from "../apps/web/src/shared/components/site-experience/site-experience-model.ts";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const backup = () => ({ _app: "toonspectrum-library", version: 1, ratings: { a: 4.5 }, reads: { a: "reading" }, subscriptions: { a: true }, likedReviews: { r: false }, reviews: { a: { titleId: "a", rating: 4.5, text: "좋은 작품", tags: ["추천"], spoiler: false, createdAt: "2026-09-13T00:00:00Z" } }, collections: [{ id: "collection-1", name: "즐겨찾기", emoji: "📚", titleIds: ["a"], createdAt: "2026-09-13T00:00:00Z" }] });

test("blocked storage getters and methods never break navigation", () => {
  const blocked = () => { throw new Error("SecurityError"); };
  assert.equal(readBrowserPreference(blocked, "key"), null);
  assert.equal(writeBrowserPreference(blocked, "key", "calm"), false);
  assert.equal(readBrowserPreference(() => ({ getItem: blocked, setItem: blocked }), "key"), null);
  assert.equal(writeBrowserPreference(() => ({ getItem: blocked, setItem: blocked }), "key", "calm"), false);
  assert.equal(writeBrowserPreference(() => undefined, "key", "calm"), false);
});
test("available storage and strict mode parsing retain only known preferences", () => {
  const store = new Map();
  const resolve = () => ({ getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) });
  assert.equal(writeBrowserPreference(resolve, "mode", "calm"), true);
  assert.equal(parseExperienceMode(readBrowserPreference(resolve, "mode")), "calm");
  for (const value of [null, "", "vivid", "<script>", "false"]) assert.equal(parseExperienceMode(value), "vivid");
});
test("all editor aliases and administrative routes are excluded, including trailing slashes/case", () => {
  for (const path of ["/studio", "/studio/", "/studio/new", "/studio/work/123", "/Studio/canvas", "/shaper", "/brush-lab", "/music", "/admin/members"]) {
    assert.equal(supportsSiteExperience(path), false, path);
    assert.deepEqual(nextExperienceDestinations(path), [], path);
  }
  assert.equal(supportsSiteExperience("/studios"), true);
});
test("do not interrupt private, transactional, policy or immersive viewing flows", () => {
  for (const path of ["/my", "/me/settings", "/settings", "/auth/callback", "/market/publish", "/market/manage/one", "/market/checkout", "/market/library", "/market/wishlist", "/create/promo", "/create/work-42", "/showcase/work/42", "/terms", "/privacy", "/fortune", "/play"]) assert.deepEqual(nextExperienceDestinations(path), [], path);
});
test("public destinations are contextual, unique, registered and never self-links", () => {
  for (const route of ["/", "/discover", "/calendar", "/search", "/research", "/research/assets", "/market", "/learn/recipes", "/showcase", "/community", "/library", "/about", "/support"]) {
    const next = nextExperienceDestinations(route);
    assert.equal(next.length, 3, route);
    assert.equal(new Set(next).size, 3, route);
    for (const id of next) {
      assert.ok(EXPERIENCE_DESTINATIONS[id]);
      assert.notEqual(EXPERIENCE_DESTINATIONS[id].href, route);
      assert.ok(EXPERIENCE_DESTINATIONS[id].ko[0]);
      assert.ok(EXPERIENCE_DESTINATIONS[id].en[0]);
    }
  }
  assert.deepEqual(nextExperienceDestinations("/unknown"), []);
  assert.deepEqual(nextExperienceDestinations("/CALENDAR/"), nextExperienceDestinations("/calendar"));
});
test("destination lookup rejects arbitrary external, encoded, account and query targets", () => {
  for (const href of ["https://example.com", "//example.com", "javascript:alert(1)", "/discover?token=secret", "/studio", "/me", "/discover%2f"]) assert.equal(experienceDestinationForHref(href), undefined);
  assert.equal(experienceDestinationForHref("/learn")?.icon, "learn");
});
test("history positions are bounded, copied and normalized", () => {
  const memory = createNavigationMemory(2);
  memory.set("a", { x: 0, y: 600 });
  const retrieved = memory.get("a");
  retrieved.y = 900;
  assert.equal(memory.get("a").y, 600);
  memory.set("b", { x: -2, y: Infinity });
  assert.deepEqual(memory.get("b"), { x: 0, y: 0 });
  memory.set("c", { x: 0, y: 70 });
  assert.equal(memory.get("a"), undefined);
  assert.equal(memory.size, 2);
  const tiny = createNavigationMemory(0);
  tiny.set("a", { x: 0, y: 1 }); tiny.set("b", { x: 0, y: 2 });
  assert.equal(tiny.size, 1);
});
test("valid Korean route segments decode while malformed escapes stay safe", () => {
  assert.equal(safeDecodeRouteText("%ED%95%9C%EA%B8%80"), "한글");
  for (const input of ["%", "%E0%A4%A", "%ZZ", "a%2", "already 한글"]) assert.equal(safeDecodeRouteText(input), input);
});
test("valid current backups round-trip all public library fields without identity data", () => {
  const data = backup();
  const result = parseLibraryBackup(JSON.stringify({ ...data, userId: "do-not-import", sessionToken: "do-not-import", adultVerified: true }));
  for (const key of ["ratings", "reads", "subscriptions", "likedReviews", "reviews", "collections"]) assert.deepEqual(result[key], data[key]);
  assert.equal("sessionToken" in result, false);
  assert.equal("adultVerified" in result, false);
});
test("unknown formats, versions and incomplete JSON cannot replace an existing library", () => {
  for (const data of [null, [], {}, { ratings: {} }, { ...backup(), _app: "another-app" }, { ...backup(), version: 2 }, { ...backup(), reads: null }]) assert.throws(() => parseLibraryBackup(JSON.stringify(data)));
  assert.throws(() => parseLibraryBackup("{not-json"));
});
test("corrupt nested records are rejected atomically", () => {
  for (const change of [{ ratings: { a: 99 } }, { reads: { a: "unknown" } }, { subscriptions: { a: "yes" } }, { reviews: { a: { ...backup().reviews.a, titleId: "b" } } }, { collections: [{ ...backup().collections[0], createdAt: "invalid" }] }, { collections: [backup().collections[0], backup().collections[0]] }]) assert.throws(() => parseLibraryBackup(JSON.stringify({ ...backup(), ...change })));
});
test("prototype keys and oversized backups are rejected", () => {
  const source = JSON.stringify(backup()).replace('"ratings":{"a":4.5}', '"ratings":{"__proto__":4.5}');
  assert.throws(() => parseLibraryBackup(source));
  assert.throws(() => parseLibraryBackup(" ".repeat(MAX_LIBRARY_BACKUP_BYTES + 1)));
});
test("visual effects have bounded animation, reduced-motion and forced-colour alternatives", () => {
  const css = readFileSync(new URL("../apps/web/src/shared/components/site-experience/site-experience.css", import.meta.url), "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /data-site-experience="calm"/);
  assert.doesNotMatch(css, /(?:^|\n)(?:html|body|:root)\s*\{/);
});
