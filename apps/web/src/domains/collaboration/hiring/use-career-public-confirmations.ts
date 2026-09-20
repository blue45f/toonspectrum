import { useEffect, useState } from "react";

import { careerConfirmationPublicContent } from "../../../../../../packages/contracts/src/creator-career-confirmation";

import { careerConfirmationClient } from "./career-confirmation-client";

import type { CareerConfirmationPublicSummary } from "../../../../../../packages/contracts/src/creator-career-confirmation";
import type { CreatorCareerPublic } from "../../../../../../packages/contracts/src/creator-hiring";

export type CheckedSummary = CareerConfirmationPublicSummary & { checkedAt: string };
export function useCareerPublicConfirmations(items: CreatorCareerPublic[] | null) {
  const [summaries, setSummaries] = useState<Record<string, CheckedSummary>>({});
  useEffect(() => {
    setSummaries({});
    if (!items?.length) return;
    let stopped = false;
    let focused = true;
    let controller: AbortController | null = null;
    const selected = items.slice(0, 50);
    async function refresh() {
      controller?.abort();
      const c = new AbortController(); controller = c;
      setSummaries({}); // Never carry the previous response through a new check.
      if (!focused || document.visibilityState === "hidden") return;
      try {
        const rows = await careerConfirmationClient.publicSummaries(selected.map((i) => i.id), c.signal);
        const digests = await Promise.all(selected.map(async (i) => {
          const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(careerConfirmationPublicContent(i)));
          return [i.id, Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")] as const;
        }));
        if (stopped || c.signal.aborted) return;
        const now = new Date().toISOString(), expected = new Map(digests);
        setSummaries(Object.fromEntries(rows.filter((r) => expected.get(r.careerId) === r.publicDigest && Date.parse(r.expiresAt) > Date.now()).map((r) => [r.careerId, { ...r, checkedAt: now }])));
      } catch { if (!stopped && !c.signal.aborted) setSummaries({}); }
    }
    const clear = () => { controller?.abort(); setSummaries({}); };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 60_000);
    const visibility = () => { if (document.visibilityState === "hidden") clear(); else void refresh(); };
    const focus = () => { focused = true; void refresh(); };
    const blur = () => { focused = false; clear(); };
    window.addEventListener("focus", focus); window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("career-confirmation-changed", refresh);
    return () => { stopped = true; controller?.abort(); clearInterval(interval); window.removeEventListener("focus", focus); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("career-confirmation-changed", refresh); };
  }, [items]);
  useEffect(() => {
    const expiry = Math.min(...Object.values(summaries).map((s) => Date.parse(s.expiresAt)));
    const delay = expiry - Date.now();
    if (!Number.isFinite(delay) || delay > 60_000) return;
    const timer = setTimeout(() => setSummaries((old) => Object.fromEntries(Object.entries(old).filter(([, s]) => Date.parse(s.expiresAt) > Date.now()))), Math.max(0, delay));
    return () => clearTimeout(timer);
  }, [summaries]);
  return summaries;
}
