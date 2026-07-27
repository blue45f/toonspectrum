import { readFileSync } from "node:fs";
import path from "node:path";

import { registerI18nLocaleEntries } from "@/lib/i18n";
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
