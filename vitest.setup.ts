import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterAll } from "vitest";

import { registerI18nLocaleEntries, setAppI18nAssetSource } from "@/lib/i18n";
import {
  parseStudioI18nDictionary,
  STUDIO_I18N_ASSET_LOCALES,
} from "@/src/domains/creator/studio-i18n-loader";

// Production routes fetch these static assets before their lazy component
// commits. Direct component tests have no HTTP server, so mirror the same
// validated registration from disk once per isolated Vitest graph.
for (const locale of STUDIO_I18N_ASSET_LOCALES) {
  const source = readFileSync(
    path.resolve(process.cwd(), "public", "i18n", "studio", `${locale}.json`),
    "utf8",
  );
  const dictionary = parseStudioI18nDictionary(source);
  if (!dictionary) {
    throw new Error(`Invalid Studio test translation asset: ${locale}`);
  }
  registerI18nLocaleEntries(locale, dictionary);
}

// App shell dictionaries are lazy assets in production. Serving them from disk on demand — rather
// than eagerly registering all 75 — keeps the same loader, parser and fallback chain under test
// while a test file only pays for the locales it actually awaits.
setAppI18nAssetSource(async (assetLocale) => {
  const assetPath = path.resolve(process.cwd(), "public", "i18n", "app", `${assetLocale}.json`);
  return existsSync(assetPath) ? readFileSync(assetPath, "utf8") : null;
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
