import {
  getAppI18nTranslatedRatio,
  isFullyTranslatedAppLocale,
} from "./i18n-asset-loader";
import { FALLBACK_LANG, FALLBACK_CHAIN } from "./i18n-core";
import {
  NORMALIZED_LOCALE_OPTIONS,
  normalizeLocaleCode,
} from "./i18n-locale-list";

import type { LanguageLocaleOption } from "./i18n-core";

export { normalizeLocaleCode };

const DEFAULT_COLLATOR_LOCALE = "en";

const displayNameCache = new Map<string, Intl.DisplayNames>();
const collatorCache = new Map<string, Intl.Collator>();

const RTL_SCRIPT_SUBTAGS = new Set([
  "adlm",
  "arab",
  "hebr",
  "mand",
  "nkoo",
  "rohg",
  "syrc",
  "thaa",
]);
const RTL_LANGUAGE_ROOTS = new Set([
  "ar",
  "arc",
  "ckb",
  "dv",
  "fa",
  "he",
  "ks",
  "nqo",
  "ps",
  "sd",
  "syr",
  "ug",
  "ur",
  "yi",
]);

export function getLocaleCandidateChain(
  raw: string,
  fallbackChain: readonly string[],
): string[] {
  const normalized = normalizeLocaleCode(raw);
  const candidates = new Set<string>();

  if (!normalized) {
    for (const fallback of fallbackChain) {
      candidates.add(fallback);
    }
    return [...candidates];
  }

  const parts = normalized.split("-");
  for (let i = parts.length; i >= 1; i--) {
    const candidate = parts.slice(0, i).join("-");
    candidates.add(candidate);
  }

  for (const fallback of fallbackChain) {
    candidates.add(fallback);
  }

  return [...candidates];
}

export function getLocaleCandidates(
  raw: string,
  fallbackChain: readonly string[] = FALLBACK_CHAIN,
): string[] {
  return getLocaleCandidateChain(raw, fallbackChain);
}

export function getSupportedIntlLocale(raw: string, fallback: string): string {
  const candidates = getLocaleCandidateChain(raw, [fallback]);
  for (const candidate of candidates) {
    if (Intl.Collator.supportedLocalesOf([candidate]).length > 0)
      return candidate;
  }
  return fallback;
}

export function getDisplayNamesFormatter(locale: string): Intl.DisplayNames {
  const key = normalizeLocaleCode(locale) || FALLBACK_LANG;
  const cached = displayNameCache.get(key);
  if (cached) return cached;

  let formatter: Intl.DisplayNames | undefined;
  const candidates = getLocaleCandidateChain(key, [DEFAULT_COLLATOR_LOCALE]);
  for (const candidate of candidates) {
    try {
      if (Intl.Collator.supportedLocalesOf([candidate]).length === 0) continue;
      formatter = new Intl.DisplayNames([candidate], { type: "language" });
      break;
    } catch {
      // 해당 locale 포맷터 미지원이면 다음 후보 사용
    }
  }
  if (!formatter) {
    formatter = new Intl.DisplayNames(["en"], { type: "language" });
  }
  displayNameCache.set(key, formatter);
  return formatter;
}

export function getCollator(locale: string): Intl.Collator {
  const key = locale || FALLBACK_LANG;
  const cached = collatorCache.get(key);
  if (cached) return cached;

  const localeForCollator = getSupportedIntlLocale(
    key,
    DEFAULT_COLLATOR_LOCALE,
  );
  const collator = new Intl.Collator(localeForCollator, {
    sensitivity: "base",
  });
  collatorCache.set(key, collator);
  return collator;
}

export function detectBrowserLocale(): string {
  // Node 24+ exposes navigator.language even during SSR. A navigator-only guard therefore makes
  // server markup depend on the host machine's locale and can disagree with the browser during
  // hydration. Only consult the browser locale when an actual Window is present.
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return FALLBACK_LANG;
  return resolveSelectableLocale(navigator.language);
}

/**
 * Korean-first public shell: prefer the static/SSR `html lang` (apps/web/index.html uses `ko`)
 * over navigator.language so an English capture browser does not flip the document to en-us on
 * hydration. Explicit user choices still win through persisted zustand state.
 */
export function detectDocumentPreferredLocale(): string {
  if (typeof document !== "undefined") {
    const documentLang = document.documentElement?.lang;
    if (documentLang && documentLang.trim()) {
      return resolveSelectableLocale(documentLang);
    }
  }
  return FALLBACK_LANG;
}

/**
 * Maps a browser/persisted locale to a value that the application's language
 * controls can actually select. Browsers commonly report region variants such
 * as `ko-KR` even when the published locale catalog intentionally exposes the
 * language root (`ko`) only. Keeping the unmatched variant in a controlled
 * `<select>` makes the browser visually fall back to its first option while the
 * page continues rendering another language.
 */
export function isWellFormedLocaleCode(raw?: string | null): boolean {
  const normalized = normalizeLocaleCode(raw);
  if (!normalized) return false;
  try {
    return Intl.getCanonicalLocales(normalized).length > 0;
  } catch {
    return false;
  }
}

export function resolveSelectableLocale(raw?: string | null): string {
  const normalized = normalizeLocaleCode(raw);
  const supported = new Set(NORMALIZED_LOCALE_OPTIONS);
  const match = getLocaleCandidateChain(normalized, []).find((candidate) =>
    supported.has(candidate)
  );
  if (match) return match;

  // Integrations and persisted profiles may carry a valid BCP 47 locale that is not part of the
  // curated picker yet. Preserve it instead of silently switching the user back to Korean.
  return isWellFormedLocaleCode(normalized) ? normalized : FALLBACK_LANG;
}

export function getLocaleDirection(raw?: string | null): "ltr" | "rtl" {
  const normalized = normalizeLocaleCode(raw);
  if (!normalized) return "ltr";

  try {
    const script = new Intl.Locale(normalized).maximize().script?.toLowerCase();
    if (script) return RTL_SCRIPT_SUBTAGS.has(script) ? "rtl" : "ltr";
  } catch {
    // Fall through to the language-root table for older runtimes or unusual valid tags.
  }

  const explicitScript = normalized
    .split("-")
    .find((part) => /^[a-z]{4}$/u.test(part));
  if (explicitScript) {
    return RTL_SCRIPT_SUBTAGS.has(explicitScript) ? "rtl" : "ltr";
  }
  return RTL_LANGUAGE_ROOTS.has(normalized.split("-")[0] ?? "") ? "rtl" : "ltr";
}

export function getLanguageDisplayName(
  locale?: string,
  inLocale?: string,
): string {
  if (!locale) return "";
  const formatter = getDisplayNamesFormatter(inLocale || FALLBACK_LANG);
  try {
    const direct = formatter.of(locale);
    if (direct) return direct;
  } catch {}
  if (locale.includes("-")) {
    try {
      const base = formatter.of(locale.split("-")[0]!);
      if (base) return base;
    } catch {}
  }
  return locale;
}

export function getLanguageOptions(
  displayLocale?: string,
): LanguageLocaleOption[] {
  const inLocale = normalizeLocaleCode(displayLocale || FALLBACK_LANG);
  const collator = getCollator(inLocale);
  const localeCodes = new Set(NORMALIZED_LOCALE_OPTIONS);
  if (isWellFormedLocaleCode(inLocale)) localeCodes.add(inLocale);

  return [...localeCodes].map((code: string): LanguageLocaleOption => {
    const nativeLabel = getLanguageDisplayName(code, code);
    const englishLabel = getLanguageDisplayName(code, "en");
    const label =
      nativeLabel === englishLabel || !englishLabel
        ? nativeLabel
        : `${nativeLabel} / ${englishLabel}`;
    return {
      code,
      label,
      nativeLabel,
      englishLabel,
      translatedRatio: getAppI18nTranslatedRatio(code),
      fullyTranslated: isFullyTranslatedAppLocale(code),
    };
  }).sort((left: LanguageLocaleOption, right: LanguageLocaleOption) => collator.compare(left.label, right.label));
}

export function getLanguageOptionLookup(
  locale: string,
): Record<string, string> {
  const normalized = normalizeLocaleCode(locale);
  return {
    native:
      getLanguageDisplayName(normalized, normalized || FALLBACK_LANG) ||
      normalized,
    english: getLanguageDisplayName(normalized, "en"),
  };
}
