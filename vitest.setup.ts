import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterAll } from "vitest";
import { APP_I18N_NAMESPACES, STUDIO_I18N_NAMESPACES } from "@/shared/lib/i18n-asset-manifest";
import { registerI18nLocaleEntries, setAppI18nAssetSource } from "@/shared/lib/i18n";
import { parseStudioI18nDictionary, STUDIO_I18N_ASSET_LOCALES } from "@/domains/creator/studio-i18n-loader";
// The reference library registers its ko/en strings synchronously while its lazy route chunk
// evaluates instead of fetching an asset. Evaluate that module here for the same reason as the
// Studio block below: the t() completeness gate and component tests must see the dictionary the
// route actually commits with.
import "@/domains/catalog/references/reference-i18n";

const WEB_PUBLIC = path.resolve(process.cwd(), "apps/web/public");

// Production routes fetch these static assets before their lazy component commits. Direct
// component tests have no HTTP server, so mirror the same validated registration from disk once
// per isolated Vitest graph. Every Studio namespace is published for every locale, so an absent
// file here is a real deployment gap and must throw rather than be skipped.
for (const locale of STUDIO_I18N_ASSET_LOCALES) {
  const merged: Record<string, string> = {};
  for (const namespace of STUDIO_I18N_NAMESPACES) {
    const source = readFileSync(path.join(WEB_PUBLIC, "i18n", "studio", namespace, `${locale}.json`), "utf8");
    const dictionary = parseStudioI18nDictionary(source);
    if (!dictionary) throw new Error(`Invalid Studio test translation asset: ${locale}/${namespace}`);
    Object.assign(merged, dictionary);
  }
  registerI18nLocaleEntries(locale, merged);
}

// App shell dictionaries are lazy assets in production. Serving them from disk on demand — rather
// than eagerly registering all 75 — keeps the same loader, parser and fallback chain under test
// while a test file only pays for the locales it actually awaits.
//
// A namespace with no strings in a locale is not published at all, so an absent file means "this
// namespace contributes nothing here", not "this locale is unavailable". Bailing out on the first
// absent namespace made 67 of the 75 locales resolve to null, which is the same defect the
// production loader carried.
setAppI18nAssetSource(async (assetLocale) => {
  const merged: Record<string, string> = {};
  for (const namespace of APP_I18N_NAMESPACES) {
    const assetPath = path.join(WEB_PUBLIC, "i18n", "app", namespace, `${assetLocale}.json`);
    if (!existsSync(assetPath)) continue;
    Object.assign(merged, JSON.parse(readFileSync(assetPath, "utf8")) as Record<string, string>);
  }
  return Object.keys(merged).length > 0 ? JSON.stringify(merged) : null;
});

// Radix's focus-scope restores focus from a `setTimeout(…, 0)` scheduled while it unmounts, and
// Testing Library's auto-cleanup unmounts synchronously in `afterEach`. Under parallel load a
// worker can tear the jsdom document down before that timer runs; it then dispatches an Event at a
// dead EventTarget, which Vitest reports as an uncaught exception and the run exits non-zero even
// though every test passed. Yield one macrotask at file teardown so the timer lands on a live
// document. File-scoped on purpose — the race is with the environment, not between tests, so this
// costs one tick per file rather than one per test.
//
// The timer is captured here, at setup time, because a test file that installs fake timers and
// never restores them would otherwise leave this hook awaiting a `setTimeout` that never fires —
// which is exactly how the first attempt at this hung StudioCompanionReferenceDisplay for 30s.
const scheduleRealMacrotask = globalThis.setTimeout;

if (typeof document !== "undefined") {
  afterAll(async () => {
    await new Promise((resolve) => { scheduleRealMacrotask(resolve, 0); });
  });
}
