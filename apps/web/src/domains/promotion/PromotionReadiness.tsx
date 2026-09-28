import { CheckCircle2, Circle } from "lucide-react";
import { PROMOTION_KINDS, safePromotionUrl, validPromotionCover } from "../../../../../packages/core/src/promotion";
import type { PromotionDraft } from "./promotion-draft";
import { promotionReadiness } from "./promotion-readiness";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function PromotionReadiness({ draft, tags }: { readonly draft: PromotionDraft; readonly tags: string }) {
  const bt = useBilingual("PromotionReadiness");
  const state = promotionReadiness(draft, tags);
  const labels = {
    copy: bt("작품 소개", "Introduction"), links: bt("링크·영상", "Links and video"),
    media: bt("표지·태그", "Cover and tags"), rights: bt("게시 권한", "Publishing rights"),
  };
  const readingUrl = safePromotionUrl(draft.readingUrl);
  return <section aria-label={bt("게시 준비 상태", "Publishing readiness")} className="my-5 rounded-2xl border border-line bg-panel p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-bold">{bt("게시 전 확인", "Before publishing")}</h2>
      <span className="text-sm font-semibold tabular-nums">{state.completed} / {state.checks.length}</span>
    </div>
    <progress aria-label={bt("게시 준비 완료 항목", "Completed publishing checks")} max={state.checks.length} value={state.completed} className="my-3 h-2 w-full accent-[var(--color-accent)]" />
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {state.checks.map((check) => <div key={check.id} className="rounded-xl border border-line bg-card p-3 text-xs">
        {check.ready ? <CheckCircle2 size={17} className="mb-2 text-good" aria-label={bt("완료", "Ready")} /> : <Circle size={17} className="mb-2 text-warn" aria-label={bt("확인 필요", "Needs attention")} />}
        <span className="font-semibold">{labels[check.id]}</span>
      </div>)}
    </div>
    <p className="mt-3 text-sm leading-6 text-fg-2">
      {state.ready ? bt("필수 검사가 완료되었습니다. 미리 보기를 확인하고 게시하세요.", "Required checks passed. Review your preview before publishing.") : state.error}
    </p>
    <p className="mt-1 text-xs text-fg-3">{bt("표지와 작품 링크는 선택 사항입니다. 홍보 영상 유형에는 지원되는 영상 링크가 필요합니다.", "Cover and reading links are optional. Trailers require a supported video link.")}</p>
    <details className="mt-4 rounded-xl border border-line bg-card p-3" open>
      <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">{bt("독자에게 보일 소개 미리 보기", "Reader preview")}</summary>
      <article className="mt-3 grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[6rem_minmax(0,1fr)]">
        <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl border border-line bg-accent-soft text-xs text-fg-2">
          {draft.cover && validPromotionCover(draft.cover) ? <img src={draft.cover} alt="" className="h-full w-full object-cover" /> : bt("표지 없음", "No cover")}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-accent">{PROMOTION_KINDS[draft.kind]} · {draft.genre}</p>
          <h3 className="mt-2 break-words text-lg font-bold">{draft.title.trim() || bt("소개 제목", "Introduction title")}</h3>
          <p className="mt-1 break-words text-sm text-fg-2">{draft.seriesTitle}</p>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{draft.description || bt("작품의 매력을 소개해 주세요.", "Tell readers about your work.")}</p>
          {readingUrl ? <a href={readingUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm">{bt("작품 링크 확인", "Check reading link")}</a> : null}
        </div>
      </article>
    </details>
  </section>;
}
