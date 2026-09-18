import {
  loadAppI18nLocale,
  resolveAppI18nAssetLocale,
} from "./i18n-asset-loader";
import {
  DICT,
  FALLBACK_LANG,
  getI18nRuntimeTranslationSources,
  triggerTranslationBundleUpdate,
} from "./i18n-core";
import {
  getLocaleCandidateChain,
  normalizeLocaleCode,
} from "./i18n-intl-utils";

import type { Dict } from "./i18n-core";

const RUNTIME_TRANSLATION_CACHE_VERSION = 3;
const I18N_TRANSLATION_ENDPOINT = "https://api.mymemory.translated.net/get";
const I18N_TRANSLATION_CONCURRENCY = 8;
const RUNTIME_TRANSLATION_TIMEOUT_MS = 8_000;
const RUNTIME_TRANSLATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const RUNTIME_TRANSLATION_STORAGE_PREFIX = "toonspectrum-i18n-runtime";
const RUNTIME_TRANSLATION_MAX_VALUE_CHARACTERS = 4_000;
const RUNTIME_TRANSLATION_MAX_KEY_CHARACTERS = 256;
const RUNTIME_TRANSLATION_PROGRESS_BATCH = 32;
const RUNTIME_TRANSLATION_KEY_RE = /^[\p{L}\p{N}_.:-]+$/u;
const INTERPOLATION_TOKEN_RE = /\{[\p{L}\p{N}_.-]+\}/gu;

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

type ProtectedTranslationSource = {
  readonly source: string;
  readonly restore: (translated: string) => string | null;
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

  // Korean is the complete product fallback dictionary and never needs machine translation.
  // English remains eligible so Korean-authored static UI added by lazy Studio modules can be
  // translated into English; source/target root equality is filtered per key below.
  return normalized.split("-")[0] !== FALLBACK_LANG;
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

/**
 * Machine translators occasionally translate or drop `{count}`-style interpolation markers.
 * Protect them with opaque tokens and reject a result unless every token survives, otherwise a
 * translated label can later crash interpolation or visibly leak a placeholder name.
 */
export function protectRuntimeTranslationPlaceholders(
  source: string,
): ProtectedTranslationSource {
  const placeholders: string[] = [];
  const protectedSource = source.replace(INTERPOLATION_TOKEN_RE, (placeholder) => {
    const index = placeholders.length;
    placeholders.push(placeholder);
    return `__TSI18N_${index}__`;
  });

  return {
    source: protectedSource,
    restore: (translated) => {
      let restored = translated;
      for (let index = 0; index < placeholders.length; index += 1) {
        const token = `__TSI18N_${index}__`;
        if (!restored.includes(token)) return null;
        restored = restored.replaceAll(token, placeholders[index] ?? "");
      }
      return restored;
    },
  };
}

function getRuntimeTranslationStorageKey(locale: string): string {
  return `${RUNTIME_TRANSLATION_STORAGE_PREFIX}:v${RUNTIME_TRANSLATION_CACHE_VERSION}:${locale}`;
}

function getRuntimeTranslationStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function clearInvalidRuntimeTranslationCache(locale: string): void {
  const storage = getRuntimeTranslationStorage();
  if (!storage) return;
  try {
    storage.removeItem(getRuntimeTranslationStorageKey(locale));
  } catch {
    // Storage is optional; keep using the in-memory runtime bundle.
  }
}

function isRuntimeTranslationDictionary(value: unknown): value is Dict {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([key, entry]) =>
      key.length > 0 &&
      key.length <= RUNTIME_TRANSLATION_MAX_KEY_CHARACTERS &&
      RUNTIME_TRANSLATION_KEY_RE.test(key) &&
      typeof entry === "string" &&
      entry.length > 0 &&
      entry.length <= RUNTIME_TRANSLATION_MAX_VALUE_CHARACTERS,
  );
}

function readCachedRuntimeTranslation(locale: string): Dict | null {
  const storage = getRuntimeTranslationStorage();
  if (!storage) return null;
  const key = getRuntimeTranslationStorageKey(locale);
  try {
    const raw = storage.getItem(key);
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
  const storage = getRuntimeTranslationStorage();
  if (!storage) return;

  const key = getRuntimeTranslationStorageKey(locale);
  const payload: RuntimeTranslationCachePayload = {
    v: RUNTIME_TRANSLATION_CACHE_VERSION,
    locale,
    updatedAt: Date.now(),
    complete: true,
    dict,
  };

  try {
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // Storage can be blocked or full. The in-memory bundle still remains usable.
  }
}

async function translateViaMymemory(
  source: string,
  sourceLocale: string,
  targetLocale: string,
): Promise<string | null> {
  const normalizedSource = normalizeTranslatorLocale(sourceLocale);
  const normalizedTarget = normalizeTranslatorLocale(targetLocale);
  if (!normalizedSource || !normalizedTarget) return null;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    RUNTIME_TRANSLATION_TIMEOUT_MS,
  );

  try {
    const url = `${I18N_TRANSLATION_ENDPOINT}?${new URLSearchParams({
      q: source,
      langpair: `${normalizedSource}|${normalizedTarget}`,
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
  sourceLocale: string,
  targetLocale: string,
): Promise<string | null> {
  const protectedSource = protectRuntimeTranslationPlaceholders(source);
  for (const candidate of getTranslatorLocaleCandidates(targetLocale)) {
    const translated = await translateViaMymemory(
      protectedSource.source,
      sourceLocale,
      candidate,
    );
    if (!translated) continue;
    const restored = protectedSource.restore(translated);
    if (restored) return restored;
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

/**
 * Returns registered runtime source keys that still need automatic translation. Each source keeps
 * its authored locale so lazy Studio surfaces can translate Korean-authored static copy without
 * mislabeling that text as English or sending user-generated DOM text to the translator.
 */
type RuntimeTranslationPendingEntry = {
  readonly key: string;
  readonly sourceLocale: string;
  readonly source: string;
};

function getRuntimeTranslationPendingEntries(
  locale: string,
): readonly RuntimeTranslationPendingEntry[] {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized || !shouldAutoTranslateLocale(normalized)) return [];

  const targetRoot = normalized.split("-")[0];
  const targetDictionary = getLocaleDictionary(normalized);
  const runtimeBundle = runtimeTranslationBundles.get(normalized);
  const attempted = getAttemptedKeys(normalized);

  return getI18nRuntimeTranslationSources().flatMap(({ key, locale: rawSourceLocale }) => {
    const sourceLocale = normalizeLocaleCode(rawSourceLocale);
    if (!sourceLocale || sourceLocale.split("-")[0] === targetRoot) return [];

    const source = DICT[sourceLocale]?.[key];
    if (!source || !/[\p{L}\p{N}]/u.test(source)) return [];
    if (runtimeBundle?.[key] !== undefined || attempted.has(key)) return [];

    const authoredValue = targetDictionary?.[key];
    if (authoredValue !== undefined && authoredValue !== source) return [];

    return [{ key, sourceLocale, source }];
  });
}

export function getRuntimeTranslationPendingKeys(locale: string): readonly string[] {
  return getRuntimeTranslationPendingEntries(locale).map(({ key }) => key);
}

export function getRuntimeTranslationBundle(locale: string): Dict | undefined {
  return runtimeTranslationBundles.get(normalizeLocaleCode(locale));
}

export async function loadRuntimeTranslationBundle(locale: string): Promise<void> {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return;

  await loadAppI18nLocale(normalized);

  if (!runtimeTranslationBundles.has(normalized)) {
    const cached = readCachedRuntimeTranslation(normalized);
    if (cached) {
      runtimeTranslationBundles.set(normalized, cached);
      if (Object.keys(cached).length > 0) triggerTranslationBundleUpdate();
      // A persisted cache can predate lazy UI sources registered later in the same session. Only
      // stop here when the current source registry has no additional keys to translate.
      if (getRuntimeTranslationPendingKeys(normalized).length === 0) return;
    }
  }

  const inFlight = runtimeTranslationLoads.get(normalized);
  if (inFlight) {
    await inFlight;
    if (getRuntimeTranslationPendingKeys(normalized).length === 0) return;
  }

  const pendingEntries = [...getRuntimeTranslationPendingEntries(normalized)];
  if (pendingEntries.length === 0) return;

  const bundle = runtimeTranslationBundles.get(normalized) ?? {};
  runtimeTranslationBundles.set(normalized, bundle);
  const attempted = getAttemptedKeys(normalized);

  const job = (async () => {
    let pendingRevisionEntries = 0;
    try {
      for (
        let index = 0;
        index < pendingEntries.length;
        index += I18N_TRANSLATION_CONCURRENCY
      ) {
        const chunkEntries = pendingEntries.slice(
          index,
          index + I18N_TRANSLATION_CONCURRENCY,
        );
        for (const { key } of chunkEntries) attempted.add(key);

        const translatedEntries = await Promise.all(
          chunkEntries.map(async ({ key, sourceLocale, source }) => {
            const translated = await translateViaMymemoryWithFallback(
              source,
              sourceLocale,
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
