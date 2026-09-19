import { useEffect, useRef, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getStudioVirtualSpaceReviewPreview, type StudioVirtualSpaceReviewPreview, type StudioVirtualSpaceReviewPreviews } from "./studio-virtual-space-review-preview";
import type { StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";

function ReviewImage({ preview, label }: { readonly preview: StudioVirtualSpaceReviewPreview; readonly label: string }) {
  const bt = useBilingual("StudioPinnedReviewPreviewImage");
  const [source, setSource] = useState(preview.url);
  const [failed, setFailed] = useState(false);
  const loaded = useRef(false);
  // Keep already decoded immutable pixels while fresh ACL reads renew their visibility lease.
  // Only not-yet-loaded images need the renewed URL, avoiding repeated image downloads.
  useEffect(() => { if (!loaded.current) { setSource(preview.url); setFailed(false); } }, [preview.url]);
  return <figure className="mt-3">
    <img src={source} alt={label} loading="lazy" referrerPolicy="no-referrer" className="max-h-[70vh] w-full rounded-lg object-contain"
      onLoad={() => { loaded.current = true; setFailed(false); }} onError={() => setFailed(true)} />
    {failed ? <figcaption className="text-xs text-fg-3">{bt("이미지를 불러오지 못했어요. 미리보기를 다시 확인해 주세요.", "The image could not be loaded. Check the preview again.")}</figcaption> : null}
  </figure>;
}

export function StudioPinnedReviewPreview({ subject, onRevoked }: {
  readonly subject: StudioVirtualSpaceReviewSubject;
  readonly onRevoked: () => void;
}) {
  const bt = useBilingual("StudioPinnedReviewPreview");
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
      if (document.visibilityState === "hidden") { stopTimers(); setResult(null); return; }
      const next = await getStudioVirtualSpaceReviewPreview(subject, cursor);
      if (disposed || own !== generation) return;
      stopTimers(); setResult(next);
      if (!next.ok) {
        if (next.reason === "access-denied" || next.reason === "closed" || next.reason === "version-mismatch") revoked.current();
        return;
      }
      const ttl = Math.min(...next.previews.map((preview) => preview.expiresAt)) - Date.now();
      if (ttl <= 0) { setResult({ ok: false, reason: "preview-unavailable" }); return; }
      // Renew read authorization while visible. Never auto-retry unavailable/failed reads.
      renew = setTimeout(() => { void load(); }, Math.max(1_000, ttl - 5_000));
      expiry = setTimeout(() => { if (!disposed) setResult(null); }, ttl);
    };
    setResult(null); void load();
    const visibility = () => { void load(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; ++generation; stopTimers(); document.removeEventListener("visibilitychange", visibility); };
  }, [subject, cursor, reload]);
  return <div className="mt-4" aria-label={bt("검수본 미리보기", "Snapshot preview")}>
    {result?.ok ? <>
      {result.previews.map((preview) => <ReviewImage key={preview.sha256} preview={preview} label={bt(`검수 미리보기 ${preview.ordinal + 1}`, `Review preview ${preview.ordinal + 1}`)} />)}
      {cursor ? <button type="button" className="min-h-11 px-3" onClick={() => setCursor(null)}>{bt("처음부터 보기", "Back to first previews")}</button> : null}
      {result.nextCursor ? <button type="button" className="min-h-11 px-3" onClick={() => setCursor(result.nextCursor)}>{bt("다음 미리보기", "Next previews")}</button> : null}
    </> : <p className="text-sm text-fg-3" role="status">{result
      ? bt("이 검수 버전에 연결된 미리보기가 아직 준비되지 않았어요. 검토 기록은 아래에서 확인할 수 있습니다.", "A preview for this exact review version is not ready. Its review notes are available below.")
      : bt("검수 미리보기를 확인 중…", "Checking snapshot previews…")}</p>}
    {result && !result.ok ? <button type="button" className="min-h-11 px-3" onClick={() => setReload((value) => value + 1)}>{bt("미리보기 다시 확인", "Check preview again")}</button> : null}
  </div>;
}
