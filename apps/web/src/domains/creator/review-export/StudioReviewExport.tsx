import { StudioReviewExportPreflight } from "./StudioReviewExportPreflight";
import { useLayoutEffect, useRef, useState } from "react";
import { getAuthSessionRevision, getAuthUserId, listeners as sessionListeners } from "@/compat/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceVerifiedReview } from "../virtual-space/studio-virtual-space-review-invitation";
import { prepareStudioReviewExport, StudioReviewExportError, type StudioReviewExportProgress } from "./studio-review-export";

export function StudioReviewExport({ verified }: { readonly verified: StudioVirtualSpaceVerifiedReview }) {
  const bt = useBilingual("StudioReviewExport");
  const [progress, setProgress] = useState<StudioReviewExportProgress | null>(null);
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null), mounted = useRef(false);
  const key = JSON.stringify(verified.subject);
  useLayoutEffect(() => {
    mounted.current = true;
    const cancel = () => { active.current?.abort(); active.current = null; setProgress(null); };
    const hidden = () => { if (document.visibilityState === "hidden") cancel(); };
    sessionListeners.add(cancel); document.addEventListener("visibilitychange", hidden);
    return () => { mounted.current = false; active.current?.abort(); active.current = null;
      sessionListeners.delete(cancel); document.removeEventListener("visibilitychange", hidden); };
  }, [key]);
  if (verified.review.status !== "approved") return null;
  const start = async () => {
    if (active.current || !getAuthUserId() || document.visibilityState === "hidden") return;
    const controller = new AbortController(), session = getAuthSessionRevision(), actor = getAuthUserId();
    active.current = controller; setNotice(""); setProgress({ phase: "reading", completed: 0, total: 0 });
    const isCurrent = () => mounted.current && active.current === controller && !controller.signal.aborted
      && session === getAuthSessionRevision() && actor === getAuthUserId() && document.visibilityState !== "hidden";
    try {
      const { downloadBlob } = await import("../export/studio-export");
      if (!isCurrent()) return;
      const result = await prepareStudioReviewExport(verified.subject, { signal: controller.signal, isCurrent, onProgress: setProgress });
      if (!isCurrent()) return;
      downloadBlob(result.blob, result.fileName);
      setNotice(bt("브라우저에 승인된 검수본의 ZIP 다운로드를 요청했어요.", "The approved review ZIP download was requested in your browser."));
    } catch (error) {
      if (isCurrent()) setNotice(error instanceof StudioReviewExportError && error.reason === "integrity"
        ? bt("저장된 이미지의 내용이나 전체 목록을 확인하지 못했어요. 파일을 저장하지 않았습니다.", "The stored images or complete page list could not be verified. No file was downloaded.")
        : bt("현재 승인과 접근 권한을 확인하지 못했어요. 검토 기록을 새로 확인한 뒤 다시 시도해 주세요.", "Current approval and access could not be verified. Refresh the review before trying again."));
    } finally { if (active.current === controller) { active.current = null; if (mounted.current) setProgress(null); } }
  };
  return <section className="mt-4 space-y-2 rounded-xl border border-line p-3" aria-label={bt("승인된 검수본 저장", "Save approved review images")}>
    <p className="text-sm text-fg-2">{bt("이 검수본에 저장된 원본 이미지와 페이지별 확인 정보를 ZIP으로 저장합니다. 원고를 다시 렌더링하거나 게시하지 않아요.", "Save this review's original stored images and page checksums as a ZIP. This does not re-render or publish the document.")}</p>
    <StudioReviewExportPreflight verified={verified} />
    <div className="flex flex-wrap gap-2">
      <button type="button" className="min-h-11 max-w-full rounded-lg border border-line px-3 text-sm disabled:opacity-50" disabled={Boolean(progress)} onClick={() => { void start(); }}>
        {bt("승인 검수본 ZIP 저장", "Save approved review ZIP")}</button>
      {progress ? <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" onClick={() => {
        active.current?.abort(); active.current = null; setProgress(null); setNotice(bt("파일 준비를 취소했어요.", "File preparation cancelled."));
      }}>{bt("취소", "Cancel")}</button> : null}
    </div>
    {progress ? <p role="status" className="text-sm">{progress.phase === "images" ? bt(`이미지 확인 ${progress.completed}/${progress.total}`, `Checking images ${progress.completed}/${progress.total}`)
      : progress.phase === "archive" ? bt("원본 이미지 묶음을 준비 중…", "Preparing original image archive…")
        : bt("승인과 접근 권한 확인 중…", "Checking approval and access…")}</p> : null}
    {notice ? <p role="status" className="text-sm">{notice}</p> : null}
  </section>;
}
