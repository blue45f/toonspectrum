import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { synchronizeLegacyI18nAssets } from "./sync-i18n-legacy-assets.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("recovers stranded translations, preserves newer namespace copy, and reports honest fallback coverage", () => {
  const root = mkdtempSync(join(tmpdir(), "i18n-legacy-contract-"));
  const write = (relative, value) => {
    const filename = join(root, relative);
    mkdirSync(join(filename, ".."), { recursive: true });
    writeFileSync(filename, JSON.stringify(value, null, 2) + "\n");
  };
  const read = (relative) => JSON.parse(readFileSync(join(root, relative), "utf8"));
  try {
    for (const locale of ["en", "ko", "ja"]) {
      write(`app/${locale}.json`, { "route.search": locale + " search", "route.home": "old" });
      write(`app/route/${locale}.json`, { "route.home": locale + " home", ...(locale === "en" ? { "route.share": "Share" } : {}) });
      write(`admin/${locale}.json`, { "admin.title": "old admin" });
      write(`admin/admin/${locale}.json`, { "admin.title": locale + " admin" });
    }
    const stale = synchronizeLegacyI18nAssets(root, { check: true });
    assert.ok(stale.length > 0);
    assert.equal(read("app/en.json")["route.home"], "old", "check mode must not write");
    synchronizeLegacyI18nAssets(root);
    assert.equal(read("app/route/ja.json")["route.search"], "ja search");
    assert.equal(read("app/ja.json")["route.home"], "ja home");
    assert.equal(read("app/ja.json")["route.share"], "Share", "English fallback must not masquerade as translated copy");
    assert.equal(read("admin/ja.json")["admin.title"], "ja admin");
    assert.deepEqual(synchronizeLegacyI18nAssets(root, { check: true }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
