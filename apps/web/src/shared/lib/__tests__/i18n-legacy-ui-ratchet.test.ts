import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const WEB_SRC = path.resolve(process.cwd(), "apps/web/src");
const LEGACY_LOCALE_ALIAS = /type\s+Locale\s*=\s*["']ko["']\s*\|\s*["']en["']/gu;
const LEGACY_INLINE_COPY_TERNARY = /\blocale\s*===\s*["']ko["'](?:\s*\|\|\s*locale\s*===\s*["']en["'])?\s*\?/gu;
const FUNCTIONAL_LOCALE_BRANCH_FILES = new Set([
  "domains/creator/vrm/studio-vrm-display-name.ts",
  "shared/lib/i18n-bilingual-copy.ts",
]);

type Finding = Readonly<{ file: string; pattern: string }>;

function collectLegacyBilingualUi(directory: string, findings: Finding[] = []): Finding[] {
  for (const name of readdirSync(directory)) {
    if (name === "__tests__") continue;
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) {
      collectLegacyBilingualUi(full, findings);
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/u.test(name) || /\.test\.[jt]sx?$/u.test(name)) continue;
    const source = readFileSync(full, "utf8");
    if (LEGACY_LOCALE_ALIAS.test(source)) {
      findings.push({ file: path.relative(WEB_SRC, full), pattern: "ko/en Locale alias" });
    }
    const relative = path.relative(WEB_SRC, full);
    if (
      LEGACY_INLINE_COPY_TERNARY.test(source)
      && !FUNCTIONAL_LOCALE_BRANCH_FILES.has(relative)
    ) {
      findings.push({ file: relative, pattern: "locale === ko copy ternary" });
    }
    LEGACY_LOCALE_ALIAS.lastIndex = 0;
    LEGACY_INLINE_COPY_TERNARY.lastIndex = 0;
  }
  return findings;
}

describe("legacy bilingual UI migration ratchet", () => {
  it("keeps ko/en-only UI aliases and inline copy ternaries at zero", () => {
    const findings = collectLegacyBilingualUi(WEB_SRC).sort((a, b) => a.file.localeCompare(b.file));
    expect(
      findings,
      `legacy bilingual UI regressed:\n${findings.map((item) => `${item.file}: ${item.pattern}`).join("\n")}`,
    ).toEqual([]);
  });
});
