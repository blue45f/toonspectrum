export const REGION_SETTINGS_VERSION = 1 as const;

export interface RegionSettings {
  version: typeof REGION_SETTINGS_VERSION;
  country: string;
  language: string;
  currency: string;
  timezone: string;
  updatedAt: string;
}

export type RegionSettingsPatch = Partial<Pick<
  RegionSettings,
  "country" | "language" | "currency" | "timezone"
>>;

export const REGION_COUNTRY_SUGGESTIONS = [
  "KR", "US", "JP", "CN", "TW", "HK", "SG", "GB", "DE", "FR",
  "CA", "AU", "IN", "BR", "MX", "ES", "IT", "NL", "SE", "NZ",
] as const;

export const REGION_CURRENCY_SUGGESTIONS = [
  "KRW", "USD", "JPY", "EUR", "GBP", "CNY", "TWD", "HKD", "SGD",
  "CAD", "AUD", "INR", "BRL", "MXN",
] as const;
export const REGION_TIMEZONE_SUGGESTIONS = [
  "Asia/Seoul", "Asia/Tokyo", "Asia/Shanghai", "Asia/Taipei",
  "Asia/Hong_Kong", "Asia/Singapore", "Asia/Kolkata", "Europe/London",
  "Europe/Paris", "Europe/Berlin", "America/New_York", "America/Chicago",
  "America/Denver", "America/Los_Angeles", "America/Toronto",
  "America/Sao_Paulo", "Australia/Sydney", "Pacific/Auckland", "UTC",
] as const;

const COUNTRY_RE = /^[A-Z]{2}$/u;
const CURRENCY_RE = /^[A-Z]{3}$/u;
const ROOT_COUNTRY: Readonly<Record<string, string>> = {
  ko: "KR", ja: "JP", zh: "CN", en: "US", de: "DE", fr: "FR",
  es: "ES", it: "IT", pt: "BR", hi: "IN",
};
const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  KR: "KRW", US: "USD", JP: "JPY", CN: "CNY", TW: "TWD", HK: "HKD",
  SG: "SGD", GB: "GBP", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR",
  NL: "EUR", CA: "CAD", AU: "AUD", IN: "INR", BR: "BRL", MX: "MXN",
  SE: "SEK", NZ: "NZD",
};

function validLanguage(value: string): boolean {
  try { return Intl.getCanonicalLocales(value).length > 0; } catch { return false; }
}
export function isSupportedTimeZone(value: string): boolean {
  if (value === "UTC") return true;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}
function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function parseRegionSettings(value: unknown): RegionSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const country = typeof row.country === "string"
    ? row.country.trim().toUpperCase()
    : "";
  const language = typeof row.language === "string"
    ? row.language.trim().toLowerCase()
    : "";
  const currency = typeof row.currency === "string"
    ? row.currency.trim().toUpperCase()
    : "";
  const timezone = typeof row.timezone === "string" ? row.timezone.trim() : "";
  const updatedAt = normalizeTimestamp(row.updatedAt);
  if (row.version !== REGION_SETTINGS_VERSION) return null;
  if (!COUNTRY_RE.test(country) || !validLanguage(language)) return null;
  if (!CURRENCY_RE.test(currency) || !isSupportedTimeZone(timezone)) return null;
  if (!updatedAt) return null;
  return {
    version: REGION_SETTINGS_VERSION,
    country,
    language,
    currency,
    timezone,
    updatedAt,
  };
}
function inferCountry(locale: string): string {
  try {
    const parsed = new Intl.Locale(locale).maximize();
    const region = parsed.region?.toUpperCase();
    if (region && COUNTRY_RE.test(region)) return region;
  } catch {
    // Fall through to the language-root map.
  }
  const root = locale.toLowerCase().split("-")[0] ?? "";
  return ROOT_COUNTRY[root] ?? "US";
}

export function createDetectedRegionSettings(input: {
  language: string;
  locale?: string | null;
  timezone?: string | null;
  now?: Date;
}): RegionSettings {
  const language = validLanguage(input.language)
    ? input.language.trim().toLowerCase()
    : "en";
  const country = inferCountry(input.locale?.trim() || language);
  const timezone = input.timezone && isSupportedTimeZone(input.timezone)
    ? input.timezone
    : "UTC";
  return {
    version: REGION_SETTINGS_VERSION,
    country,
    language,
    currency: COUNTRY_CURRENCY[country] ?? "USD",
    timezone,
    updatedAt: (input.now ?? new Date()).toISOString(),
  };
}

export function patchRegionSettings(
  current: RegionSettings,
  patch: RegionSettingsPatch,
  now: Date = new Date(),
): RegionSettings | null {
  return parseRegionSettings(Object.assign({}, current, patch, {
    version: REGION_SETTINGS_VERSION,
    updatedAt: now.toISOString(),
  }));
}
export function chooseNewestRegionSettings(
  left: RegionSettings | null | undefined,
  right: RegionSettings | null | undefined,
): RegionSettings | null {
  if (!left) return right ?? null;
  if (!right) return left;
  return Date.parse(left.updatedAt) >= Date.parse(right.updatedAt) ? left : right;
}

export type PrivacyRegime = "baseline" | "pipa" | "us-state-aware" | "appi";
export type AgeVerificationMode = "standard" | "local";
export type TaxMode =
  | "baseline"
  | "kr-vat"
  | "us-sales-tax"
  | "jp-consumption-tax";
export interface RegionPolicy {
  key: "DEFAULT" | "KR" | "US" | "JP";
  auth: { ageVerification: AgeVerificationMode };
  privacy: {
    regime: PrivacyRegime;
    dataExport: true;
    accountDeletion: true;
  };
  commerce: {
    defaultCurrency: string;
    taxMode: TaxMode;
  };
  content: { matureContent: "age-gated" };
  discovery: { localeAwareRanking: true };
}

const BASE_POLICY: RegionPolicy = {
  key: "DEFAULT",
  auth: { ageVerification: "standard" },
  privacy: { regime: "baseline", dataExport: true, accountDeletion: true },
  commerce: { defaultCurrency: "USD", taxMode: "baseline" },
  content: { matureContent: "age-gated" },
  discovery: { localeAwareRanking: true },
};

const REGION_POLICIES: Readonly<Record<string, RegionPolicy>> = {
  KR: {
    ...BASE_POLICY,
    key: "KR",
    auth: { ageVerification: "local" },
    privacy: { regime: "pipa", dataExport: true, accountDeletion: true },
    commerce: { defaultCurrency: "KRW", taxMode: "kr-vat" },
  },
  US: {
    ...BASE_POLICY,
    key: "US",
    privacy: { regime: "us-state-aware", dataExport: true, accountDeletion: true },
    commerce: { defaultCurrency: "USD", taxMode: "us-sales-tax" },
  },
  JP: {
    ...BASE_POLICY,
    key: "JP",
    privacy: { regime: "appi", dataExport: true, accountDeletion: true },
    commerce: { defaultCurrency: "JPY", taxMode: "jp-consumption-tax" },
  },
};

export function resolveRegionPolicy(
  settings: Pick<RegionSettings, "country">,
): RegionPolicy {
  return REGION_POLICIES[settings.country.toUpperCase()] ?? BASE_POLICY;
}

export function formatRegionCurrency(
  value: number,
  settings: RegionSettings,
): string {
  return new Intl.NumberFormat(settings.language, {
    style: "currency",
    currency: settings.currency,
  }).format(value);
}
export function formatRegionDateTime(
  value: Date | number,
  settings: RegionSettings,
): string {
  return new Intl.DateTimeFormat(settings.language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: settings.timezone,
  }).format(value);
}
