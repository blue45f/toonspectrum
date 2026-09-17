import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { builtinAppDictionaries } from "./i18n-built-in-dictionaries";

import {
  normalizeLocaleCode,
  getLocaleCandidates,
  detectDocumentPreferredLocale,
  getLocaleDirection,
  resolveSelectableLocale,
} from "./i18n-intl-utils";
import {
  getRuntimeTranslationBundle,
  loadRuntimeTranslationBundle,
} from "./i18n-runtime-translation";

// 앱 전역에서 쓰는 다국어 사전.
//
// 앱 셸에는 ko/en 두 벌만 컴파일된다. FALLBACK_CHAIN(en → ko)은 어떤 상황에서도 네트워크를
// 기다리지 않고 해소돼야 하기 때문이다. 나머지 로케일은 public/i18n/app/<namespace>/<locale>.json 에서
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
   * false 면 사람이 검수한 완성 번역이 아니라 자동 번역과 영어 폴백을 함께 사용한다.
   * 언어 선택 UI 는 이 품질 차이를 감추면 안 된다.
   */
  fullyTranslated: boolean;
}

export type Dict = Record<string, string>;
type DictByLocale = Record<string, Dict>;

// 앱 셸에 정적으로 포함되는 유일한 두 사전. 나머지는 전부 지연 자산이다.
export const DICT: DictByLocale = {
  ko: { ...builtinAppDictionaries.ko },
  en: { ...builtinAppDictionaries.en },
};

// Runtime machine translation must not blindly treat every DICT.en entry as a source. Tests and
// feature modules can register diagnostic/reference dictionaries that are not currently rendered.
// Start with the app-shell surface, then let lazy Admin/Studio loaders explicitly opt their English
// dictionaries in when those routes are actually loaded.
const runtimeTranslationSourceKeys = new Set<string>(Object.keys(DICT.en));

export function registerI18nEnglishSourceEntries(
  entries: Readonly<Record<string, string>>,
): void {
  registerI18nLocaleEntries("en", entries);
  for (const key of Object.keys(entries)) runtimeTranslationSourceKeys.add(key);
}

export function getI18nRuntimeTranslationSourceKeys(): readonly string[] {
  return [...runtimeTranslationSourceKeys];
}

export interface I18nState {
  lang: Lang;
  translationBundleRevision: number;
  setLang: (lang: Lang) => void;
}

export const FALLBACK_LANG: Lang = "ko";
export const FALLBACK_CHAIN: readonly string[] = ["en", FALLBACK_LANG];

export function resolveTranslation(
  lang: string,
  key: string,
  fallbackChain: readonly string[] = FALLBACK_CHAIN,
): string {
  const candidates = getLocaleCandidates(lang, fallbackChain);
  const englishSource = DICT.en?.[key];
  for (const candidate of candidates) {
    const authoredValue = DICT[candidate]?.[key];

    // Human-authored values always win over cached machine translation. This also protects newly
    // improved locale assets from being shadowed by an older automatic-translation cache.
    if (
      authoredValue !== undefined &&
      (englishSource === undefined || authoredValue !== englishSource)
    ) {
      return authoredValue;
    }

    const runtimeValue = getRuntimeTranslationBundle(candidate)?.[key];
    if (runtimeValue !== undefined) return runtimeValue;

    // A locale that defines a key answers for it — including with "". Several locales
    // deliberately render no unit suffix (`ageGate.yearSuffix`), and a truthiness test used to
    // skip past those empty strings and pull the Korean suffix into every other language.
    if (authoredValue !== undefined) return authoredValue;
  }

  return DICT[FALLBACK_LANG][key] ?? key;
}

/**
 * Turns a missing i18n identifier into a readable emergency label. The low-level resolver keeps
 * returning the raw key for diagnostics/tests, while UI translators use this formatter so users
 * never see implementation identifiers such as `studio.mainMenu.item.view.density-focus`.
 */
export function formatMissingTranslationKey(key: string): string {
  const leaf = key.split(".").filter(Boolean).at(-1) ?? key;
  const readable = leaf
    .replace(/[_-]+/gu, " ")
    .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, "$1 $2")
    .replace(/\s+/gu, " ")
    .trim();

  if (!readable) return "Translation unavailable";
  return readable.charAt(0).toLocaleUpperCase() + readable.slice(1);
}

/** UI-safe resolver: preserve all normal fallback behavior but never expose a raw translation key. */
export function resolveTranslationForDisplay(
  lang: string,
  key: string,
  fallbackChain: readonly string[] = FALLBACK_CHAIN,
): string {
  const resolved = resolveTranslation(lang, key, fallbackChain);
  return resolved === key ? formatMissingTranslationKey(key) : resolved;
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

  const resolver: TranslationResolver = (key) =>
    resolveTranslationForDisplay(normalized, key);
  translationResolvers.set(normalized, resolver);
  return resolver;
}

export function applyDocumentLocale(lang: string) {
  if (typeof document === "undefined") return;
  const normalized = normalizeLocaleCode(lang) || FALLBACK_LANG;
  document.documentElement.lang = normalized;
  document.documentElement.dir = getLocaleDirection(normalized);
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      lang: detectDocumentPreferredLocale(),
      translationBundleRevision: 0,
      setLang: (lang) => {
        const normalized = resolveSelectableLocale(lang);
        applyDocumentLocale(normalized);
        set({ lang: normalized });
        void loadRuntimeTranslationBundle(normalized);
      },
    }),
    {
      name: "toonspectrum-lang",
      onRehydrateStorage: () => (state) => {
        if (state) {
          const normalized = resolveSelectableLocale(state.lang || FALLBACK_LANG);
          state.lang = normalized;
          applyDocumentLocale(normalized);
          void loadRuntimeTranslationBundle(normalized);
        }
      },
    },
  ),
);

export function getLang(): string {
  return useI18n.getState().lang;
}

export function useT(): (key: string) => string {
  const lang = useI18n((s) => s.lang);
  const translationBundleRevision = useI18n((s) => s.translationBundleRevision);
  useEffect(() => {
    // Route-owned dictionaries (Studio/Admin) arrive after the app-shell bundle. Re-run the
    // automatic translator when a route registers new source keys so non-English locales are not
    // permanently left with English copies merely because the first app-shell pass already ran.
    void loadRuntimeTranslationBundle(lang);
  }, [lang, translationBundleRevision]);
  return getTranslationResolver(lang);
}

export function triggerTranslationBundleUpdate() {
  useI18n.setState((state) => ({
    translationBundleRevision: state.translationBundleRevision + 1,
  }));
}
