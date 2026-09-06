import { ADMIN_I18N_NAMESPACES } from "@/shared/lib/i18n-asset-manifest";
import { getLocaleCandidates, registerI18nLocaleEntries, useI18n } from "@/shared/lib/i18n";
import { adminI18nBuiltins } from "./admin-i18n-builtins";

registerI18nLocaleEntries("ko", adminI18nBuiltins.ko);
registerI18nLocaleEntries("en", adminI18nBuiltins.en);

const pendingLoads = new Map<string, Promise<void>>();

export function adminI18nAssetUrl(
  locale: string,
  baseUrl = import.meta.env.BASE_URL,
  namespace = "dashboard",
): string {
  const normBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normBaseUrl}i18n/admin/${namespace}/${locale}.json`;
}

export async function loadAdminI18nLocale(
  locale: string,
  baseUrl = import.meta.env.BASE_URL,
): Promise<void> {
  const candidates = getLocaleCandidates(locale);
  const normalized = candidates[0] || "en";
  const rootLocale = normalized.split("-")[0] || "en";
  if (rootLocale === "ko" || rootLocale === "en") return;

  const assetLocale = candidates.includes("zh-hant") ? "zh-hant" : rootLocale;
  const existing = pendingLoads.get(assetLocale);
  if (existing) return existing;

  const job = (async () => {
    if (typeof fetch !== "function") return;
    const merged: Record<string, string> = {};
    for (const namespace of ADMIN_I18N_NAMESPACES) {
      const response = await fetch(adminI18nAssetUrl(assetLocale, baseUrl, namespace), {
        cache: "force-cache",
        credentials: "same-origin",
      });
      if (!response.ok) continue;
      const dictionary = await response.clone().json();
      if (dictionary && typeof dictionary === "object" && !Array.isArray(dictionary)) {
        Object.assign(merged, dictionary);
      }
    }
    if (Object.keys(merged).length > 0) {
      registerI18nLocaleEntries(assetLocale, merged);
      if (normalized !== assetLocale) registerI18nLocaleEntries(normalized, merged);
      useI18n.setState((state) => ({
        translationBundleRevision: state.translationBundleRevision + 1,
      }));
    }
  })().catch(() => {
    pendingLoads.delete(assetLocale);
  });

  pendingLoads.set(assetLocale, job);
  await job;
}
