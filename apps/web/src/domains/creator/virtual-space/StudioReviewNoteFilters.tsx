import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioReviewComment } from "../project-graph/studio-project-graph-contract";
import { REVIEW_NOTE_VIEWS, reviewNoteMatches, type ReviewNoteView } from "./studio-review-note-query";

export function StudioReviewNoteFilters({ comments, view, query, actorId, onView, onQuery, onJump, listId }: {
  readonly comments: readonly StudioReviewComment[];
  readonly view: ReviewNoteView; readonly query: string; readonly actorId: string | null;
  readonly onView: (view: ReviewNoteView) => void; readonly onQuery: (query: string) => void;
  readonly onJump: (direction: -1 | 1) => void; readonly listId: string;
}) {
  const bt = useBilingual("StudioReviewNoteFilters");
  const labels = { all: bt("전체 의견", "All notes"), open: bt("미해결", "Open"), required: bt("필수 수정", "Required"),
    mine: bt("내 수정 요청", "Assigned to me"), resolved: bt("해결·보류", "Resolved or dismissed") };
  const count = comments.filter((note) => reviewNoteMatches(note, view, query, actorId)).length;
  return <div className="mt-5 space-y-3 rounded-xl border border-line bg-panel p-3">
    <div className="flex flex-wrap gap-2" role="group" aria-label={bt("검수 의견 보기", "Review note views")} aria-controls={listId}>
      {REVIEW_NOTE_VIEWS.map((key) => <button type="button" key={key} aria-pressed={view === key}
        disabled={key === "mine" && !actorId} onClick={() => onView(key)}
        className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent">
        {labels[key]} · {comments.filter((note) => reviewNoteMatches(note, key, "", actorId)).length}
      </button>)}
    </div>
    <label className="block text-xs font-semibold text-fg-2">{bt("의견 내용 검색", "Search review notes")}
      <input type="search" value={query} maxLength={200} onChange={(event) => onQuery(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg" />
    </label>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p role="status" className="text-xs text-fg-2">{bt(`${count} / ${comments.length}개 의견 · 필터는 승인 조건을 바꾸지 않습니다.`, `${count} / ${comments.length} notes · Filters do not change approval requirements.`)}</p>
      <div className="flex gap-2">
        <button type="button" disabled={!count} onClick={() => onJump(-1)} className="min-h-11 rounded-lg border border-line px-3 text-xs">{bt("이전 의견", "Previous note")}</button>
        <button type="button" disabled={!count} onClick={() => onJump(1)} className="min-h-11 rounded-lg border border-line px-3 text-xs">{bt("다음 의견", "Next note")}</button>
      </div>
    </div>
    {!count && comments.length > 0 ? <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs" onClick={() => { onView("all"); onQuery(""); }}>{bt("전체 의견 다시 보기", "Show all notes")}</button> : null}
  </div>;
}
