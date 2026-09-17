import { useCallback } from "react";

import {
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
  registerI18nLocaleEntries("ko", { [key]: ko });
  registerI18nEnglishSourceEntries({ [key]: en });
  return key;
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

/** Concise inline bridge for legacy `locale === "ko" ? ko : en` expressions. */
export function translateBilingual(
  t: TranslationResolver,
  scope: string,
  ko: string,
  en: string,
): string {
  return t(defineBilingualAutoText(scope, ko, en));
}

/** React bridge for incrementally migrating legacy inline bilingual copy. */
export function useBilingual(scope: string): (ko: string, en: string) => string {
  const t = useT();
  return useCallback(
    (ko: string, en: string) => translateBilingual(t, scope, ko, en),
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

export function formatI18nTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{([\p{L}\p{N}_.-]+)\}/gu, (token, name: string) => {
    const value = values[name];
    return value === undefined ? token : String(value);
  });
}
