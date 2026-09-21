import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceVerifiedReview } from "../virtual-space/studio-virtual-space-review-invitation";

/** Display of the verified input only. prepareStudioReviewExport remains the final authority check. */
export function StudioReviewExportPreflight({ verified }: { readonly verified: StudioVirtualSpaceVerifiedReview }) {
  const bt = useBilingual("StudioReviewExportPreflight");
  const previews = verified.revision.blobRefs?.filter((reference) => reference.role === "preview");
  return <details className="rounded-lg border border-line p-3">
    <summary className="min-h-11 cursor-pointer text-sm font-semibold">{bt("전달 기준·포함 범위 확인", "Check delivery source and contents")}</summary>
    <dl className="mt-2 grid min-w-0 gap-2 text-xs sm:grid-cols-[auto_1fr]">
      <dt className="font-semibold">{bt("고정 검수본", "Pinned review")}</dt><dd className="break-all">{verified.subject.reviewId}</dd>
      <dt className="font-semibold">{bt("출력 기준 버전", "Source revision")}</dt><dd className="break-all">{verified.subject.revisionId}</dd>
      <dt className="font-semibold">{bt("원본 내용 식별값", "Source content digest")}</dt><dd className="break-all font-mono">{verified.subject.rootGraphHash}</dd>
      <dt className="font-semibold">{bt("승인 기록 시각", "Recorded approval time")}</dt><dd>{verified.review.decidedAt ? <time dateTime={verified.review.decidedAt}>{verified.review.decidedAt}</time> : bt("확인 필요", "Needs verification")}</dd>
      <dt className="font-semibold">{bt("입력 이미지", "Input images")}</dt><dd>{previews ? bt(`${previews.length}개 · 전체 목록과 각 파일을 다시 검증합니다.`, `${previews.length} images; the complete list and every file will be reverified.`) : bt("목록 확인 필요", "Image list needs verification")}</dd>
      <dt className="font-semibold">{bt("출력 방식", "Output profile")}</dt><dd>{bt("저장된 검수 이미지 원본 + SHA-256 목록을 ZIP으로 묶기 · 크기·색상·플랫폼 규격 변환 없음", "Original stored review images plus SHA-256 manifest in ZIP. No resize, color or platform-profile conversion.")}</dd>
    </dl>
    <p className="mt-3 text-xs text-fg-2">{bt("다른 최신 원고로 바꾸지 않습니다. 준비가 끝나도 현재 승인·권한·파일 목록을 다시 확인하며 하나라도 맞지 않으면 다운로드하지 않습니다. 이 파일은 전자서명·공개 게시·수신자의 인수 확인이 아닙니다.", "The latest editable draft is never substituted. Approval, access and the full file list are rechecked after preparation; any mismatch stops download. This is not a digital signature, public release or recipient acceptance.")}</p>
  </details>;
}
