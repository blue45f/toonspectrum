import { useI18n } from "@/shared/lib/i18n";

import type { EngineeringLocale } from "./engineering-story-content";

export function useEngineeringLocale(): EngineeringLocale {
  const language = useI18n((state) => state.lang);
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}
