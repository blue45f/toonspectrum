import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import type { EventCopy } from "./event-catalog";

export function useMarketingEventText() {
  useBilingualI18nRevision();
  return (copy: EventCopy): string =>
    translateBilingualValueForActiveLocale(
      "marketing-events",
      copy.ko,
      copy.en,
    );
}
