import { useId, useRef } from "react";
import { createPortal } from "react-dom";

import { useStudioModalSheet } from "../useStudioModalSheet";
import { studioVirtualSpaceReviewHref } from "../virtual-space/studio-virtual-space-review-invitation";

import type { StudioReviewCaptureSnapshot } from "./studio-review-capture-bridge";

import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const bi = (ko: string, en: string) => translateBilingualValueForActiveLocale("StudioReviewCaptureDialog", ko, en);
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50";

export function StudioReviewCaptureDialog({ open, snapshot, onSave, onRetry, onClose }: {
  readonly open: boolean;
  readonly snapshot: StudioReviewCaptureSnapshot;
  readonly onSave: () => void;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}) {
  useBilingualI18nRevision();
  const id = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.body);
  useStudioModalSheet({ activeKey: open ? `review-capture:${id}` : null, dialogRef, rootRef, onDismiss: onClose,
    resolveInitialFocus: (dialog) => dialog.querySelector<HTMLElement>("[data-autofocus]") });
  if (!open || typeof document === "undefined") return null;
  const busy = ["checking", "saving", "preparing", "capturing", "uploading", "cancelling"].includes(snapshot.phase);
  const status = snapshot.phase === "completed" ? bi("고정 검수본이 준비됐어요.", "Your pinned review is ready.")
    : snapshot.phase === "checking" ? bi("저장된 원고와 현재 편집 내용을 확인하고 있어요.", "Checking the saved source against the editor.")
    : snapshot.phase === "preparing" ? bi("검수 기준 버전을 고정하고 있어요.", "Pinning the source version for this review.")
    : snapshot.phase === "capturing" ? bi("모든 페이지를 현재 해상도로 캡처하고 있어요.", "Capturing every page at the selected export resolution.")
    : snapshot.phase === "uploading" ? bi(`검수 이미지를 저장하고 있어요. ${snapshot.completedPages}/${snapshot.pageCount ?? 0}`,
      `Saving review images. ${snapshot.completedPages}/${snapshot.pageCount ?? 0}`)
    : snapshot.phase === "saving" ? bi("기존 저장 절차를 완료하고 원고를 다시 확인하고 있어요.", "Finishing the existing save flow and checking the source again.")
    : snapshot.phase === "cancelling" ? bi("취소 결과를 확인하고 있어요.", "Confirming cancellation.")
    : snapshot.phase === "cancel-uncertain" ? bi("취소 응답을 확인하지 못했어요. 같은 요청의 결과를 다시 확인해 주세요.", "Cancellation was not confirmed. Check the same request again.")
    : snapshot.phase === "cleanup-pending" ? bi("검수본 생성은 취소됐고, 임시로 업로드한 이미지 정리가 남아 있어요. 같은 요청으로 정리를 다시 시도할 수 있습니다.",
      "Review creation is cancelled. Temporary uploaded images still need cleanup. Retry cleanup using the same request.")
    : snapshot.phase === "uncertain" ? bi("완료 응답을 확인하지 못했어요. 다시 시도하면 처음 캡처한 이미지와 같은 요청을 사용합니다.", "The result is unconfirmed. Retry uses the original images and the same request.")
    : snapshot.phase === "needs-save" ? snapshot.reason === "unavailable"
      ? bi("공유 가능한 서버 원고가 필요해요. 현재 파일의 저장 화면에서 저장 위치를 확인해 주세요.", "A saved server work is required. Check this file's destination in the existing save flow.")
      : bi("아직 저장하지 않은 변경이 있어요. 저장이 확인된 원고로만 검수본을 만들 수 있습니다.", "There are unsaved changes. A review can be created only after the source save is confirmed.")
    : snapshot.reason === "image-rejected" ? bi("현재 PNG의 크기 또는 색상 형식을 검수 저장소에서 지원하지 않아 중단했어요. 이미지 크기와 해상도는 변경하지 않았습니다.",
      "The review store does not support this PNG size or color format. The image dimensions and resolution were preserved.")
    : snapshot.reason === "changed" ? bi("작업 중 원고나 접근 권한이 변경되어 생성을 중단했어요.", "Creation stopped because the document or access changed.")
    : snapshot.phase === "cancelled" ? bi("검수본 생성을 취소했어요.", "Review creation was cancelled.")
    : bi("검수본을 만들 수 없었어요. 원고 접근 권한과 연결 상태를 확인해 주세요.", "The review could not be created. Check document access and the connection.");
  return createPortal(<div className="fixed inset-0 z-[165] grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`} aria-busy={busy || undefined} data-studio-shortcut-boundary="true"
      tabIndex={-1} className="max-h-[88dvh] w-full max-w-xl overflow-auto rounded-2xl border border-line bg-panel p-5 text-fg shadow-2xl">
      <h2 id={`${id}-title`} className="text-lg font-bold">{bi("저장된 원고로 검수본 만들기", "Create a review from the saved source")}</h2>
      <p id={`${id}-description`} className="mt-2 text-sm leading-6 text-fg-3">{bi(
        "저장된 원고 버전과 모든 페이지의 PNG 이미지를 함께 고정합니다. 이후 편집해도 이 검수본은 바뀌지 않아요.",
        "Pin the saved source version and PNG images of every page. Later edits do not change this review.")}</p>
      {snapshot.title ? <p className="mt-4 break-words text-sm font-semibold">{snapshot.title}
        {snapshot.sourceRevision !== null ? ` · v${snapshot.sourceRevision}` : ""}
        {snapshot.pageCount !== null ? ` · ${snapshot.pageCount} ${bi("페이지", "pages")}` : ""}</p> : null}
      <p role={snapshot.phase === "failed" ? "alert" : "status"} aria-live="polite" className="mt-4 rounded-xl border border-line bg-card p-3 text-sm leading-6">{status}</p>
      {snapshot.subject ? <p className="mt-3 text-sm text-fg-3">{bi("검수 담당자는 작품 소유자로 지정됩니다. 가상 스튜디오에서는 이 고정 버전을 함께 검토하도록 초대할 수 있어요.",
        "The work owner is designated as reviewer. In Virtual Studio, you can invite others to discuss this pinned version.")}</p> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {snapshot.phase === "needs-save" ? <button type="button" data-autofocus className={`${button} bg-accent text-on-accent`} onClick={onSave}>{bi("저장 후 다시 확인", "Save and check again")}</button> : null}
        {snapshot.canRetry ? <button type="button" data-autofocus className={button} onClick={onRetry}>{snapshot.phase === "cleanup-pending"
          ? bi("임시 이미지 정리 재시도", "Retry image cleanup")
          : snapshot.phase === "cancel-uncertain" ? bi("취소 결과 다시 확인", "Check cancellation") : bi("같은 요청 다시 확인", "Retry this request")}</button> : null}
        {snapshot.subject ? <>
          <a className={`${button} bg-accent text-on-accent`} href={studioVirtualSpaceReviewHref(snapshot.subject)}>{bi("검수본 보기", "View pinned review")}</a>
          <a className={button} href={`/studio/p/${encodeURIComponent(snapshot.subject.workId)}/space`}>{bi("가상 스튜디오에서 초대", "Invite from Virtual Studio")}</a>
        </> : null}
        <button type="button" className={button} disabled={snapshot.phase === "cancelling"} onClick={onClose}>
          {busy || snapshot.phase === "uncertain" ? bi("생성 취소", "Cancel creation") : bi("닫기", "Close")}
        </button>
      </div>
    </section>
  </div>, document.body);
}
