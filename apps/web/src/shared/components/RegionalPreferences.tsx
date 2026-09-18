import { useMemo } from "react";

import { getLanguageOptions } from "@/shared/lib/i18n";
import {
  REGION_COUNTRY_SUGGESTIONS,
  REGION_CURRENCY_SUGGESTIONS,
  REGION_TIMEZONE_SUGGESTIONS,
  resolveRegionPolicy,
  type RegionSettings,
} from "@/shared/lib/region-settings";

type RegionField = "country" | "language" | "currency" | "timezone";
type RegionalPreferencesProps = {
  value: RegionSettings;
  disabled?: boolean;
  saved?: boolean;
  message?: string | null;
  onChange: (field: RegionField, nextValue: string) => void;
};
export function RegionalPreferences(props: RegionalPreferencesProps) {
  const { value, disabled, saved, message, onChange } = props;
  const korean = value.language.toLowerCase().startsWith("ko");
  const languageOptions = useMemo(
    () => getLanguageOptions(value.language),
    [value.language],
  );
  const policy = resolveRegionPolicy(value);
  const countryOptions = useMemo(
    () => [...new Set([value.country, ...REGION_COUNTRY_SUGGESTIONS])],
    [value.country],
  );
  const currencyOptions = useMemo(
    () => [...new Set([value.currency, ...REGION_CURRENCY_SUGGESTIONS])],
    [value.currency],
  );
  const timezoneOptions = useMemo(
    () => [...new Set([value.timezone, ...REGION_TIMEZONE_SUGGESTIONS])],
    [value.timezone],
  );

  return (
    <section className="rounded-2xl border border-line bg-panel/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {korean ? "지역 및 형식" : "Region & formats"}
          </h2>
        </div>
      </div>
      <p className="mt-1 text-sm text-fg-2">
        {korean
          ? "국가, 언어, 통화, 시간대를 각각 독립적으로 설정합니다."
          : "Country, language, currency, and time zone are stored independently."}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span>{korean ? "국가/지역" : "Country / region"}</span>
          <select
            value={value.country}
            disabled={disabled}
            onChange={(event) => onChange("country", event.target.value)}
          >
            {countryOptions.map((country) => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>{korean ? "언어" : "Language"}</span>
          <select
            value={value.language}
            disabled={disabled}
            onChange={(event) => onChange("language", event.target.value)}
          >
            {languageOptions.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>{korean ? "통화" : "Currency"}</span>
          <select
            value={value.currency}
            disabled={disabled}
            onChange={(event) => onChange("currency", event.target.value)}
          >
            {currencyOptions.map((currency) => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>{korean ? "시간대" : "Time zone"}</span>
          <select
            value={value.timezone}
            disabled={disabled}
            onChange={(event) => onChange("timezone", event.target.value)}
          >
            {timezoneOptions.map((timezone) => (
              <option key={timezone} value={timezone}>{timezone}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-4 text-xs text-fg-3">
        {korean ? "적용 정책" : "Policy"}: {policy.key} · {policy.privacy.regime} · {policy.commerce.taxMode}
      </p>
      {message ? <p className="mt-1 text-xs text-fg-2">{message}</p> : null}
      {saved ? <p className="mt-1 text-xs text-good">{korean ? "저장됨" : "Saved"}</p> : null}
    </section>
  );
}
