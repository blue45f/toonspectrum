import { useEffect } from "react";

import {
  preloadStudioI18nCore,
  retryFailedStudioI18nNamespaces,
  scheduleStudioI18nDeferredLoad,
} from "../studio-i18n-priority-loader";

import { useI18n } from "@/shared/lib/i18n-core";

export function useStudioI18nPriorityLoading(): void {
  const lang = useI18n((state) => state.lang);

  useEffect(() => {
    const controller = new AbortController();
    // The route chunk already started this request; namespace deduplication covers the
    // initial locale and a hydrated language change, while partial failures retry without
    // falling back to the legacy full-catalog loader.
    void preloadStudioI18nCore({
      locale: lang,
      signal: controller.signal,
    }).then((report) => retryFailedStudioI18nNamespaces(
      report,
      { locale: lang, signal: controller.signal },
    )).catch(() => undefined);

    const cancelDeferred = scheduleStudioI18nDeferredLoad({
      locale: lang,
      signal: controller.signal,
    });
    return () => {
      cancelDeferred();
      controller.abort();
    };
  }, [lang]);
}
