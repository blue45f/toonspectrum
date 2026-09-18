import { describe, expect, it } from "vitest";

import {
  formatMissingTranslationKey,
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
  resolveTranslation,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n-core";
import {
  getRuntimeTranslationPendingKeys,
  protectRuntimeTranslationPlaceholders,
} from "@/shared/lib/i18n-runtime-translation";

describe("sitewide i18n integrity", () => {
  it("keeps raw missing keys available to diagnostics but never returns them to UI translators", () => {
    const key = "siteAudit.synthetic.raw-key";

    expect(resolveTranslation("fr", key, [])).toBe(key);
    expect(resolveTranslationForDisplay("fr", key, [])).toBe("Raw key");
    expect(formatMissingTranslationKey("studio.mainMenu.item.density-focus")).toBe("Density focus");
    expect(formatMissingTranslationKey("admin.dashboard.pendingAmount")).toBe("Pending Amount");
  });

  it("protects interpolation placeholders from machine translation corruption", () => {
    const protectedSource = protectRuntimeTranslationPlaceholders(
      "Last {days} days · As of {date}",
    );

    expect(protectedSource.source).toBe("Last __TSI18N_0__ days · As of __TSI18N_1__");
    expect(
      protectedSource.restore("Derniers __TSI18N_0__ jours · au __TSI18N_1__"),
    ).toBe("Derniers {days} jours · au {date}");
    expect(protectedSource.restore("Derniers jours · au __TSI18N_1__")).toBeNull();
  });

  it("discovers untranslated keys explicitly registered by lazy Admin/Studio route dictionaries", () => {
    const key = "admin.siteAudit.syntheticRouteLabel";
    const english = "Last {days} days";

    registerI18nEnglishSourceEntries({ [key]: english });
    registerI18nLocaleEntries("ja", { [key]: english });

    expect(getRuntimeTranslationPendingKeys("ja")).toContain(key);

    registerI18nLocaleEntries("ja", { [key]: "直近 {days} 日" });
    expect(getRuntimeTranslationPendingKeys("ja")).not.toContain(key);
  });

  it("does not translate English reference data unless its route marks the key as user-visible", () => {
    const key = "reference.siteAudit.internalOnlyLabel";
    const english = "Internal reference only";

    registerI18nLocaleEntries("en", { [key]: english });
    registerI18nLocaleEntries("fr", { [key]: english });

    expect(getRuntimeTranslationPendingKeys("fr")).not.toContain(key);
  });

  it("does not auto-translate the English and Korean source/fallback locales", () => {
    expect(getRuntimeTranslationPendingKeys("en")).toEqual([]);
    expect(getRuntimeTranslationPendingKeys("en-US")).toEqual([]);
    expect(getRuntimeTranslationPendingKeys("ko")).toEqual([]);
    expect(getRuntimeTranslationPendingKeys("ko-KR")).toEqual([]);
  });
});
