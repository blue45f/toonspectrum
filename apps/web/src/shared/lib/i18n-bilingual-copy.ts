import {
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
} from "./i18n-core";

export interface BilingualText {
  readonly ko: string;
  readonly en: string;
}

function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}_.:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
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

export function formatI18nTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{([\p{L}\p{N}_.-]+)\}/gu, (token, name: string) => {
    const value = values[name];
    return value === undefined ? token : String(value);
  });
}
