import { useCallback } from "react";

import {
  getLang,
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
  useT,
} from "./i18n-core";

export interface BilingualText {
  readonly ko: string;
  readonly en: string;
}

export type TranslationResolver = (key: string) => string;

type StringTree = string | readonly StringTree[] | { readonly [key: string]: StringTree };

type TranslatedStringTree<T extends StringTree> =
  T extends string ? string
    : T extends readonly (infer U extends StringTree)[] ? readonly TranslatedStringTree<U>[]
      : T extends { readonly [key: string]: StringTree }
        ? { readonly [K in keyof T]: T[K] extends StringTree ? TranslatedStringTree<T[K]> : never }
        : never;

function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}_.:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

const registeredBilingualKeys = new Set<string>();
let translationRevisionScheduled = false;

function scheduleTranslationRevision(): void {
  if (translationRevisionScheduled) return;
  translationRevisionScheduled = true;
  queueMicrotask(() => {
    translationRevisionScheduled = false;
    triggerTranslationBundleUpdate();
  });
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
 * `locale === "ko" ? ... : ...` branches without flashing raw keys on the first render. English is
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
  if (!registeredBilingualKeys.has(key)) {
    registerI18nLocaleEntries("ko", { [key]: ko });
    registerI18nEnglishSourceEntries({ [key]: en });
    registeredBilingualKeys.add(key);
    scheduleTranslationRevision();
  }
  return key;
}

/** Content-addressed convenience for large legacy surfaces where naming hundreds of keys adds noise. */
export function defineBilingualAutoText(scope: string, ko: string, en: string): string {
  return defineBilingualText(scope, stableTextId(ko, en), ko, en);
}

/** Current BCP-47 locale for Intl/date/number metadata migrated from ko/en branches. */
export function getActiveI18nLocale(): string {
  return getLang();
}

/** Resolves an authored ko/en pair through the currently selected global locale. */
export function translateBilingualPair(
  scope: string,
  ko: string,
  en: string,
): string {
  return resolveTranslationForDisplay(
    getLang(),
    defineBilingualAutoText(scope, ko, en),
  );
}

function translateBilingualArrayValue(
  scope: string,
  ko: readonly unknown[],
  en: readonly unknown[],
): readonly unknown[] | null {
  if (ko.length !== en.length) return null;
  const translated: unknown[] = [];
  for (let index = 0; index < ko.length; index += 1) {
    const koValue = ko[index];
    const enValue = en[index];
    if (Object.is(koValue, enValue)) {
      translated.push(koValue);
      continue;
    }
    if (typeof koValue === "string" && typeof enValue === "string") {
      translated.push(translateBilingualPair(`${scope}.${index}`, koValue, enValue));
      continue;
    }
    if (Array.isArray(koValue) && Array.isArray(enValue)) {
      const nested = translateBilingualArrayValue(`${scope}.${index}`, koValue, enValue);
      if (nested === null) return null;
      translated.push(nested);
      continue;
    }
    return null;
  }
  return translated;
}

function translateBilingualObjectValue(
  scope: string,
  ko: Readonly<Record<string, unknown>>,
  en: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | null {
  const koKeys = Object.keys(ko);
  if (koKeys.length !== Object.keys(en).length || koKeys.some((key) => !(key in en))) return null;
  const translated: Record<string, unknown> = {};
  for (const key of koKeys) {
    const koValue = ko[key];
    const enValue = en[key];
    if (Object.is(koValue, enValue)) {
      translated[key] = koValue;
      continue;
    }
    if (typeof koValue === "string" && typeof enValue === "string") {
      translated[key] = translateBilingualPair(`${scope}.${key}`, koValue, enValue);
      continue;
    }
    if (Array.isArray(koValue) && Array.isArray(enValue)) {
      const nested = translateBilingualArrayValue(`${scope}.${key}`, koValue, enValue);
      if (nested === null) return null;
      translated[key] = nested;
      continue;
    }
    if (
      koValue !== null && enValue !== null
      && typeof koValue === "object" && typeof enValue === "object"
      && !Array.isArray(koValue) && !Array.isArray(enValue)
    ) {
      const nested = translateBilingualObjectValue(
        `${scope}.${key}`,
        koValue as Readonly<Record<string, unknown>>,
        enValue as Readonly<Record<string, unknown>>,
      );
      if (nested === null) return null;
      translated[key] = nested;
      continue;
    }
    return null;
  }
  return translated;
}

/**
 * Compatibility bridge for dynamic authored pairs such as `labelKo/labelEn` and `tasksKo/tasksEn`.
 * Strings and string arrays join the global translation pipeline. Other value shapes retain the
 * authored Korean/English branch instead of sending arbitrary structured/user data externally.
 */
export function translateBilingualValueForActiveLocale<T>(
  scope: string,
  ko: T,
  en: T,
): T {
  if (typeof ko === "string" && typeof en === "string") {
    return translateBilingualPair(scope, ko, en) as T;
  }
  if (Array.isArray(ko) && Array.isArray(en)) {
    const translated = translateBilingualArrayValue(scope, ko, en);
    if (translated !== null) return translated as T;
  }
  if (
    ko !== null && en !== null
    && typeof ko === "object" && typeof en === "object"
    && !Array.isArray(ko) && !Array.isArray(en)
  ) {
    const translated = translateBilingualObjectValue(
      scope,
      ko as Readonly<Record<string, unknown>>,
      en as Readonly<Record<string, unknown>>,
    );
    if (translated !== null) return translated as T;
  }
  const root = getLang().split("-")[0]?.toLowerCase();
  return (root === "ko" ? ko : en);
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

/** Resolves a keyed { ko, en } map through the active translator in one pass. */
export function translateBilingualMap<
  const T extends Readonly<Record<string, BilingualText>>,
>(
  t: TranslationResolver,
  scope: string,
  entries: T,
): { readonly [K in keyof T]: string } {
  const keys = defineBilingualMap(scope, entries);
  return Object.fromEntries(
    Object.entries(keys).map(([id, key]) => [id, t(key)]),
  ) as { readonly [K in keyof T]: string };
}

/** Small-diff bridge for legacy maps shaped as `{ ko, en }`. */
export function translateBilingualText(
  t: TranslationResolver,
  scope: string,
  value: BilingualText,
): string {
  if (value.ko === value.en) return value.ko;
  return t(defineBilingualAutoText(scope, value.ko, value.en));
}

/**
 * Hook-friendly adapter for legacy components with many inline Korean/English branches.
 * The returned resolver stays on the global i18n pipeline and rerenders when runtime bundles land.
 */
export function useBilingualLocalizer(scope: string): (ko: string, en: string) => string {
  const t = useT();
  return useCallback(
    (ko: string, en: string) => translateBilingualText(t, scope, { ko, en }),
    [scope, t],
  );
}

function translateParallelNode(
  t: TranslationResolver,
  scope: string,
  ko: StringTree,
  en: StringTree,
  path: readonly string[],
): StringTree {
  if (typeof ko === "string" && typeof en === "string") {
    // Identical branches are locale-invariant tokens (URLs, ids, numbers, brand terms, etc.).
    // Preserve them verbatim instead of registering them as machine-translation sources.
    if (ko === en) return ko;
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
  branches: Readonly<{ readonly ko: T; readonly en: TranslatedStringTree<T> }>,
): TranslatedStringTree<T> {
  return translateParallelNode(t, scope, branches.ko, branches.en as StringTree, []) as TranslatedStringTree<T>;
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

/** Subscribe legacy-migrated surfaces to both locale and async translation bundle changes. */
export function useBilingualI18nRevision(): void {
  useI18n((state) => state.lang);
  useI18n((state) => state.translationBundleRevision);
}
