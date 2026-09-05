import { useEffect, useState } from "react";

import {
  normalizeStudioHybridDccViewportPreferences,
  parseStudioHybridDccViewportPreferences,
  STUDIO_HYBRID_DCC_VIEWPORT_DEFAULTS,
  STUDIO_HYBRID_DCC_VIEWPORT_PREFERENCES_KEY,
  type StudioHybridDccViewportPreferences,
} from "./studio-hybrid-dcc-viewport-interaction";

/** Browser-local UI settings only. Quota/security failures never interrupt a document edit. */
export function useStudioHybridDccViewportPreferences() {
  const [preferences, setPreferences] = useState<StudioHybridDccViewportPreferences>(() => {
    try {
      return parseStudioHybridDccViewportPreferences(
        typeof window === "undefined" ? null : window.localStorage.getItem(STUDIO_HYBRID_DCC_VIEWPORT_PREFERENCES_KEY),
      );
    } catch { return { ...STUDIO_HYBRID_DCC_VIEWPORT_DEFAULTS }; }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(STUDIO_HYBRID_DCC_VIEWPORT_PREFERENCES_KEY, JSON.stringify(preferences));
    } catch { /* The current session remains usable in private/restricted browsers. */ }
  }, [preferences]);
  const patchPreferences = (patch: Partial<StudioHybridDccViewportPreferences>) => {
    setPreferences((current) => normalizeStudioHybridDccViewportPreferences({ ...current, ...patch, version: 1 }));
  };
  return { preferences, patchPreferences, setPreferences };
}
