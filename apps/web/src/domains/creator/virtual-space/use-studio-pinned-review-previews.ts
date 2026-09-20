import { useEffect, useRef, useState } from "react";
import { getStudioVirtualSpaceReviewPreview, type StudioVirtualSpaceReviewPreviews } from "./studio-virtual-space-review-preview";
import type { StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";

/** Signed URLs and decoded-image visibility share the same bounded, renewable read lease. */
export function useStudioPinnedReviewPreviews(subject: StudioVirtualSpaceReviewSubject | null, onRevoked: () => void) {
  const revoked = useRef(onRevoked);
  const [result, setResult] = useState<StudioVirtualSpaceReviewPreviews | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => { revoked.current = onRevoked; }, [onRevoked]);
  useEffect(() => {
    let disposed = false, generation = 0;
    let renew: ReturnType<typeof setTimeout> | undefined, expiry: ReturnType<typeof setTimeout> | undefined;
    const stopTimers = () => { clearTimeout(renew); clearTimeout(expiry); };
    const load = async () => {
      const own = ++generation;
      clearTimeout(renew);
      if (!subject || document.visibilityState === "hidden") { stopTimers(); setResult(null); return; }
      const next = await getStudioVirtualSpaceReviewPreview(subject, cursor);
      if (disposed || own !== generation) return;
      stopTimers(); setResult(next);
      if (!next.ok) {
        if (next.reason === "access-denied" || next.reason === "closed" || next.reason === "version-mismatch") revoked.current();
        return;
      }
      const ttl = Math.min(...next.previews.map((preview) => preview.expiresAt)) - Date.now();
      if (ttl <= 0) { setResult({ ok: false, reason: "preview-unavailable" }); return; }
      renew = setTimeout(() => { void load(); }, Math.max(1_000, ttl - 5_000));
      expiry = setTimeout(() => { if (!disposed) setResult(null); }, ttl);
    };
    setResult(null); void load();
    const visibility = () => { void load(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; ++generation; stopTimers(); document.removeEventListener("visibilitychange", visibility); };
  }, [subject, cursor, reload]);
  return { result, cursor, setCursor, refresh: () => setReload((value) => value + 1) };
}
