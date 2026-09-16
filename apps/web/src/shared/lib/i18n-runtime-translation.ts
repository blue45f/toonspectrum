import {
  isFullyTranslatedAppLocale,
  loadAppI18nLocale,
  resolveAppI18nAssetLocale,
} from "./i18n-asset-loader";
import { builtinAppDictionaries } from "./i18n-built-in-dictionaries";
import {
  DICT,
  FALLBACK_LANG,
  triggerTranslationBundleUpdate,
} from "./i18n-core";
import {
  getLocaleCandidateChain,
  normalizeLocaleCode,
} from "./i18n-intl-utils";

import type { Dict } from "./i18n-core";

const RUNTIME_TRANSLATION_SOURCE = "en";
const RUNTIME_TRANSLATION_CACHE_VERSION = 2;
const I18N_TRANSLATION_ENDPOINT = "https://api.mymemory.translated.net/get";
const I18N_TRANSLATION_CONCURRENCY = 8;
const RUNTIME_TRANSLATION_TIMEOUT_MS = 8_000;
const RUNTIME_TRANSLATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const RUNTIME_TRANSLATION_STORAGE_PREFIX = "toonspectrum-i18n-runtime";
const RUNTIME_TRANSLATION_MAX_VALUE_CHARACTERS = 4_000;
const RUNTIME_TRANSLATION_PROGRESS_BATCH = 32;

// Translate only the public app-shell source surface. Studio owns its own namespace-aware loader;
// reading the immutable built-in dictionary also avoids coupling the runtime translator to route
// dictionaries that are registered into DICT after startup.
const RUNTIME_APP_SOURCE_DICTIONARY: Readonly<Dict> =
  builtinAppDictionaries[RUNTIME_TRANSLATION_SOURCE];
const RUNTIME_APP_SOURCE_KEYS = Object.freeze(
  Object.keys(RUNTIME_APP_SOURCE_DICTIONARY),
);
const RUNTIME_APP_SOURCE_KEY_SET: ReadonlySet<string> = new Set(
  RUNTIME_APP_SOURCE_KEYS,
);

const runtimeTranslationBundles = new Map<string, Dict>();
const runtimeTranslationLoads = new Map<string, Promise<void>>();
const runtimeTranslationAttemptedKeys = new Map<string, Set<string>>();

type RuntimeTranslationCachePayload = {
  v: number;
  locale: string;
  updatedAt: number;
  complete: true;
  dict: Dict;
};

function normalizeTranslatorLocale(raw: string): string {
  const normalized = normalizeLocaleCode(raw);
  if (!normalized) return "";

  return normalized
    .split("-")
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (/^\d{3}$/u.test(part)) return part;
      if (part.length === 4) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
      return part.toUpperCase();
    })
    .join("-");
}

function getTranslatorLocaleCandidates(locale: string): string[] {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return [];

  const candidates = new Set<string>();
  for (const candidate of getLocaleCandidateChain(normalized, [])) {
    const translatorLocale = normalizeTranslatorLocale(candidate);
    if (translatorLocale) candidates.add(translatorLocale);
  }
  return [...candidates];
}

function shouldAutoTranslateLocale(locale: string): boolean {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return false;

  const root = normalized.split("-")[0];
  if (root === FALLBACK_LANG || root === RUNTIME_TRANSLATION_SOURCE) {
    return false;
  }

  // High-coverage human-authored dictionaries should never be shadowed by machine translation.
  return !isFullyTranslatedAppLocale(normalized);
}

function parseMymemoryResponse(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const typed = data as {
    responseData?: {
      translatedText?: unknown;
    };
    responseStatus?: number | string;
  };

  if (typeof typed.responseData?.translatedText !== "string") return null;
  if (typed.responseStatus !== undefined) {
    const status =
      typeof typed.responseStatus === "string"
        ? Number.parseInt(typed.responseStatus, 10)
        : typed.responseStatus;
    if (status !== 200) return null;
  }

  const translated = typed.responseData.translatedText.trim();
  if (
    translated.length === 0 ||
    translated.length > RUNTIME_TRANSLATION_MAX_VALUE_CHARACTERS
  ) {
    return null;
  }
  return translated;
}

function getRuntimeTranslationStorageKey(locale: string): string {
  return `${RUNTIME_TRANSLATION_STORAGE_PREFIX}:v${RUNTIME_TRANSLATION_CACHE_VERSION}:${locale}`;
}

function clearInvalidRuntimeTranslationCache(locale: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(getRuntimeTranslationStorageKey(locale));
}

function isRuntimeTranslationDictionary(value: unknown): value is Dict {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([key, entry]) =>
      RUNTIME_APP_SOURCE_KEY_SET.has(key) &&
      typeof entry === "string" &&
      entry.length > 0 &&
      entry.length <= RUNTIME_TRANSLATION_MAX_VALUE_CHARACTERS,
  );
}

function readCachedRuntimeTranslation(locale: string): Dict | null {
  if (typeof localStorage === "undefined") return null;
  const key = getRuntimeTranslationStorageKey(locale);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RuntimeTranslationCachePayload;

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      parsed.v !== RUNTIME_TRANSLATION_CACHE_VERSION ||
      parsed.locale !== locale ||
      typeof parsed.updatedAt !== "number" ||
      Date.now() - parsed.updatedAt > RUNTIME_TRANSLATION_CACHE_TTL_MS ||
      parsed.complete !== true ||
      !isRuntimeTranslationDictionary(parsed.dict)
    ) {
      clearInvalidRuntimeTranslationCache(locale);
      return null;
    }

    return { ...parsed.dict };
  } catch {
    clearInvalidRuntimeTranslationCache(locale);
    return null;
  }
}

function writeRuntimeTranslationCache(locale: string, dict: Dict): void {
  if (typeof localStorage === "undefined") return;

  const key = getRuntimeTranslationStorageKey(locale);
  const payload: RuntimeTranslationCachePayload = {
    v: RUNTIME_TRANSLATION_CACHE_VERSION,
    locale,
    updatedAt: Date.now(),
    complete: true,
    dict,
  };

  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Storage can be blocked or full. The in-memory bundle still remains usable.
  }
}

async function translateViaMymemory(
  source: string,
  targetLocale: string,
): Promise<string | null> {
  const normalizedTarget = normalizeTranslatorLocale(targetLocale);
  if (!normalizedTarget) return null;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    RUNTIME_TRANSLATION_TIMEOUT_MS,
  );

  try {
    const url = `${I18N_TRANSLATION_ENDPOINT}?${new URLSearchParams({
      q: source,
      langpair: `${RUNTIME_TRANSLATION_SOURCE}|${normalizedTarget}`,
    }).toString()}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    return parseMymemoryResponse(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateViaMymemoryWithFallback(
  source: string,
  targetLocale: string,
): Promise<string | null> {
  for (const candidate of getTranslatorLocaleCandidates(targetLocale)) {
    const translated = await translateViaMymemory(source, candidate);
    if (translated) return translated;
  }
  return null;
}

function getLocaleDictionary(locale: string): Dict | undefined {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return undefined;

  const assetLocale = resolveAppI18nAssetLocale(normalized);
  return DICT[normalized] ?? (assetLocale ? DICT[assetLocale] : undefined);
}

function getAttemptedKeys(locale: string): Set<string> {
  const existing = runtimeTranslationAttemptedKeys.get(locale);
  if (existing) return existing;

  const created = new Set<string>();
  runtimeTranslationAttemptedKeys.set(locale, created);
  return created;
}

function getKeysNeedingAutomaticTranslation(locale: string): string[] {
  const targetDictionary = getLocaleDictionary(locale);
  const runtimeBundle = runtimeTranslationBundles.get(locale);
  const attempted = getAttemptedKeys(locale);

  return RUNTIME_APP_SOURCE_KEYS.filter((key) => {
    const source = RUNTIME_APP_SOURCE_DICTIONARY[key];
    if (!source || !/[\p{L}\p{N}]/u.test(source)) return false;
    if (runtimeBundle?.[key] !== undefined || attempted.has(key)) return false;

    const authoredValue = targetDictionary?.[key];
    // Preserve every human-authored value that differs from the English source. Empty strings are
    // intentional translations too and must not be replaced.
    return authoredValue === undefined || authoredValue === source;
  });
}

export function getRuntimeTranslationBundle(locale: string): Dict | undefined {
  return runtimeTranslationBundles.get(normalizeLocaleCode(locale));
}

export async function loadRuntimeTranslationBundle(locale: string): Promise<void> {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return;

  await loadAppI18nLocale(normalized);
  if (!shouldAutoTranslateLocale(normalized)) return;

  if (!runtimeTranslationBundles.has(normalized)) {
    const cached = readCachedRuntimeTranslation(normalized);
    if (cached) {
      runtimeTranslationBundles.set(normalized, cached);
      if (Object.keys(cached).length > 0) triggerTranslationBundleUpdate();
      return;
    }
  }

  const inFlight = runtimeTranslationLoads.get(normalized);
  if (inFlight) {
    await inFlight;
    return;
  }

  const keys = getKeysNeedingAutomaticTranslation(normalized);
  if (keys.length === 0) return;

  const bundle = runtimeTranslationBundles.get(normalized) ?? {};
  runtimeTranslationBundles.set(normalized, bundle);
  const attempted = getAttemptedKeys(normalized);

  const job = (async () => {
    let pendingRevisionEntries = 0;
    try {
      for (
        let index = 0;
        index < keys.length;
        index += I18N_TRANSLATION_CONCURRENCY
      ) {
        const chunkKeys = keys.slice(
          index,
          index + I18N_TRANSLATION_CONCURRENCY,
        );
        for (const key of chunkKeys) attempted.add(key);

        const translatedEntries = await Promise.all(
          chunkKeys.map(async (key) => {
            const source = RUNTIME_APP_SOURCE_DICTIONARY[key];
            if (!source) return null;

            const translated = await translateViaMymemoryWithFallback(
              source,
              normalized,
            );
            return translated ? ([key, translated] as const) : null;
          }),
        );

        for (const entry of translatedEntries) {
          if (!entry) continue;
          const [key, value] = entry;
          bundle[key] = value;
          pendingRevisionEntries += 1;
        }

        if (pendingRevisionEntries >= RUNTIME_TRANSLATION_PROGRESS_BATCH) {
          pendingRevisionEntries = 0;
          triggerTranslationBundleUpdate();
        }
      }

      writeRuntimeTranslationCache(normalized, bundle);
      if (pendingRevisionEntries > 0) triggerTranslationBundleUpdate();
    } finally {
      runtimeTranslationLoads.delete(normalized);
    }
  })();

  runtimeTranslationLoads.set(normalized, job);
  await job;
}

export async function ensureRuntimeLocaleBundle(locale: string): Promise<void> {
  await loadRuntimeTranslationBundle(locale);
}
