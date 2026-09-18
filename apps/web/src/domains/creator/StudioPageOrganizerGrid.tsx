import { Search } from "lucide-react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactElement,
  ReactNode,
} from "react";

import { pageDisplayName } from "./studio-page-meta";
import { shotTagBadgeText, shotTagBadgeTitle } from "./studio-panel-shot-tags";

import type { StudioPageOrganizerEntry } from "./studio-page-organizer";
import type { PageState } from "./studio-page-state";

import { cn } from "@/shared/lib/utils";

const REVIEW_STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: "작업 중",
  "needs-review": "검토 요청",
  "changes-requested": "수정 요청",
  approved: "승인",
};

function reviewBadge(page: PageState): string | null {
  const review = page.review;
  if (!review) return null;
  const status = REVIEW_STATUS_LABELS[review.status] ?? review.status;
  return review.locked ? `${status} · 잠금` : status;
}

export interface StudioPageOrganizerGridProps {
  readonly entries: readonly StudioPageOrganizerEntry<PageState>[];
  readonly selectedPageIds: readonly string[];
  readonly currentPageId: string;
  readonly setPageButtonRef: (pageId: string, node: HTMLButtonElement | null) => void;
  readonly onSelectPage: (
    pageId: string,
    options: { readonly additive: boolean; readonly range: boolean },
  ) => void;
  readonly onPageKeyDown: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    pageId: string,
  ) => void;
  readonly onReset: () => void;
  readonly renderThumbnail: (page: PageState) => ReactNode;
}

export function StudioPageOrganizerGrid({
  entries,
  selectedPageIds,
  currentPageId,
  setPageButtonRef,
  onSelectPage,
  onPageKeyDown,
  onReset,
  renderThumbnail,
}: StudioPageOrganizerGridProps): ReactElement {
  if (entries.length === 0) {
    return (
      <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-line bg-card/40 px-6 text-center">
        <div>
          <Search size={24} aria-hidden className="mx-auto mb-3 text-fg-3" />
          <p className="text-sm font-semibold text-fg">일치하는 페이지가 없습니다.</p>
          <p className="mt-1 text-xs text-fg-3">검색어를 줄이거나 필터를 초기화해 보세요.</p>
          <button
            type="button"
            onClick={onReset}
            className="mt-4 min-h-10 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg"
          >
            검색·필터 초기화
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="페이지 검색 결과"
      aria-multiselectable="true"
      className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-3 lg:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]"
    >
      {entries.map((entry) => {
        const page = entry.page;
        const selected = selectedPageIds.includes(page.id);
        const active = page.id === currentPageId;
        const shotBadge = shotTagBadgeText(page);
        const review = reviewBadge(page);
        const displayName = pageDisplayName(page, entry.index);
        return (
          <article
            key={page.id}
            role="option"
            aria-selected={selected}
            data-organizer-page-id={page.id}
            className={cn(
              "relative flex min-h-0 flex-col gap-2 rounded-xl border p-2 transition-[border-color,background-color,box-shadow,transform] [contain-intrinsic-size:auto_22rem] [content-visibility:auto]",
              active || selected
                ? "border-accent bg-accent-soft/30 shadow-[0_0_0_1px_var(--color-accent)]"
                : "border-line bg-card hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised/50",
            )}
          >
            <button
              ref={(node: HTMLButtonElement | null) => setPageButtonRef(page.id, node)}
              type="button"
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) =>
                onSelectPage(page.id, {
                  additive: event.metaKey || event.ctrlKey,
                  range: event.shiftKey,
                })
              }
              onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) =>
                onPageKeyDown(event, page.id)
              }
              aria-label={`${displayName} 선택`}
              aria-pressed={selected}
              aria-keyshortcuts="ArrowUp ArrowDown Home End PageUp PageDown Control+A Meta+A Escape"
              className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />

            <div className="pointer-events-none relative overflow-hidden rounded-lg border border-line/70 bg-raised/40">
              {renderThumbnail(page)}
              <span className="absolute left-1.5 top-1.5 rounded-md border border-line/70 bg-panel/90 px-1.5 py-0.5 text-[0.62rem] font-bold tabular-nums text-fg-2 shadow-sm backdrop-blur">
                {entry.index + 1}
              </span>
              {selected ? (
                <span className="absolute right-1.5 top-1.5 rounded-md bg-accent px-1.5 py-0.5 text-[0.62rem] font-bold text-on-accent shadow-sm">
                  선택
                </span>
              ) : null}
            </div>

            <div className="pointer-events-none min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <strong className="min-w-0 flex-1 truncate text-xs text-fg" title={displayName}>
                  {displayName}
                </strong>
                <span className="shrink-0 text-[0.62rem] tabular-nums text-fg-3">
                  {page.elements.length}요소
                </span>
              </div>
              <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1">
                {shotBadge ? (
                  <span
                    className="rounded bg-accent-soft px-1.5 py-0.5 text-[0.62rem] font-semibold text-accent"
                    title={shotTagBadgeTitle(page) ?? undefined}
                  >
                    {shotBadge}
                  </span>
                ) : null}
                {review ? (
                  <span className="rounded bg-raised px-1.5 py-0.5 text-[0.62rem] font-semibold text-fg-2">
                    {review}
                  </span>
                ) : null}
              </div>
              {page.note ? (
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[0.68rem] leading-relaxed text-fg-3" title={page.note}>
                  {page.note}
                </p>
              ) : (
                <p className="mt-1 text-[0.68rem] text-fg-3/70">메모 없음</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
