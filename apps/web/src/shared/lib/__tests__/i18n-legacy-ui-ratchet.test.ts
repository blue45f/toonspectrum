import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const WEB_SRC = path.resolve(process.cwd(), "apps/web/src");
const LEGACY_LOCALE_ALIAS = /type\s+Locale\s*=\s*["']ko["']\s*\|\s*["']en["']/gu;
const MAX_REMAINING_LEGACY_LOCALE_ALIASES = 35;

function collectLegacyLocaleAliases(directory: string, findings: string[] = []): string[] {
  for (const name of readdirSync(directory)) {
    if (name === "__tests__") continue;
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) {
      collectLegacyLocaleAliases(full, findings);
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/u.test(name) || /\.test\.[jt]sx?$/u.test(name)) continue;
    const source = readFileSync(full, "utf8");
    if (LEGACY_LOCALE_ALIAS.test(source)) {
      findings.push(path.relative(WEB_SRC, full));
    }
    LEGACY_LOCALE_ALIAS.lastIndex = 0;
  }
  return findings;
}

describe("legacy bilingual UI migration ratchet", () => {
  it("never increases the remaining ko/en-only Locale aliases", () => {
    const findings = collectLegacyLocaleAliases(WEB_SRC).sort();
    expect(
      findings.length,
      `ko/en-only UI aliases regressed (${findings.length}):\n${findings.join("\n")}`,
    ).toBeLessThanOrEqual(MAX_REMAINING_LEGACY_LOCALE_ALIASES);
  });
});
