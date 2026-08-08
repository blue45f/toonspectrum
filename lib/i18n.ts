import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import appEnDictionary from "../public/i18n/app/en.json";
import appKoDictionary from "../public/i18n/app/ko.json";

import {
  APP_I18N_ASSET_LOCALES,
  APP_I18N_BUILT_IN_LOCALES,
  APP_I18N_LOCALE_TRANSLATED_RATIO,
  APP_I18N_TRANSLATED_LOCALE_THRESHOLD,
} from "./i18n-locale-catalog";

// 앱 전역에서 쓰는 다국어 사전.
//
// 앱 셸에는 ko/en 두 벌만 컴파일된다. FALLBACK_CHAIN(en → ko)은 어떤 상황에서도 네트워크를
// 기다리지 않고 해소돼야 하기 때문이다. 나머지 로케일은 public/i18n/app/<locale>.json 에서
// 지연 로드한다(Studio·Admin 라우트가 이미 쓰는 패턴과 동일). 요청한 로케일의 자산이 없거나
// 로드가 실패하면 en → ko 로 내려가되 **조용히 넘어가지 않는다** — getAppI18nLocaleStatus()가
// 어떤 자산이 실제로 문자열을 공급했는지, 왜 폴백했는지를 항상 관측 가능하게 남긴다.
export type Lang = string;

export interface LanguageLocaleOption {
  code: string;
  label: string;
  nativeLabel: string;
  englishLabel: string;
  /**
   * 실측 번역률(0~1) — 이 로케일 자산에서 영어 원문과 다른 값을 가진 키의 비율.
   * 자산이 없으면 0. 자세한 정의는 lib/i18n-locale-catalog.ts 참조.
   */
  translatedRatio: number;
  /**
   * false 면 이 로케일은 사실상 영어로 렌더된다. 언어 선택 UI 는 이 사실을 감추면 안 된다.
   */
  fullyTranslated: boolean;
}

type Dict = Record<string, string>;
type DictByLocale = Record<string, Dict>;

// 앱 셸에 정적으로 포함되는 유일한 두 사전. 나머지는 전부 지연 자산이다.
const DICT: DictByLocale = {
  ko: { ...(appKoDictionary as Dict) },
  en: { ...(appEnDictionary as Dict) },
};

interface I18nState {
  lang: Lang;
  translationBundleRevision: number;
  setLang: (lang: Lang) => void;
}

const RUNTIME_TRANSLATION_SOURCE = "en";
const RUNTIME_TRANSLATION_CACHE_VERSION = 1;
const I18N_TRANSLATION_ENDPOINT = "https://api.mymemory.translated.net/get";
const I18N_TRANSLATION_TARGET_LOCALE_FALLBACK = "en";
const I18N_TRANSLATION_CONCURRENCY = 4;
const RUNTIME_TRANSLATION_TIMEOUT_MS = 8000;
const RUNTIME_TRANSLATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const RUNTIME_TRANSLATION_STORAGE_PREFIX = "toonspectrum-i18n-runtime";

const runtimeTranslationBundles = new Map<string, Dict>();
const runtimeTranslationLoads = new Map<string, Promise<void>>();

type RuntimeTranslationCachePayload = {
  v: number;
  locale: string;
  updatedAt: number;
  dict: Dict;
};

export const GOOGLE_PLAY_LOCALE_LIST: readonly string[] = [
  "af",
  "am",
  "ar",
  "as",
  "az",
  "be",
  "bg",
  "bn",
  "bs",
  "ca",
  "ceb",
  "cs",
  "cy",
  "da",
  "de",
  "de-AT",
  "de-CH",
  "de-DE",
  "el",
  "en",
  "en-AU",
  "en-GB",
  "en-IN",
  "en-US",
  "es",
  "es-419",
  "es-ES",
  "es-MX",
  "et",
  "eu",
  "fa",
  "fi",
  "fil",
  "fr",
  "fr-CA",
  "fr-CH",
  "gl",
  "gu",
  "ha",
  "he",
  "hi",
  "hi-IN",
  "hr",
  "hu",
  "hy",
  "id",
  "ig",
  "is",
  "it",
  "ja",
  "jv",
  "ka",
  "kk",
  "km",
  "kn",
  "ko",
  "ku",
  "ky",
  "lo",
  "lt",
  "lv",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "my",
  "nb",
  "ne",
  "nl",
  "nl-BE",
  "no",
  "or",
  "pa",
  "pl",
  "ps",
  "pt",
  "pt-BR",
  "pt-PT",
  "ro",
  "ru",
  "si",
  "sk",
  "sl",
  "so",
  "sq",
  "sr",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tl",
  "tr",
  "uk",
  "ur",
  "uz",
  "vi",
  "zh",
  "zh-CN",
  "zh-Hans",
  "zh-Hant",
  "zh-HK",
  "zh-TW",
  "zu",
];

const FALLBACK_LANG: Lang = "ko";
const FALLBACK_CHAIN: readonly string[] = ["en", FALLBACK_LANG];
const DEFAULT_COLLATOR_LOCALE = "en";

// 선택 가능한 로케일 목록은 "지금 DICT에 로드돼 있는 것"이 아니라 "배포된 자산이 있는 것"으로
// 정한다. 사전이 지연 로드로 바뀐 뒤 DICT.keys()는 세션 진행에 따라 커지므로, 목록의 기준으로
// 쓰면 언어 선택기가 방문 순서에 따라 달라진다.
const DICT_LOCALES: readonly string[] = APP_I18N_ASSET_LOCALES;

const NORMALIZED_LOCALE_OPTIONS = (() => {
  const set = new Set<string>();
  for (const locale of DICT_LOCALES) {
    const normalized = normalizeLocaleCode(locale);
    if (normalized) set.add(normalized);
  }
  for (const locale of GOOGLE_PLAY_LOCALE_LIST) {
    const normalized = normalizeLocaleCode(locale);
    if (normalized) set.add(normalized);
  }
  set.add("en");
  set.add(FALLBACK_LANG);
  return [...set];
})();

const displayNameCache = new Map<string, Intl.DisplayNames>();
const collatorCache = new Map<string, Intl.Collator>();

function normalizeLocaleCode(raw: string): string {
  const normalized = raw.trim().replace(/_/g, "-");
  return normalized.toLowerCase();
}

function getLocaleCandidateChain(raw: string, fallbackChain: readonly string[]): string[] {
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

export function getLocaleCandidates(raw: string, fallbackChain: readonly string[] = FALLBACK_CHAIN): string[] {
  return getLocaleCandidateChain(raw, fallbackChain);
}

function getSupportedIntlLocale(raw: string, fallback: string): string {
  const candidates = getLocaleCandidateChain(raw, [fallback]);
  for (const candidate of candidates) {
    if (Intl.Collator.supportedLocalesOf([candidate]).length > 0) return candidate;
  }
  return fallback;
}

function getDisplayNamesFormatter(locale: string): Intl.DisplayNames {
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

function getCollator(locale: string): Intl.Collator {
  const key = locale || FALLBACK_LANG;
  const cached = collatorCache.get(key);
  if (cached) return cached;

  const localeForCollator = getSupportedIntlLocale(key, DEFAULT_COLLATOR_LOCALE);
  const collator = new Intl.Collator(localeForCollator, { sensitivity: "base" });
  collatorCache.set(key, collator);
  return collator;
}

function detectBrowserLocale(): string {
  // Node 24+ exposes navigator.language even during SSR. A navigator-only guard therefore makes
  // server markup depend on the host machine's locale and can disagree with the browser during
  // hydration. Only consult the browser locale when an actual Window is present.
  if (typeof window === "undefined" || typeof navigator === "undefined") return FALLBACK_LANG;
  return normalizeLocaleCode(navigator.language) || FALLBACK_LANG;
}

function getLanguageDisplayName(locale: string, inLocale: string): string {
  const formatter = getDisplayNamesFormatter(inLocale);
  return formatter.of(locale) || formatter.of(locale.split("-")[0]) || locale;
}

function normalizeTranslatorLocale(raw: string): string {
  const normalized = normalizeLocaleCode(raw);
  if (!normalized) return I18N_TRANSLATION_TARGET_LOCALE_FALLBACK;

  const parts = normalized.split("-");
  return parts
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (/^\d{3}$/.test(part)) return part;
      if (part.length === 4) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      return part.toUpperCase();
    })
    .join("-");
}

function getTranslatorLocaleCandidates(locale: string): string[] {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return [I18N_TRANSLATION_TARGET_LOCALE_FALLBACK];

  const parts = normalized.split("-");
  const candidates = new Set<string>();

  if (parts.length > 0) {
    candidates.add(normalizeTranslatorLocale(parts.join("-")));
  }

  if (parts.length >= 2) {
    candidates.add(normalizeTranslatorLocale(parts[0]));
  }

  if (parts.length >= 3) {
    candidates.add(normalizeTranslatorLocale(`${parts[0]}-${parts[1]}`));
    candidates.add(normalizeTranslatorLocale(`${parts[0]}-${parts[parts.length - 1]}`));
  }

  // 항상 en을 최후의 폴백으로 남겨두고, 정합성/중복을 정리.
  candidates.add(I18N_TRANSLATION_TARGET_LOCALE_FALLBACK);

  return [...candidates];
}

function shouldTranslateLocale(locale: string): boolean {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return false;
  if (normalized === FALLBACK_LANG) return false;
  if (normalized === RUNTIME_TRANSLATION_SOURCE) return false;
  // 사전이 지연 자산으로 바뀐 뒤 DICT 존재 여부만 보면, 아직 로드되지 않은 배포 로케일이
  // "번역 없음"으로 오판돼 525개 키에 대한 외부 기계번역 호출이 터진다. 판단 기준은
  // 언제나 "배포된 자산이 있는가"여야 한다.
  if (resolveAppI18nAssetLocale(normalized)) return false;
  if (DICT[normalized]) return false;

  const root = normalized.split("-")[0];
  if (DICT[root]) return false;

  return true;
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
  return typed.responseData.translatedText.trim() || null;
}

function getRuntimeTranslationStorageKey(locale: string): string {
  return `${RUNTIME_TRANSLATION_STORAGE_PREFIX}:v${RUNTIME_TRANSLATION_CACHE_VERSION}:${locale}`;
}

function clearInvalidRuntimeTranslationCache(locale: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(getRuntimeTranslationStorageKey(locale));
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
      typeof parsed.dict !== "object" ||
      parsed.dict === null
    ) {
      clearInvalidRuntimeTranslationCache(locale);
      return null;
    }

    return parsed.dict;
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
    dict,
  };

  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // localStorage 용량 초과/차단 시 폴백으로 캐시만 스킵.
  }
}

async function translateViaMymemory(source: string, targetLocale: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RUNTIME_TRANSLATION_TIMEOUT_MS);

  try {
    const url = `${I18N_TRANSLATION_ENDPOINT}?${new URLSearchParams({
      q: source,
      langpair: `${RUNTIME_TRANSLATION_SOURCE}|${normalizeTranslatorLocale(targetLocale)}`,
    }).toString()}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const payload = await response.json();
    return parseMymemoryResponse(payload);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateViaMymemoryWithFallback(source: string, targetLocale: string): Promise<string | null> {
  for (const candidate of getTranslatorLocaleCandidates(targetLocale)) {
    const translated = await translateViaMymemory(source, candidate);
    if (translated) return translated;
  }

  return null;
}

function getRuntimeTranslationBundle(locale: string): Dict | undefined {
  return runtimeTranslationBundles.get(normalizeLocaleCode(locale));
}

/* ------------------------------------------------------------------------ *
 * 앱 셸 로케일 자산 (public/i18n/app/<locale>.json)
 *
 * 계약:
 *  1. ko/en 은 번들에 컴파일된다 — 폴백 체인은 절대 I/O 를 기다리지 않는다.
 *  2. 그 외 로케일은 요청 시 1회 로드된다. 활성 로케일 하나만 받는다.
 *  3. 자산이 없거나(unavailable) 로드가 실패해도(failed) 화면은 en → ko 로 계속 동작하되,
 *     그 사실은 getAppI18nLocaleStatus()로 항상 조회 가능하고 failed 는 콘솔에도 남는다.
 * ------------------------------------------------------------------------ */

const APP_I18N_ASSET_LOCALE_SET: ReadonlySet<string> = new Set(APP_I18N_ASSET_LOCALES);
const APP_I18N_BUILT_IN_LOCALE_SET: ReadonlySet<string> = new Set(APP_I18N_BUILT_IN_LOCALES);
const APP_I18N_MAX_ASSET_CHARACTERS = 512_000;
const APP_I18N_MAX_ENTRY_COUNT = 2_000;
const APP_I18N_MAX_VALUE_CHARACTERS = 4_000;

export type AppI18nLocaleState =
  /** 앱 셸에 컴파일된 사전이 직접 처리한다(ko/en). */
  | "builtin"
  /** 지연 자산을 받아 DICT 에 등록했다. */
  | "loaded"
  /** 이 로케일용으로 배포된 자산 자체가 없다 — 설계상 en → ko 폴백. */
  | "unavailable"
  /** 자산은 있는데 받지 못했다 — 폴백은 되지만 회귀 신호다. */
  | "failed";

export interface AppI18nLocaleStatus {
  /** 정규화된 요청 로케일. */
  readonly requested: string;
  /** 실제로 문자열을 공급하는 자산 로케일. 없으면 null. */
  readonly served: string | null;
  readonly state: AppI18nLocaleState;
  /** resolveTranslation 이 이 로케일에 대해 실제로 훑는 순서. */
  readonly chain: readonly string[];
  /** unavailable/failed 사유(사람이 읽는 문장). */
  readonly reason?: string;
}

export interface AppI18nLoadOptions {
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
}

/**
 * 자산 본문을 공급하는 대체 경로. 브라우저에서는 항상 null 이며, HTTP 서버가 없는
 * 테스트 그래프가 같은 자산을 디스크에서 읽도록 열어 둔 유일한 이음새다.
 */
export type AppI18nAssetSource = (assetLocale: string) => Promise<string | null>;

let appI18nAssetSource: AppI18nAssetSource | null = null;

export function setAppI18nAssetSource(source: AppI18nAssetSource | null): void {
  appI18nAssetSource = source;
}

const appLocaleStatuses = new Map<string, AppI18nLocaleStatus>();
const appLocaleLoads = new Map<string, Promise<AppI18nLocaleStatus>>();
const reportedAppLocaleFailures = new Set<string>();

function appI18nBaseUrl(): string {
  const configured =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, string | undefined>).__VITE_BASE_URL__
      : undefined;
  const baseUrl = configured || "/";
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function appI18nAssetUrl(assetLocale: string, baseUrl?: string): string {
  const normalizedBase = baseUrl
    ? (baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`)
    : appI18nBaseUrl();
  return `${normalizedBase}i18n/app/${assetLocale}.json`;
}

/**
 * 요청 로케일을 실제 배포 자산으로 좁힌다. 폴백 체인(en → ko)은 **의도적으로 제외한다** —
 * 여기에 en 을 섞으면 모든 로케일이 "자산 있음"으로 보여, 자산이 없다는 사실 자체가 사라진다.
 */
export function resolveAppI18nAssetLocale(locale: string): string | null {
  for (const candidate of getLocaleCandidateChain(locale, [])) {
    if (APP_I18N_ASSET_LOCALE_SET.has(candidate)) return candidate;
  }
  return null;
}

/** resolveTranslation 이 이 로케일에 대해 훑는 후보 순서 — 폴백이 암묵적이지 않다는 증거. */
export function getAppI18nFallbackChain(locale: string): readonly string[] {
  return getLocaleCandidates(locale);
}

/** 이 로케일 자산의 실측 번역률(0~1). 자산이 없으면 0. */
export function getAppI18nTranslatedRatio(locale: string): number {
  const assetLocale = resolveAppI18nAssetLocale(locale);
  if (!assetLocale) return 0;
  return APP_I18N_LOCALE_TRANSLATED_RATIO[assetLocale] ?? 0;
}

/**
 * 이 로케일을 "번역된 언어"로 제시해도 되는지. false 면 사용자는 사실상 영어를 보게 된다.
 */
export function isFullyTranslatedAppLocale(locale: string): boolean {
  return getAppI18nTranslatedRatio(locale) >= APP_I18N_TRANSLATED_LOCALE_THRESHOLD;
}

export function parseAppI18nDictionary(source: string): Dict | null {
  if (source.length === 0 || source.length > APP_I18N_MAX_ASSET_CHARACTERS) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.length > APP_I18N_MAX_ENTRY_COUNT) return null;

  const dictionary: Dict = {};
  for (const [key, value] of entries) {
    // An empty string is a legitimate translation: several locales render no unit suffix at all
    // (`ageGate.yearSuffix`), which is exactly why resolveTranslation treats "present" — not
    // "truthy" — as an answer.
    if (
      key.length === 0
      || typeof value !== "string"
      || value.length > APP_I18N_MAX_VALUE_CHARACTERS
    ) {
      return null;
    }
    dictionary[key] = value;
  }
  return dictionary;
}

function recordAppLocaleStatus(status: AppI18nLocaleStatus): AppI18nLocaleStatus {
  appLocaleStatuses.set(status.requested, status);
  if (status.state === "failed" && !reportedAppLocaleFailures.has(status.requested)) {
    reportedAppLocaleFailures.add(status.requested);
    // 폴백은 동작하지만 배포된 번역이 사라진 상태다. 조용히 영어로 렌더하고 끝내지 않는다.
    console.warn(
      `[i18n] locale asset "${status.served}" failed to load; falling back through ${status.chain.join(" → ")}.`,
      status.reason,
    );
  }
  return status;
}

/** 이 로케일이 어떤 자산으로 해소됐는지 — 로드 전이면 undefined. */
export function getAppI18nLocaleStatus(locale: string): AppI18nLocaleStatus | undefined {
  return appLocaleStatuses.get(normalizeLocaleCode(locale));
}

/** 로드가 시도된 모든 로케일의 상태(진단·테스트용). */
export function getAppI18nLocaleStatuses(): readonly AppI18nLocaleStatus[] {
  return [...appLocaleStatuses.values()];
}

/**
 * 지연 등록된 앱 사전을 DICT 에 병합하고 상태를 "loaded"로 고정한다. 프로덕션 로더와,
 * HTTP 서버가 없는 테스트 그래프가 공유하는 단일 등록 경로다.
 */
export function registerAppI18nLocaleDictionary(
  assetLocale: string,
  dictionary: Readonly<Record<string, string>>,
  requestedLocale = assetLocale,
): AppI18nLocaleStatus {
  const normalizedAsset = normalizeLocaleCode(assetLocale);
  const normalizedRequested = normalizeLocaleCode(requestedLocale) || normalizedAsset;

  registerI18nLocaleEntries(normalizedAsset, dictionary);
  if (normalizedRequested !== normalizedAsset) {
    registerI18nLocaleEntries(normalizedRequested, dictionary);
  }

  return recordAppLocaleStatus({
    requested: normalizedRequested,
    served: normalizedAsset,
    state: "loaded",
    chain: getAppI18nFallbackChain(normalizedRequested),
  });
}

export async function loadAppI18nLocale(
  locale: string,
  options: AppI18nLoadOptions = {},
): Promise<AppI18nLocaleStatus> {
  const normalized = normalizeLocaleCode(locale) || FALLBACK_LANG;
  const chain = getAppI18nFallbackChain(normalized);
  const assetLocale = resolveAppI18nAssetLocale(normalized);

  if (!assetLocale) {
    return recordAppLocaleStatus({
      requested: normalized,
      served: null,
      state: "unavailable",
      chain,
      reason: `No app dictionary is published for "${normalized}"; it renders through the fallback chain.`,
    });
  }

  if (APP_I18N_BUILT_IN_LOCALE_SET.has(assetLocale)) {
    return recordAppLocaleStatus({
      requested: normalized,
      served: assetLocale,
      state: "builtin",
      chain,
    });
  }

  const existingStatus = appLocaleStatuses.get(normalized);
  if (existingStatus?.state === "loaded") return existingStatus;

  const inFlight = appLocaleLoads.get(normalized);
  if (inFlight) return inFlight;

  // An explicitly injected fetch always wins over the ambient asset source, so a caller can
  // exercise the real HTTP path (including its failure modes) even where a source is installed.
  const fetchImpl = options.fetchImpl;
  const job = (async (): Promise<AppI18nLocaleStatus> => {
    try {
      let source: string | null = null;

      if (!fetchImpl && appI18nAssetSource) {
        source = await appI18nAssetSource(assetLocale);
      }
      if (source === null) {
        const resolvedFetch = fetchImpl ?? globalThis.fetch;
        if (typeof resolvedFetch !== "function") {
          throw new Error("The Fetch API is unavailable in this runtime.");
        }
        const response = await resolvedFetch(appI18nAssetUrl(assetLocale, options.baseUrl), {
          cache: "force-cache",
          credentials: "same-origin",
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${appI18nAssetUrl(assetLocale, options.baseUrl)}`);
        }
        source = await response.text();
      }

      const dictionary = parseAppI18nDictionary(source);
      if (!dictionary) {
        throw new Error(`Malformed app dictionary asset for "${assetLocale}".`);
      }

      const status = registerAppI18nLocaleDictionary(assetLocale, dictionary, normalized);
      useI18n.setState((state) => ({
        translationBundleRevision: state.translationBundleRevision + 1,
      }));
      return status;
    } catch (cause) {
      return recordAppLocaleStatus({
        requested: normalized,
        served: assetLocale,
        state: "failed",
        chain,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      appLocaleLoads.delete(normalized);
    }
  })();

  appLocaleLoads.set(normalized, job);
  return job;
}

const studioAssetLoadStatus = new Map<string, Promise<void>>();

async function loadStudioAssetIfAvailable(locale: string): Promise<void> {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return;
  const candidates = getLocaleCandidateChain(normalized, [FALLBACK_LANG]);
  for (const candidate of candidates) {
    if (DICT[candidate] && Object.keys(DICT[candidate]).some((k) => k.startsWith("studio."))) {
      return;
    }
  }
  const assetLocale =
    candidates.find((c) => DICT[c] || c === "ko" || c === "en" || c === "ja" || c === "zh" || !c.includes("-"))
    || candidates[0].split("-")[0]
    || "en";

  const existingJob = studioAssetLoadStatus.get(assetLocale);
  if (existingJob) return existingJob;

  const job = (async () => {
    try {
      if (typeof fetch !== "function") return;
      const baseUrl =
        typeof window !== "undefined" && (window as unknown as Record<string, string>).__VITE_BASE_URL__
          ? (window as unknown as Record<string, string>).__VITE_BASE_URL__
          : "/";
      const normBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      const response = await fetch(`${normBaseUrl}i18n/studio/${assetLocale}.json`, {
        cache: "force-cache",
        credentials: "same-origin",
      });
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === "object") {
          registerI18nLocaleEntries(assetLocale, data);
          if (assetLocale !== normalized) {
            registerI18nLocaleEntries(normalized, data);
          }
          useI18n.setState((state) => ({
            translationBundleRevision: state.translationBundleRevision + 1,
          }));
        }
      }
    } catch {
      // Ignore if fetch not available or file not found
    }
  })();

  studioAssetLoadStatus.set(assetLocale, job);
  studioAssetLoadStatus.set(normalized, job);
  return job;
}

async function loadRuntimeTranslationBundle(locale: string): Promise<void> {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return;

  // 활성 로케일 하나만 받는다. ko/en 은 셸에 있으므로 즉시 반환하고, 그 외에는
  // public/i18n/app/<locale>.json 1건만 요청한다.
  await loadAppI18nLocale(normalized);
  void loadStudioAssetIfAvailable(normalized);

  if (!shouldTranslateLocale(normalized)) return;

  const existing = getRuntimeTranslationBundle(normalized);
  if (existing) return;

  const cached = readCachedRuntimeTranslation(normalized);
  if (cached) {
    runtimeTranslationBundles.set(normalized, cached);
    useI18n.setState((state) => ({
      translationBundleRevision: state.translationBundleRevision + 1,
    }));
    return;
  }

  const existingLoad = runtimeTranslationLoads.get(normalized);
  if (existingLoad) {
    await existingLoad;
    return;
  }

  const allKeys = Object.keys(DICT[RUNTIME_TRANSLATION_SOURCE]);
  const bundle: Dict = {};

  const loadJob = (async () => {
    for (let index = 0; index < allKeys.length; index += I18N_TRANSLATION_CONCURRENCY) {
      const chunkKeys = allKeys.slice(index, index + I18N_TRANSLATION_CONCURRENCY);
      const translated = await Promise.all(
        chunkKeys.map(async (key) => {
          const source = DICT[RUNTIME_TRANSLATION_SOURCE][key];
          if (!source) return null;
          const translatedText = await translateViaMymemoryWithFallback(source, normalized);
          if (!translatedText) return null;
          return [key, translatedText] as const;
        })
      );

      for (const entry of translated) {
        if (!entry) continue;
        const [key, value] = entry;
        bundle[key] = value;
      }
    }

    runtimeTranslationBundles.set(normalized, bundle);
    writeRuntimeTranslationCache(normalized, bundle);
    if (Object.keys(bundle).length > 0) {
      useI18n.setState((state) => ({
        translationBundleRevision: state.translationBundleRevision + 1,
      }));
    }
  })();

  runtimeTranslationLoads.set(normalized, loadJob);
  await loadJob;
  runtimeTranslationLoads.delete(normalized);
}

export async function ensureRuntimeLocaleBundle(locale: string): Promise<void> {
  await loadRuntimeTranslationBundle(locale);
}

export function getLanguageOptions(displayLocale?: string): LanguageLocaleOption[] {
  const inLocale = normalizeLocaleCode(displayLocale || FALLBACK_LANG);
  const collator = getCollator(inLocale);
  return NORMALIZED_LOCALE_OPTIONS.map((code) => {
    const nativeLabel = getLanguageDisplayName(code, code);
    const englishLabel = getLanguageDisplayName(code, "en");
    const label = nativeLabel === englishLabel || !englishLabel ? nativeLabel : `${nativeLabel} / ${englishLabel}`;
    return {
      code,
      label,
      nativeLabel,
      englishLabel,
      translatedRatio: getAppI18nTranslatedRatio(code),
      fullyTranslated: isFullyTranslatedAppLocale(code),
    };
  }).sort((left, right) => collator.compare(left.label, right.label));
}

export function getLanguageOptionLookup(locale: string): Record<string, string> {
  const normalized = normalizeLocaleCode(locale);
  return {
    native: getLanguageDisplayName(normalized, normalized || FALLBACK_LANG) || normalized,
    english: getLanguageDisplayName(normalized, "en"),
  };
}

function resolveTranslation(
  lang: string,
  key: string,
  fallbackChain: readonly string[] = FALLBACK_CHAIN,
): string {
  const candidates = getLocaleCandidates(lang, fallbackChain);
  for (const candidate of candidates) {
    // A locale that defines a key answers for it — including with "". Several locales
    // deliberately render no unit suffix (`ageGate.yearSuffix`), and a truthiness test used to
    // skip past those empty strings and pull the Korean suffix into every other language.
    const runtimeBundle = getRuntimeTranslationBundle(candidate);
    const runtimeValue = runtimeBundle?.[key];
    if (runtimeValue !== undefined) return runtimeValue;

    const value = DICT[candidate]?.[key];
    if (value !== undefined) return value;
  }

  return DICT[FALLBACK_LANG][key] ?? key;
}

/**
 * Registers a route-owned dictionary without forcing its strings into the
 * application shell bundle. Route modules call this synchronously while their
 * lazy chunk is evaluated, so the first committed render already sees the
 * localized labels.
 */
export function registerI18nLocaleEntries(
  locale: string,
  entries: Readonly<Record<string, string>>,
): void {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return;

  const target = DICT[normalized] ?? (DICT[normalized] = {});
  let changed = false;
  for (const [key, value] of Object.entries(entries)) {
    if (target[key] === value) continue;
    target[key] = value;
    changed = true;
  }
  if (!changed) return;
}

type TranslationResolver = (key: string) => string;

// A translator is part of effect dependencies in data-fetching and OAuth surfaces. Returning a
// fresh closure from useT() on every render would restart those effects (and can create a render /
// request loop when an effect updates local state). Cache one resolver per normalized locale so
// callers get referential stability without coupling the hook to React memoization. Runtime bundle
// updates remain visible because resolveTranslation reads the bundle map at call time.
const translationResolvers = new Map<string, TranslationResolver>();

function getTranslationResolver(lang: string): TranslationResolver {
  const normalized = normalizeLocaleCode(lang) || FALLBACK_LANG;
  const cached = translationResolvers.get(normalized);
  if (cached) return cached;

  const resolver: TranslationResolver = (key) => resolveTranslation(normalized, key);
  translationResolvers.set(normalized, resolver);
  return resolver;
}

function applyHtmlLang(lang: string) {
  if (typeof document !== "undefined") document.documentElement.lang = normalizeLocaleCode(lang) || FALLBACK_LANG;
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      lang: detectBrowserLocale(),
      translationBundleRevision: 0,
      setLang: (lang) => {
        const normalized = normalizeLocaleCode(lang) || FALLBACK_LANG;
        applyHtmlLang(normalized);
        set({ lang: normalized });
        void loadRuntimeTranslationBundle(normalized);
      },
    }),
    {
      name: "toonspectrum-lang",
      onRehydrateStorage: () => (state) => {
        if (state) {
          const normalized = normalizeLocaleCode(state.lang || FALLBACK_LANG);
          state.lang = normalized;
          applyHtmlLang(normalized);
          void loadRuntimeTranslationBundle(normalized);
        }
      },
    }
  )
);

export function getLang(): string {
  return useI18n.getState().lang;
}

export function useT(): (key: string) => string {
  const lang = useI18n((s) => s.lang);
  const translationBundleRevision = useI18n((s) => s.translationBundleRevision);
  void translationBundleRevision;
  useEffect(() => {
    void loadRuntimeTranslationBundle(lang);
  }, [lang]);
  return getTranslationResolver(lang);
}

export {
  DICT as i18nDict,
  FALLBACK_LANG,
  FALLBACK_CHAIN,
  resolveTranslation as resolveI18nValue,
};
