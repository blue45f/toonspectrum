import { registerI18nLocaleEntries } from "@/lib/i18n";

export const STUDIO_I18N_ASSET_LOCALES = ["ko", "en"] as const;
export const STUDIO_I18N_MAX_ASSET_CHARACTERS = 512_000;
export const STUDIO_I18N_MAX_ENTRY_COUNT = 2_000;
export const STUDIO_I18N_MAX_VALUE_CHARACTERS = 4_000;

export type StudioI18nAssetLocale =
  (typeof STUDIO_I18N_ASSET_LOCALES)[number];

export type StudioI18nDictionary = Readonly<Record<string, string>>;

export interface StudioI18nLoaderOptions {
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
}

const pendingLoads = new Map<StudioI18nAssetLocale, Promise<void>>();

function normalizedBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function studioI18nAssetUrl(
  locale: StudioI18nAssetLocale,
  baseUrl = import.meta.env.BASE_URL,
): string {
  return `${normalizedBaseUrl(baseUrl)}i18n/studio/${locale}.json`;
}

export function parseStudioI18nDictionary(
  source: string,
): StudioI18nDictionary | null {
  if (source.length === 0 || source.length > STUDIO_I18N_MAX_ASSET_CHARACTERS) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object"
    || parsed === null
    || Array.isArray(parsed)
  ) {
    return null;
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.length > STUDIO_I18N_MAX_ENTRY_COUNT) {
    return null;
  }
  const dictionary: Record<string, string> = Object.create(null);
  for (const [key, value] of entries) {
    if (
      !key.startsWith("studio.")
      || typeof value !== "string"
      || value.length === 0
      || value.length > STUDIO_I18N_MAX_VALUE_CHARACTERS
    ) {
      return null;
    }
    dictionary[key] = value;
  }
  return Object.freeze(dictionary);
}

async function loadStudioI18nLocale(
  locale: StudioI18nAssetLocale,
  options: StudioI18nLoaderOptions,
): Promise<void> {
  const existing = pendingLoads.get(locale);
  if (existing) return existing;

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("Studio translation assets require the Fetch API.");
  }

  const job = (async () => {
    const response = await fetchImpl(
      studioI18nAssetUrl(locale, options.baseUrl),
      {
        cache: "force-cache",
        credentials: "same-origin",
      },
    );
    if (!response.ok) {
      throw new Error(
        `Studio translation asset failed to load (${locale}, ${response.status}).`,
      );
    }
    const dictionary = parseStudioI18nDictionary(await response.text());
    if (!dictionary) {
      throw new Error(`Studio translation asset is invalid (${locale}).`);
    }
    registerI18nLocaleEntries(locale, dictionary);
  })();

  pendingLoads.set(locale, job);
  try {
    await job;
  } catch (error) {
    pendingLoads.delete(locale);
    throw error;
  }
}

/**
 * Loads Korean and English in parallel before React commits either Studio
 * surface. Keeping both resident also makes an in-editor language switch
 * synchronous and prevents label flicker.
 */
export async function loadStudioI18nDictionaries(
  options: StudioI18nLoaderOptions = {},
): Promise<void> {
  await Promise.all(
    STUDIO_I18N_ASSET_LOCALES.map((locale) =>
      loadStudioI18nLocale(locale, options)
    ),
  );
}
