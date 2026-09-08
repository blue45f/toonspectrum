/**
 * Studio Storyboard Control Room — 전체 페이지를 시퀀스와 검토 큐 관점에서 함께 보는 작업 공간.
 *
 * 기존 경량 SVG 썸네일과 공유 DnD 인스턴스를 그대로 사용한다. 검색/필터가 켜진 동안에는
 * 숨겨진 페이지를 건너뛴 재배열이 예측하기 어려우므로 DnD를 잠그고, 원본 순서를 보존한다.
 */
import {
  Copy,
  Download,
  LayoutGrid,
  ListChecks,
  Lock,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

import { confirmStudioDestructiveAction } from "./studio-destructive-action-preview";
import { studioDeletePageRequest } from "./studio-destructive-command-catalog";
import { hasCustomPageName, pageDisplayName } from "./studio-page-meta";
import {
  PAGE_REVIEW_STATUSES,
  PAGE_REVIEW_STATUS_LABELS,
  type PageReviewStatus,
} from "./studio-page-review";
import { StudioPanelChip } from "./studio-panel-ui";
import { StudioPageThumbnail, type StudioPageDnd } from "./StudioPageThumbnails";
import { StudioPanelShotTagFields } from "./StudioPanelShotTagFields";
import {
  STORYBOARD_CONTROL_FILTERS,
  buildStoryboardControlRoom,
  serializeStoryboardControlRoomCsv,
  type StoryboardControlFilter,
  type StoryboardControlRoomRow,
} from "./studio-storyboard-control-room";

import type { ThumbPageLike } from "./studio-page-thumbs";
import type { ShotTagPatch } from "./studio-panel-shot-tags";

import { cn } from "@/shared/lib/utils";

export type StoryboardGridPage = ThumbPageLike & {
  id: string;
  name?: string;
  note?: string;
  shotType?: string;
  cameraAngle?: string;
  review?: unknown;
};

const CELL_SIZE_PRESETS = {
  s: "grid-cols-[repeat(auto-fill,minmax(5rem,1fr))]",
  m: "grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]",
  l: "grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]",
} as const;
type CellSize = keyof typeof CELL_SIZE_PRESETS;
type StoryboardViewMode = "sequence" | "review";

const FILTER_LABELS: Record<StoryboardControlFilter, string> = {
  all: "전체 페이지",
  draft: "작업 중",
  "needs-review": "검토 요청",
  "changes-requested": "수정 요청",
  approved: "승인",
  locked: "잠금 페이지",
  "missing-metadata": "샷 정보 누락",
  unassigned: "담당자 미지정",
};

const REVIEW_TONE: Record<PageReviewStatus, string> = {
  draft: "border-line bg-black/45 text-white",
  "needs-review": "border-sky-400/40 bg-sky-500/20 text-sky-100",
  "changes-requested": "border-rose-400/40 bg-rose-500/20 text-rose-100",
  approved: "border-emerald-400/40 bg-emerald-500/20 text-emerald-100",
};

export interface StudioStoryboardGridPanelProps {
  open: boolean;
  onClose: () => void;
  pages: StoryboardGridPage[];
  currentPageId: string;
  dnd: StudioPageDnd;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onDuplicatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  canDelete: boolean;
  onShotTagChange?: (pageId: string, patch: ShotTagPatch) => void;
}

interface MetricButtonProps {
  label: string;
  value: string | number;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}

function MetricButton({ label, value, active = false, onClick, title }: MetricButtonProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "min-w-[6.75rem] rounded-xl border px-3 py-2 text-left transition-colors",
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-line bg-card/70 text-fg-2 hover:border-accent/50 hover:bg-raised/70",
      )}
    >
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-fg-3">{label}</span>
      <strong className="mt-0.5 block text-sm text-fg">{value}</strong>
    </button>
  );
}

function downloadStoryboardReviewCsv(
  rows: readonly StoryboardControlRoomRow<StoryboardGridPage>[],
): void {
  const csv = serializeStoryboardControlRoomCsv(rows);
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `toonspectrum-storyboard-review-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ReviewBadge({ status, locked }: { status: PageReviewStatus; locked: boolean }): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold shadow-sm backdrop-blur-sm",
        REVIEW_TONE[status],
      )}
    >
      {locked ? <Lock size={9} aria-hidden /> : null}
      <span className="truncate">{PAGE_REVIEW_STATUS_LABELS[status]}</span>
    </span>
  );
}

export function StudioStoryboardGridPanel({
  open,
  onClose,
  pages,
  currentPageId,
  dnd,
  onSelectPage,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  canDelete,
  onShotTagChange,
}: StudioStoryboardGridPanelProps): ReactElement | null {
  const [cellSize, setCellSize] = useState<CellSize>("m");
  const [viewMode, setViewMode] = useState<StoryboardViewMode>("sequence");
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState<StoryboardControlFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);

  const controlRoom = useMemo(
    () => buildStoryboardControlRoom(pages, query, reviewFilter),
    [pages, query, reviewFilter],
  );
  const { summary, visibleRows } = controlRoom;
  const reorderEnabled = viewMode === "sequence" && !controlRoom.filterActive;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable === true;

      if (!isTyping && (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f"))) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (event.key !== "Escape" || dnd.dragIndex !== null) return;
      if (query) {
        setQuery("");
        return;
      }
      if (reviewFilter !== "all") {
        setReviewFilter("all");
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dnd.dragIndex, onClose, open, query, reviewFilter]);

  if (!open) return null;

  const setOperationalFilter = (filter: StoryboardControlFilter) => {
    setReviewFilter((current) => (current === filter ? "all" : filter));
  };

  const renderSequenceGrid = () => {
    if (visibleRows.length === 0) {
      return (
        <div className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-line bg-card/30 p-8 text-center">
          <div>
            <Search className="mx-auto mb-3 text-fg-3" size={28} aria-hidden />
            <p className="text-sm font-semibold text-fg">조건에 맞는 페이지가 없습니다.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setReviewFilter("all");
              }}
              className="mt-3 min-h-11 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 hover:bg-raised"
            >
              필터 초기화
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={cn("grid gap-3", CELL_SIZE_PRESETS[cellSize])}>
        {visibleRows.map(({ page: p, originalIndex: idx, label, review, metadataComplete }) => {
          const isActive = p.id === currentPageId;
          const dropIndicator = reorderEnabled ? dnd.indicatorFor(idx) : null;
          const displayName = pageDisplayName(p, idx);
          const dragProps = reorderEnabled ? dnd.itemProps(idx) : {};
          return (
            <div
              key={p.id}
              {...dragProps}
              title={reorderEnabled ? "드래그하여 순서 변경" : undefined}
              className={cn(
                "group relative flex flex-col gap-1 rounded-xl border p-1.5 transition-all",
                isActive ? "border-accent bg-accent-soft/40" : "border-line bg-card hover:bg-raised/50",
                reorderEnabled && dnd.dragIndex === idx && "opacity-50",
              )}
            >
              {dropIndicator ? (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-x-1 z-30 h-[3px] rounded-full bg-accent",
                    dropIndicator === "before" ? "top-0" : "bottom-0",
                  )}
                />
              ) : null}

              <button
                type="button"
                onClick={() => onSelectPage(p.id)}
                aria-label={`${displayName} 선택`}
                aria-pressed={isActive}
                className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />

              <div className="pointer-events-none absolute left-2 top-2 z-20 max-w-[calc(100%-3rem)]">
                <ReviewBadge status={review.status} locked={review.locked} />
              </div>

              <StudioPageThumbnail page={p} className="aspect-[2/3] h-auto w-full" />

              <span
                className="truncate text-[10px] font-semibold text-fg-2"
                title={p.note ? `${displayName}\n${p.note}` : displayName}
              >
                {hasCustomPageName(p) ? `${idx + 1}. ${displayName}` : displayName}
                {p.note ? " · 메모" : ""}
              </span>

              <div className="flex min-w-0 items-center justify-between gap-1 text-[9px] text-fg-3">
                <span className="truncate" title={review.assignee || "담당자 미지정"}>
                  {review.assignee ? `담당 ${review.assignee}` : "담당자 미지정"}
                </span>
                {!metadataComplete ? (
                  <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 font-semibold text-amber-200">
                    샷 정보 필요
                  </span>
                ) : null}
              </div>

              {onShotTagChange ? (
                <StudioPanelShotTagFields
                  shotType={p.shotType}
                  cameraAngle={p.cameraAngle}
                  onShotTypeChange={(value) => onShotTagChange(p.id, { shotType: value })}
                  onCameraAngleChange={(value) => onShotTagChange(p.id, { cameraAngle: value })}
                  size="compact"
                  className="relative z-20"
                />
              ) : null}

              <div className="pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 pointer-coarse:gap-1.5 absolute right-1 top-1 z-20 flex flex-col items-center gap-0.5 pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDuplicatePage(p.id);
                  }}
                  className="grid size-11 shrink-0 place-items-center rounded-lg bg-black/55 p-1 text-white hover:bg-black/70"
                  title="페이지 복제"
                  aria-label={`${label} 복제`}
                >
                  <Copy size={11} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!canDelete) return;
                    void (async () => {
                      if (
                        !(await confirmStudioDestructiveAction(
                          studioDeletePageRequest({
                            pageNumber: idx + 1,
                            elementCount: p.elements.length,
                          }),
                        ))
                      ) return;
                      onDeletePage(p.id);
                    })();
                  }}
                  disabled={!canDelete}
                  className="grid size-11 shrink-0 place-items-center rounded-lg bg-black/55 p-1 text-white hover:bg-bad/80 disabled:opacity-30"
                  title="페이지 삭제"
                  aria-label={`${label} 삭제`}
                >
                  <Trash2 size={11} aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderReviewBoard = () => (
    <div className="min-w-[58rem] grid grid-cols-4 gap-3" aria-label="검토 상태별 페이지 보드">
      {PAGE_REVIEW_STATUSES.map((status) => {
        const rows = visibleRows.filter((row) => row.review.status === status);
        return (
          <section key={status} className="min-w-0 rounded-2xl border border-line bg-card/40 p-2.5">
            <header className="mb-2 flex items-center justify-between gap-2">
              <ReviewBadge status={status} locked={false} />
              <span className="rounded-full bg-raised px-2 py-0.5 text-[10px] font-bold text-fg-2">{rows.length}</span>
            </header>
            <div className="flex max-h-[calc(100vh-18rem)] flex-col gap-2 overflow-y-auto pr-0.5">
              {rows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-2 py-6 text-center text-[10px] text-fg-3">
                  해당 페이지 없음
                </p>
              ) : rows.map(({ page, originalIndex, label, review, metadataComplete }) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => onSelectPage(page.id)}
                  aria-current={page.id === currentPageId ? "page" : undefined}
                  className={cn(
                    "rounded-xl border p-2 text-left transition-colors hover:border-accent/60 hover:bg-raised/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    page.id === currentPageId ? "border-accent bg-accent-soft/40" : "border-line bg-panel/70",
                  )}
                >
                  <div className="flex gap-2">
                    <StudioPageThumbnail page={page} className="h-20 w-[3.35rem] shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-bold text-fg">{originalIndex + 1}. {label}</p>
                      <p className="mt-1 truncate text-[10px] text-fg-3">
                        {[page.shotType, page.cameraAngle].filter(Boolean).join(" · ") || "샷 정보 미지정"}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-fg-2">
                        {review.note || page.note || "검토 메모 없음"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-fg-3">
                    <span className="truncate">{review.assignee ? `담당 ${review.assignee}` : "담당자 미지정"}</span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      {review.locked ? <Lock size={9} aria-label="잠금" /> : null}
                      {!metadataComplete ? "샷 정보 필요" : "준비됨"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="스토리보드 컨트롤 룸"
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"
    >
      <div className="mx-auto flex h-full w-full max-w-[100rem] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <LayoutGrid size={16} className="text-accent" aria-hidden />
          <div>
            <h2 className="text-sm font-bold text-fg">스토리보드 컨트롤 룸</h2>
            <p className="text-[10px] text-fg-3">시퀀스·샷 메타·검토 상태를 한 화면에서 점검합니다.</p>
          </div>
          <span className="text-xs text-fg-3">총 {summary.total}페이지</span>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1 rounded-md border border-line bg-card/50 p-0.5">
              <StudioPanelChip
                className="min-h-11 gap-1 px-2.5"
                active={viewMode === "sequence"}
                onClick={() => setViewMode("sequence")}
                title="원본 순서와 샷 정보를 보는 시퀀스 뷰"
              >
                <LayoutGrid size={12} aria-hidden /> 시퀀스
              </StudioPanelChip>
              <StudioPanelChip
                className="min-h-11 gap-1 px-2.5"
                active={viewMode === "review"}
                onClick={() => setViewMode("review")}
                title="검토 상태별 작업 큐"
              >
                <ListChecks size={12} aria-hidden /> 검토 큐
              </StudioPanelChip>
            </div>

            {viewMode === "sequence" ? (
              <div className="flex items-center gap-1 rounded-md border border-line bg-card/50 p-0.5">
                {(["s", "m", "l"] as const).map((size) => (
                  <StudioPanelChip
                    key={size}
                    className="min-h-11 min-w-11"
                    active={cellSize === size}
                    onClick={() => setCellSize(size)}
                    title={size === "s" ? "작게" : size === "m" ? "보통" : "크게"}
                  >
                    {size === "s" ? "소" : size === "m" ? "중" : "대"}
                  </StudioPanelChip>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={onAddPage}
              className="flex min-h-11 min-w-11 items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover pointer-coarse:px-3"
            >
              <Plus size={12} aria-hidden /> 추가
            </button>
            <button
              type="button"
              aria-label="닫기"
              title="닫기 (Esc)"
              onClick={onClose}
              className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-line bg-card/30 px-4 py-3">
          <div className="flex gap-2 overflow-x-auto pb-2">
            <MetricButton label="승인 진행률" value={`${summary.approvedPercent}%`} active={reviewFilter === "approved"} onClick={() => setOperationalFilter("approved")} title="승인 페이지만 보기" />
            <MetricButton label="검토 요청" value={summary.statusCounts["needs-review"]} active={reviewFilter === "needs-review"} onClick={() => setOperationalFilter("needs-review")} />
            <MetricButton label="수정 요청" value={summary.statusCounts["changes-requested"]} active={reviewFilter === "changes-requested"} onClick={() => setOperationalFilter("changes-requested")} />
            <MetricButton label="샷 정보 누락" value={summary.missingMetadata} active={reviewFilter === "missing-metadata"} onClick={() => setOperationalFilter("missing-metadata")} />
            <MetricButton label="잠금" value={summary.locked} active={reviewFilter === "locked"} onClick={() => setOperationalFilter("locked")} />
            <MetricButton label="담당 미지정" value={summary.total - summary.assigned} active={reviewFilter === "unassigned"} onClick={() => setOperationalFilter("unassigned")} title="담당자가 없는 페이지만 보기" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" size={14} aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="페이지·메모·샷·담당자 검색  /"
                aria-label="스토리보드 검색"
                className="min-h-11 w-full rounded-lg border border-line bg-panel pl-9 pr-9 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="검색어 지우기"
                  className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg"
                >
                  <X size={13} aria-hidden />
                </button>
              ) : null}
            </label>

            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs text-fg-2">
              <span className="font-semibold">상태</span>
              <select
                value={reviewFilter}
                onChange={(event) => setReviewFilter(event.target.value as StoryboardControlFilter)}
                aria-label="스토리보드 상태 필터"
                className="min-h-9 bg-transparent text-xs font-semibold text-fg outline-none"
              >
                {STORYBOARD_CONTROL_FILTERS.map((filter) => (
                  <option key={filter} value={filter}>{FILTER_LABELS[filter]}</option>
                ))}
              </select>
            </label>

            <span className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-3 text-xs text-fg-3" role="status" aria-live="polite">
              {summary.visible}/{summary.total} 표시
            </span>

            <button
              type="button"
              disabled={visibleRows.length === 0}
              onClick={() => downloadStoryboardReviewCsv(visibleRows)}
              title={`현재 검색·필터 결과 ${visibleRows.length}개를 CSV로 내보냅니다.`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={13} aria-hidden /> 검토표 CSV
            </button>
          </div>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-auto px-4 py-3", viewMode === "review" && "bg-card/20")}>
          {viewMode === "sequence" ? renderSequenceGrid() : renderReviewBoard()}
        </div>

        <p className="shrink-0 border-t border-line px-4 py-2 text-[0.7rem] text-fg-3" role="status">
          {viewMode === "review"
            ? "검토 큐는 원본 페이지 순서를 유지한 채 상태별로 묶습니다. 카드를 클릭하면 해당 페이지로 이동합니다."
            : reorderEnabled
              ? "카드를 드래그하면 순서가 바뀝니다. / 또는 Ctrl/⌘+F로 검색할 수 있습니다."
              : "검색·필터 중에는 숨겨진 페이지를 건너뛰는 오배치를 막기 위해 재배열이 잠깁니다."}
        </p>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
