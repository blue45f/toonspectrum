import { useLocation } from "react-router-dom";

import type { ReactNode } from "react";

/** Identity-bearing legacy URLs must reach the canonical resolver, including invalid/empty values. */
export function StudioHomeEntryRoute({ home, legacy }: { home: ReactNode; legacy: ReactNode }) {
  const { search } = useLocation();
  const query = new URLSearchParams(search);
  if (query.has("id") || query.has("remix") || query.has("mode")) return legacy;
  return home;
}
