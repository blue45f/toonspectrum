import {
  getLang,
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
  registerI18nRuntimeSourceEntries,
  resolveTranslationForDisplay,
} from "./i18n-core";
import { normalizeLocaleCode } from "./i18n-intl-utils";
import { loadRuntimeTranslationBundle } from "./i18n-runtime-translation";

export interface BilingualText {
  readonly ko: string;
  readonly en: string;
}

export type TranslationResolver = (key: string) => string;

type StringTree = string | readonly StringTree[] | { readonly [key: string]: StringTree };

function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}_.:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function stableTextId(ko: string, en: string): string {
  let hash = 0x811c9dc5;
  const source = `${ko}\u0000${en}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `copy-${hash.toString(36)}`;
}

/**
 * Registers an existing ko/en UI copy pair with the global i18n runtime and returns the stable key.
 *
 * This is intentionally module-evaluation friendly: legacy components can migrate away from local
 * legacy Korean/English conditional branches without flashing raw keys on the first render. English is
 * also opted into the runtime translation source set so every other selected locale can reuse the
 * existing authored English copy as its canonical machine-translation source.
 */
export function defineBilingualText(
  scope: string,
  id: string,
  ko: string,
  en: string,
): string {
  const normalizedScope = normalizeKeyPart(scope);
  const normalizedId = normalizeKeyPart(id);
  if (!normalizedScope || !normalizedId) {
    throw new Error(`Invalid bilingual i18n key: ${scope}/${id}`);
  }

  const key = `legacyUi.${normalizedScope}.${normalizedId}`;
  registerI18nLocaleEntries("ko", { [key]: ko });
  registerI18nEnglishSourceEntries({ [key]: en });
  return key;
}

/** Registers a static authored UI literal with its real source language. */
export function defineStaticSourceText(
  scope: string,
  sourceLocale: string,
  source: string,
): string {
  const normalizedScope = normalizeKeyPart(scope);
  const normalizedSourceLocale = normalizeLocaleCode(sourceLocale);
  if (!normalizedScope || !normalizedSourceLocale) {
    throw new Error(`Invalid static i18n source: ${scope}/${sourceLocale}`);
  }
  const id = stableTextId(normalizedSourceLocale, source);
  const key = `staticUi.${normalizedScope}.${normalizedSourceLocale}.${id}`;
  registerI18nRuntimeSourceEntries(normalizedSourceLocale, { [key]: source });
  return key;
}

export function translateStaticSourceTextForLocale(
  locale: string,
  sourceLocale: string,
  scope: string,
  source: string,
): string {
  const normalized = resolveUiLocale(locale);
  const normalizedSource = resolveUiLocale(sourceLocale);
  if (normalized.split("-")[0] === normalizedSource.split("-")[0]) return source;
  const key = defineStaticSourceText(scope, normalizedSource, source);
  scheduleRuntimeLocaleTranslation(normalized);
  return resolveTranslationForDisplay(normalized, key);
}

export function translateCurrentStaticSourceText(
  scope: string,
  sourceLocale: string,
  source: string,
): string {
  return translateStaticSourceTextForLocale(getCurrentUiLocale(), sourceLocale, scope, source);
}

/** Content-addressed convenience for large legacy surfaces where naming hundreds of keys adds noise. */
export function defineBilingualAutoText(scope: string, ko: string, en: string): string {
  return defineBilingualText(scope, stableTextId(ko, en), ko, en);
}

export function defineBilingualMap<
  const T extends Readonly<Record<string, BilingualText>>,
>(
  scope: string,
  entries: T,
): { readonly [K in keyof T]: string } {
  const mapped: Record<string, string> = {};
  for (const [id, value] of Object.entries(entries)) {
    mapped[id] = defineBilingualText(scope, id, value.ko, value.en);
  }
  return Object.freeze(mapped) as { readonly [K in keyof T]: string };
}

/** Small-diff bridge for legacy maps shaped as `{ ko, en }`. */
export function translateBilingualText(
  t: TranslationResolver,
  scope: string,
  value: BilingualText,
): string {
  return t(defineBilingualAutoText(scope, value.ko, value.en));
}

function translateParallelNode(
  t: TranslationResolver,
  scope: string,
  ko: StringTree,
  en: StringTree,
  path: readonly string[],
): StringTree {
  if (typeof ko === "string" && typeof en === "string") {
    const keyScope = path.length > 0 ? `${scope}.${path.join(".")}` : scope;
    return t(defineBilingualAutoText(keyScope, ko, en));
  }

  if (Array.isArray(ko) && Array.isArray(en)) {
    if (ko.length !== en.length) throw new Error(`Mismatched bilingual arrays at ${scope}.${path.join(".")}`);
    return ko.map((entry, index) =>
      translateParallelNode(t, scope, entry, en[index] as StringTree, [...path, String(index)]),
    );
  }

  if (
    typeof ko === "object" && ko !== null && !Array.isArray(ko)
    && typeof en === "object" && en !== null && !Array.isArray(en)
  ) {
    const koRecord = ko as Readonly<Record<string, StringTree>>;
    const enRecord = en as Readonly<Record<string, StringTree>>;
    const keys = Object.keys(koRecord);
    if (keys.length !== Object.keys(enRecord).length || keys.some((key) => !(key in enRecord))) {
      throw new Error(`Mismatched bilingual objects at ${scope}.${path.join(".")}`);
    }
    return Object.fromEntries(
      keys.map((key) => [
        key,
        translateParallelNode(t, scope, koRecord[key] as StringTree, enRecord[key] as StringTree, [...path, key]),
      ]),
    ) as { readonly [key: string]: StringTree };
  }

  throw new Error(`Mismatched bilingual copy at ${scope}.${path.join(".")}`);
}

/**
 * Localizes a legacy `COPY = { ko: {...}, en: {...} }` tree without rewriting its authored data.
 * Every string leaf is registered as an i18n source and resolved through the active global locale.
 */
export function translateParallelBilingualCopy<const T extends StringTree>(
  t: TranslationResolver,
  scope: string,
  branches: Readonly<{ readonly ko: T; readonly en: T }>,
): T {
  return translateParallelNode(t, scope, branches.ko, branches.en, []) as T;
}


const scheduledRuntimeLocales = new Set<string>();

/** Normalizes any configured language without collapsing non-ko/en languages to English. */
export function resolveUiLocale(language: string): string {
  return normalizeLocaleCode(language) || "en";
}

/** Returns the currently selected app locale. */
export function getCurrentUiLocale(): string {
  return resolveUiLocale(getLang());
}

function scheduleRuntimeLocaleTranslation(locale: string): void {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized || scheduledRuntimeLocales.has(normalized)) return;
  scheduledRuntimeLocales.add(normalized);
  queueMicrotask(() => {
    scheduledRuntimeLocales.delete(normalized);
    void loadRuntimeTranslationBundle(normalized);
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function translateCurrentPair(
  locale: string,
  scope: string,
  ko: unknown,
  en: unknown,
  path: readonly string[] = [],
): unknown {
  const normalized = normalizeLocaleCode(locale) || "en";
  const root = normalized.split("-")[0];
  if (root === "ko") return ko;
  if (ko === en) return en;

  if (typeof ko === "string" && typeof en === "string") {
    const keyScope = path.length > 0 ? `${scope}.${path.join(".")}` : scope;
    const key = defineBilingualAutoText(keyScope, ko, en);
    if (root !== "en") scheduleRuntimeLocaleTranslation(normalized);
    return resolveTranslationForDisplay(normalized, key);
  }

  if (Array.isArray(ko) && Array.isArray(en)) {
    const length = Math.max(ko.length, en.length);
    return Array.from({ length }, (_, index) => {
      if (index >= ko.length) return en[index];
      if (index >= en.length) return root === "ko" ? ko[index] : undefined;
      return translateCurrentPair(normalized, scope, ko[index], en[index], [...path, String(index)]);
    });
  }

  if (isRecord(ko) && isRecord(en)) {
    const keys = new Set([...Object.keys(ko), ...Object.keys(en)]);
    return Object.fromEntries([...keys].map((key) => {
      if (!(key in ko)) return [key, en[key]];
      if (!(key in en)) return [key, root === "ko" ? ko[key] : undefined];
      return [key, translateCurrentPair(normalized, scope, ko[key], en[key], [...path, key])];
    }));
  }

  return root === "ko" ? ko : en;
}

/**
 * Resolves a legacy Korean/English pair through the active global locale. Values can be strings,
 * arrays or plain objects; matching non-text fields are preserved while differing string leaves
 * are registered as runtime i18n sources.
 */
export function translateBilingualValueForLocale<T>(
  locale: string,
  scope: string,
  ko: T,
  en: T,
): T {
  return translateCurrentPair(resolveUiLocale(locale), scope, ko, en) as T;
}

export function translateCurrentBilingualValue<T>(
  scope: string,
  ko: T,
  en: T,
): T {
  return translateBilingualValueForLocale(getCurrentUiLocale(), scope, ko, en);
}

/**
 * Compatibility bridge for legacy records addressed as `copy[locale]`. Existing authored values
 * for the exact current locale win; otherwise `{ko,en}` branches are resolved through i18n.
 */
export function translateLocaleBranchForLocale<T>(
  locale: string,
  scope: string,
  branches: Readonly<Record<string, T>>,
): T;
export function translateLocaleBranchForLocale<T>(
  locale: string,
  scope: string,
  branches: Readonly<Record<string, T>> | null | undefined,
): T | undefined;
export function translateLocaleBranchForLocale<T>(
  locale: string,
  scope: string,
  branches: Readonly<Record<string, T>> | null | undefined,
): T | undefined {
  if (!branches) return undefined;
  const normalized = resolveUiLocale(locale);
  const root = normalized.split("-")[0];
  const authored = branches[normalized] ?? branches[root];
  if (authored !== undefined && root !== "ko" && root !== "en") return authored;
  if (branches.ko !== undefined && branches.en !== undefined) {
    return translateCurrentPair(normalized, scope, branches.ko, branches.en) as T;
  }
  return (authored ?? branches.en ?? branches.ko) as T;
}

export function translateCurrentLocaleBranch<T>(
  scope: string,
  branches: Readonly<Record<string, T>>,
): T;
export function translateCurrentLocaleBranch<T>(
  scope: string,
  branches: Readonly<Record<string, T>> | null | undefined,
): T | undefined;
export function translateCurrentLocaleBranch<T>(
  scope: string,
  branches: Readonly<Record<string, T>> | null | undefined,
): T | undefined {
  return translateLocaleBranchForLocale(getCurrentUiLocale(), scope, branches);
}

export function formatI18nTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{([\p{L}\p{N}_.-]+)\}/gu, (token, name: string) => {
    const value = values[name];
    return value === undefined ? token : String(value);
  });
}
