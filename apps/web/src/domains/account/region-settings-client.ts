import {
  chooseNewestRegionSettings,
  createDetectedRegionSettings,
  parseRegionSettings,
  type RegionSettings,
} from "@/shared/lib/region-settings";

export const REGION_SETTINGS_STORAGE_KEY = "toonspectrum:region-settings:v1";

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function detectBrowserRegionSettings(
  language: string,
  now: Date = new Date(),
): RegionSettings {
  const locale = typeof navigator === "undefined" ? language : navigator.language;
  let timezone = "UTC";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    // UTC remains the portable fallback.
  }
  return createDetectedRegionSettings({ language, locale, timezone, now });
}

export function readLocalRegionSettings(
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
): RegionSettings | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(REGION_SETTINGS_STORAGE_KEY);
    return raw ? parseRegionSettings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeLocalRegionSettings(
  settings: RegionSettings,
  storage: Pick<Storage, "setItem"> | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(REGION_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Local persistence is best-effort; authenticated persistence remains authoritative.
  }
}

function sameSettings(
  left: RegionSettings | null | undefined,
  right: RegionSettings | null | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.version === right.version
    && left.country === right.country
    && left.language === right.language
    && left.currency === right.currency
    && left.timezone === right.timezone
    && left.updatedAt === right.updatedAt;
}

export interface RegionSettingsSyncPlan {
  settings: RegionSettings;
  shouldWriteLocal: boolean;
  shouldPushRemote: boolean;
}
export function planRegionSettingsSync(input: {
  local: RegionSettings | null;
  remote: RegionSettings | null;
  detected: RegionSettings;
}): RegionSettingsSyncPlan {
  const settings =
    chooseNewestRegionSettings(input.local, input.remote)
    ?? input.detected;
  return {
    settings,
    shouldWriteLocal: !sameSettings(input.local, settings),
    shouldPushRemote: !sameSettings(input.remote, settings),
  };
}
