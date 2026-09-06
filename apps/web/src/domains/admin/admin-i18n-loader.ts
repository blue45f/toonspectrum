import adminEn from "../../../public/i18n/admin/en.json";
import adminKo from "../../../public/i18n/admin/ko.json";

import {
  getLocaleCandidates,
  registerI18nLocaleEntries,
  useI18n,
} from "@/lib/i18n";

// Synchronously register embedded base dictionaries for instant zero-latency rendering
registerI18nLocaleEntries("ko", adminKo);
registerI18nLocaleEntries("en", adminEn);

const pendingLoads = new Map<string, Promise<void>>();

export function adminI18nAssetUrl(
  locale: string,
  baseUrl = import.meta.env.BASE_URL,
): string {
  const normBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normBaseUrl}i18n/admin/${locale}.json`;
}

export async function loadAdminI18nLocale(
  locale: string,
  baseUrl = import.meta.env.BASE_URL,
): Promise<void> {
  const candidates = getLocaleCandidates(locale);
  const normalized = candidates[0] || "en";
  const rootLocale = normalized.split("-")[0] || "en";

  // Base dictionaries are embedded in this lazy admin chunk. Region variants resolve through the
  // normal candidate chain, so en-US/ko-KR must not issue redundant asset requests.
  if (rootLocale === "ko" || rootLocale === "en") return;

  const assetLocale = candidates.includes("zh-hant") ? "zh-hant" : rootLocale;

  const existing = pendingLoads.get(assetLocale);
  if (existing) return existing;

  const job = (async () => {
    if (typeof fetch !== "function") return;
    const response = await fetch(adminI18nAssetUrl(assetLocale, baseUrl), {
      cache: "force-cache",
      credentials: "same-origin",
    });
    if (response.ok) {
      const dictionary = await response.json();
      if (dictionary && typeof dictionary === "object") {
        registerI18nLocaleEntries(assetLocale, dictionary);
        if (normalized !== assetLocale) {
          registerI18nLocaleEntries(normalized, dictionary);
        }
        useI18n.setState((state) => ({
          translationBundleRevision: state.translationBundleRevision + 1,
        }));
      }
    }
  })().catch(() => {
    // Keep the public loader fail-soft, but never let a rejected request poison the dedupe cache.
    // A later navigation or transient-network recovery must be able to start a fresh request.
    pendingLoads.delete(assetLocale);
  });

  pendingLoads.set(assetLocale, job);
  await job;
}
