import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, expect } from "vitest";
import { APP_I18N_NAMESPACES, STUDIO_I18N_NAMESPACES } from "@/shared/lib/i18n-asset-manifest";
import { registerI18nLocaleEntries, setAppI18nAssetSource } from "@/shared/lib/i18n";
import { parseStudioI18nDictionary, STUDIO_I18N_ASSET_LOCALES } from "@/domains/creator/studio-i18n-loader";
import "@/domains/catalog/references/reference-i18n";

const WEB_PUBLIC = path.resolve(process.cwd(), "apps/web/public");
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

setAppI18nAssetSource(async (assetLocale) => {
  const merged: Record<string, string> = {};
  for (const namespace of APP_I18N_NAMESPACES) {
    const assetPath = path.join(WEB_PUBLIC, "i18n", "app", namespace, `${assetLocale}.json`);
    // contact/fortune/play ship only for a subset of locales (orphan key surfaces).
    if (!existsSync(assetPath)) continue;
    Object.assign(merged, JSON.parse(readFileSync(assetPath, "utf8")));
  }
  return Object.keys(merged).length > 0 ? JSON.stringify(merged) : null;
});
//
// The timer is captured here, at setup time, because a test file that installs fake timers and
// never restores them would otherwise leave this hook awaiting a `setTimeout` that never fires —
// which is exactly how the first attempt at this hung StudioCompanionReferenceDisplay for 30s.
const scheduleRealMacrotask = globalThis.setTimeout;
const PROJECT_CENTER_TEST_STORAGE_KEYS = Object.freeze([
  "toonspectrum-studio-project-center:favorites:v1",
  "toonspectrum-studio-project-center:recent-actions:v1",
]);

function isStudioMenubarContentTest(testPath: unknown): testPath is string {
  return typeof testPath === "string"
    && testPath.replaceAll("\\", "/").endsWith("/StudioMenubarContent.test.tsx");
}

if (typeof document !== "undefined") {
  beforeEach(() => {
    // Project Center persistence is product behaviour and must remain visible to its own tests.
    // Only the broad Menubar fixture needs isolation because delegated actions in that same file
    // intentionally create recent/favourite proxy buttons with duplicate accessible names.
    if (!isStudioMenubarContentTest(expect.getState().testPath)) return;
    for (const key of PROJECT_CENTER_TEST_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  });

  afterAll(async () => {
    await new Promise((resolve) => { scheduleRealMacrotask(resolve, 0); });
  });
}
