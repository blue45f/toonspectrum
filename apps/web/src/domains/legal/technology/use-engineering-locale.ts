

import type { EngineeringLocale } from "./engineering-story-content";
import { getActiveI18nLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";



export function useEngineeringLocale(): EngineeringLocale {
  useBilingualI18nRevision();

  return getActiveI18nLocale();
}
