import {
  CheckCircle2,
  ClipboardCheck,
  Lock,
  LockOpen,
  Search,
  X,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  buildPageReviewBulkPatchPlan,
  normalizePageReviewState,
  pageReviewStateIncludesPatch,
  PAGE_REVIEW_ASSIGNEE_MAX_LENGTH,
  PAGE_REVIEW_NOTE_MAX_LENGTH,
  PAGE_REVIEW_STATUS_LABELS,
  PAGE_REVIEW_STATUSES,
  type PageReviewBulkOperation,
  type PageReviewBulkPatchPlanItem,
  type PageReviewPatch,
  type PageReviewStatus,
} from "./studio-page-review";
import { StudioFloatingSurface } from "./StudioFloatingSurface";
import { useStudioFloatingSurfaceLayout } from "./use-studio-floating-surface-layout";

import { useIsMobile } from "@/hooks/use-media-query";

export interface StudioPageReviewItem {
  id: string;
  label: string;
  review?: unknown;
}

export interface StudioPageReviewPanelProps {
  open: boolean;
  onClose: () => void;
  pages: readonly StudioPageReviewItem[];
  currentPageId: string;
  onSelectPage: (pageId: string) => void;
  onPatchReview: (pageId: string, patch: PageReviewPatch) => void;
}

const DEFAULT_STUDIO_PAGE_REVIEW_FLOATING_LAYOUT = Object.freeze({
  version: 2 as const,
  xRatio: 0.86,
  yRatio: 0.08,
  width: 760,
  height: 720,
  dock: "right" as const,
  positionLocked: false,
  sizeLocked: false,
});

const PAGE_REVIEW_BULK_CONFIRM_TIMEOUT_MS = 1_500;

interface PageReviewBulkQueue {
  label: string;
  total: number;
  applied: number;
  skipped: number;
  unchanged: number;
  remaining: readonly PageReviewBulkPatchPlanItem[];
  awaiting: PageReviewBulkPatchPlanItem | null;
  awaitingStartedAt: number | null;
}

function normalizeReviewSearchValue(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR");
}

export function StudioPageReviewPanel({
  open,
  onClose,
  pages,
  currentPageId,
  onSelectPage,
  onPatchReview,
}: StudioPageReviewPanelProps) {
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PageReviewStatus>("all");
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(() => new Set());
  const [bulkStatus, setBulkStatus] = useState<PageReviewStatus>("needs-review");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [bulkQueue, setBulkQueue] = useState<PageReviewBulkQueue | null>(null);
  const {
    layout,
    authority,
    failure,
    setLayout,
  } = useStudioFloatingSurfaceLayout({
    surfaceId: "page-review",
    defaultLayout: DEFAULT_STUDIO_PAGE_REVIEW_FLOATING_LAYOUT,
    enabled: open && !isMobile,
  });

  const reviewRows = useMemo(
    () => pages.map((page) => ({ page, review: normalizePageReviewState(page.review) })),
    [pages],
  );
  const queryTokens = useMemo(
    () => normalizeReviewSearchValue(query.trim()).split(/\s+/u).filter(Boolean),
    [query],
  );
  const filteredRows = useMemo(
    () => reviewRows.filter(({ page, review }) => {
      if (statusFilter !== "all" && review.status !== statusFilter) return false;
      if (queryTokens.length === 0) return true;
      const haystack = normalizeReviewSearchValue([
        page.label,
        PAGE_REVIEW_STATUS_LABELS[review.status],
        review.assignee ?? "",
        review.note ?? "",
      ].join(" "));
      return queryTokens.every((token) => haystack.includes(token));
    }),
    [queryTokens, reviewRows, statusFilter],
  );
  const visiblePageIds = useMemo(
    () => filteredRows.map(({ page }) => page.id),
    [filteredRows],
  );
  const reviewById = useMemo(
    () => new Map(reviewRows.map(({ page, review }) => [page.id, review])),
    [reviewRows],
  );
  const pageIdKey = pages.map((page) => page.id).join("\u0000");
  const reviewRevisionKey = reviewRows
    .map(({ page, review }) => [
      page.id,
      review.status,
      review.locked ? "1" : "0",
      review.assignee ?? "",
    ].join("\u0000"))
    .join("\u0001");
  const readPageIdsForSelection = useEffectEvent(() => pages.map((page) => page.id));
  const readReviewForBulkQueue = useEffectEvent((pageId: string) => reviewById.get(pageId));
  const applyQueuedReviewPatch = useEffectEvent((item: PageReviewBulkPatchPlanItem) => {
    onPatchReview(item.pageId, item.patch);
  });

  useEffect(() => {
    const validPageIds = new Set(readPageIdsForSelection());
    setSelectedPageIds((current) => {
      const next = new Set([...current].filter((pageId) => validPageIds.has(pageId)));
      return next.size === current.size ? current : next;
    });
  }, [pageIdKey]);

  useEffect(() => {
    if (!bulkQueue) return;

    if (bulkQueue.awaiting) {
      const awaiting = bulkQueue.awaiting;
      const review = readReviewForBulkQueue(awaiting.pageId);
      if (review && pageReviewStateIncludesPatch(review, awaiting.patch)) {
        setBulkQueue((current) =>
          current?.awaiting === awaiting
            ? {
                ...current,
                applied: current.applied + 1,
                awaiting: null,
                awaitingStartedAt: null,
              }
            : current,
        );
        return;
      }
      if (!review) {
        setBulkQueue((current) =>
          current?.awaiting === awaiting
            ? {
                ...current,
                skipped: current.skipped + 1,
                awaiting: null,
                awaitingStartedAt: null,
              }
            : current,
        );
        return;
      }

      const elapsed = Date.now() - (bulkQueue.awaitingStartedAt ?? Date.now());
      const timeout = globalThis.setTimeout(() => {
        setBulkQueue((current) =>
          current?.awaiting === awaiting
            ? {
                ...current,
                skipped: current.skipped + 1,
                awaiting: null,
                awaitingStartedAt: null,
              }
            : current,
        );
      }, Math.max(0, PAGE_REVIEW_BULK_CONFIRM_TIMEOUT_MS - elapsed));
      return () => globalThis.clearTimeout(timeout);
    }

    const next = bulkQueue.remaining[0];
    if (next) {
      applyQueuedReviewPatch(next);
      setBulkQueue((current) =>
        current && current.awaiting === null
          ? {
              ...current,
              remaining: current.remaining.slice(1),
              awaiting: next,
              awaitingStartedAt: Date.now(),
            }
          : current,
      );
      return;
    }

    const details = [
      bulkQueue.applied > 0
        ? `${bulkQueue.applied}개 페이지에 ${bulkQueue.label}을 적용했습니다.`
        : null,
      bulkQueue.unchanged > 0
        ? `이미 같은 설정인 ${bulkQueue.unchanged}개 페이지는 건너뛰었습니다.`
        : null,
      bulkQueue.skipped > 0
        ? `변경 확인에 실패한 ${bulkQueue.skipped}개 페이지는 다시 확인해 주세요.`
        : null,
    ].filter(Boolean).join(" ");
    setAnnouncement(details || "선택한 페이지가 이미 같은 설정입니다.");
    setBulkQueue(null);
  }, [bulkQueue, reviewRevisionKey]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !isMobile || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, open]);

  if (!open || typeof document === "undefined") return null;

  const approvedCount = reviewRows.filter(({ review }) => review.status === "approved").length;
  const lockedCount = reviewRows.filter(({ review }) => review.locked).length;
  const visibleSelectedCount = visiblePageIds.filter((pageId) => selectedPageIds.has(pageId)).length;
  const hiddenSelectedCount = selectedPageIds.size - visibleSelectedCount;
  const allVisibleSelected =
    visiblePageIds.length > 0 && visibleSelectedCount === visiblePageIds.length;
  const batchBusy = bulkQueue !== null;

  const togglePageSelection = (pageId: string) => {
    setSelectedPageIds((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const setVisibleSelection = (selected: boolean) => {
    setSelectedPageIds((current) => {
      const next = new Set(current);
      for (const pageId of visiblePageIds) {
        if (selected) next.add(pageId);
        else next.delete(pageId);
      }
      return next;
    });
  };

  const applyBulkOperation = (operation: PageReviewBulkOperation, label: string) => {
    if (batchBusy) return;
    const plan = buildPageReviewBulkPatchPlan(pages, selectedPageIds, operation);
    if (plan.length === 0) {
      setAnnouncement("선택한 페이지가 이미 같은 설정입니다.");
      return;
    }
    setAnnouncement("");
    setBulkQueue({
      label,
      total: plan.length,
      applied: 0,
      skipped: 0,
      unchanged: selectedPageIds.size - plan.length,
      remaining: plan,
      awaiting: null,
      awaitingStartedAt: null,
    });
  };

  const statusSummary = (
    <div
      className="flex flex-wrap items-center gap-1.5 text-[0.68rem] text-fg-3"
      aria-label={`승인 ${approvedCount}/${pages.length}, 잠금 ${lockedCount}`}
    >
      <span className="rounded-full border border-line bg-card px-2 py-1">
        승인 {approvedCount}/{pages.length}
      </span>
      <span className="rounded-full border border-line bg-card px-2 py-1">
        잠금 {lockedCount}
      </span>
    </div>
  );

  const bulkReviewControls: ReactNode = (
    <div className="sticky top-0 z-10 mb-3 space-y-2 rounded-xl border border-line bg-panel/95 p-3 shadow-sm backdrop-blur">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <label className="relative block">
          <span className="sr-only">페이지 검토 검색</span>
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
          />
          <input
            type="search"
            value={query}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            placeholder="페이지·담당자·검토 메모 검색"
            className="w-full rounded-lg border border-line bg-card py-2 pl-9 pr-3 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent"
          />
        </label>
        <label>
          <span className="sr-only">검토 상태 필터</span>
          <select
            value={statusFilter}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setStatusFilter(event.target.value as "all" | PageReviewStatus)}
            className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-xs text-fg outline-none focus:border-accent"
          >
            <option value="all">모든 검토 상태</option>
            {PAGE_REVIEW_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PAGE_REVIEW_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[0.68rem]">
        <span className="font-semibold text-fg">
          {filteredRows.length}개 표시 · {selectedPageIds.size}개 선택
        </span>
        {hiddenSelectedCount > 0 ? (
          <span className="rounded-full border border-warning/35 bg-warning-soft/20 px-2 py-1 font-semibold text-warning">
            필터 밖 {hiddenSelectedCount}개 포함
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setVisibleSelection(!allVisibleSelected)}
          disabled={visiblePageIds.length === 0 || batchBusy}
          className="rounded-lg border border-line bg-card px-2.5 py-1.5 font-semibold text-fg-3 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
        >
          {allVisibleSelected ? "표시 항목 선택 해제" : "표시 항목 전체 선택"}
        </button>
        <button
          type="button"
          onClick={() => setSelectedPageIds(new Set())}
          disabled={selectedPageIds.size === 0 || batchBusy}
          className="rounded-lg border border-line bg-card px-2.5 py-1.5 font-semibold text-fg-3 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
        >
          전체 선택 해제
        </button>
      </div>

      <fieldset
        disabled={selectedPageIds.size === 0 || batchBusy}
        className="grid gap-2 rounded-lg border border-line/80 bg-card/45 p-2.5 disabled:opacity-55 lg:grid-cols-[minmax(12rem,0.85fr)_minmax(15rem,1fr)_auto]"
      >
        <legend className="px-1 text-[0.68rem] font-bold text-fg-3">선택 페이지 일괄 편집</legend>
        <div className="flex min-w-0 gap-1.5">
          <label className="min-w-0 flex-1">
            <span className="sr-only">일괄 검토 상태</span>
            <select
              value={bulkStatus}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setBulkStatus(event.target.value as PageReviewStatus)}
              className="w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-xs text-fg outline-none focus:border-accent"
            >
              {PAGE_REVIEW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PAGE_REVIEW_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              applyBulkOperation(
                { type: "status", status: bulkStatus },
                `검토 상태 ‘${PAGE_REVIEW_STATUS_LABELS[bulkStatus]}’`,
              )}
            className="shrink-0 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs font-bold text-accent hover:bg-accent/15"
          >
            상태 적용
          </button>
        </div>

        <div className="flex min-w-0 gap-1.5">
          <label className="min-w-0 flex-1">
            <span className="sr-only">일괄 담당자</span>
            <input
              value={bulkAssignee}
              maxLength={PAGE_REVIEW_ASSIGNEE_MAX_LENGTH}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setBulkAssignee(event.target.value)}
              placeholder="담당 / 확인자"
              className="w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent"
            />
          </label>
          <button
            type="button"
            disabled={!bulkAssignee.trim()}
            onClick={() =>
              applyBulkOperation(
                { type: "assignee", assignee: bulkAssignee },
                `담당자 ‘${bulkAssignee.trim()}’`,
              )}
            className="shrink-0 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-bold text-fg-2 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
          >
            담당 적용
          </button>
          <button
            type="button"
            onClick={() => applyBulkOperation({ type: "assignee", assignee: "" }, "담당자 해제")}
            className="shrink-0 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-bold text-fg-3 hover:bg-raised hover:text-fg"
          >
            해제
          </button>
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => applyBulkOperation({ type: "lock", locked: true }, "편집 잠금")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-warning/35 bg-warning-soft/20 px-3 py-2 text-xs font-bold text-warning hover:bg-warning-soft/35"
          >
            <Lock size={12} aria-hidden /> 잠금
          </button>
          <button
            type="button"
            onClick={() => applyBulkOperation({ type: "lock", locked: false }, "편집 잠금 해제")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-bold text-fg-3 hover:bg-raised hover:text-fg"
          >
            <LockOpen size={12} aria-hidden /> 잠금 해제
          </button>
        </div>
      </fieldset>
      <p
        className={`min-h-4 text-[0.68rem] font-semibold ${
          batchBusy ? "text-accent" : "text-fg-3"
        }`}
        aria-live="polite"
      >
        {bulkQueue
          ? `일괄 변경 적용 중 ${bulkQueue.applied}/${bulkQueue.total}`
          : announcement}
      </p>
    </div>
  );

  const reviewList: ReactNode = (
    <>
      <p className="mb-3 rounded-lg border border-warning/30 bg-warning-soft/20 px-3 py-2 text-[0.7rem] leading-relaxed text-warning">
        이 잠금은 현재 문서의 편집 사고를 막는 워크플로 기능이며, 서버 권한이나
        실시간 공동편집 잠금은 아닙니다. 일괄 변경도 기존 문서 히스토리와 저장 경로를
        그대로 사용합니다.
      </p>
      {bulkReviewControls}
      {filteredRows.length > 0 ? (
        <ol className="space-y-2" aria-label="페이지 검토 목록">
          {filteredRows.map(({ page, review }) => {
            const current = page.id === currentPageId;
            const selected = selectedPageIds.has(page.id);
            return (
              <li
                key={page.id}
                className={`rounded-xl border p-3 ${
                  current
                    ? "border-accent/55 bg-accent-soft/15"
                    : selected
                      ? "border-accent/35 bg-accent-soft/10"
                      : "border-line bg-card/45"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <label className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-panel hover:bg-raised">
                    <span className="sr-only">{page.label} 일괄 편집 선택</span>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={batchBusy}
                      onChange={() => togglePageSelection(page.id)}
                      className="size-4 disabled:cursor-not-allowed"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onSelectPage(page.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-bold text-fg hover:text-accent"
                  >
                    {page.label}
                    {current ? (
                      <span className="ml-2 text-[0.65rem] font-medium text-accent">
                        현재
                      </span>
                    ) : null}
                  </button>
                  {review.status === "approved" ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-good/35 bg-good/10 px-2 py-1 text-[0.65rem] font-semibold text-good">
                      <CheckCircle2 size={11} aria-hidden /> 승인
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onPatchReview(page.id, { locked: !review.locked })}
                    disabled={batchBusy}
                    aria-pressed={review.locked}
                    className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold ${
                      review.locked
                        ? "border-warning/40 bg-warning-soft/20 text-warning"
                        : "border-line bg-panel text-fg-3 hover:bg-raised hover:text-fg"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {review.locked
                      ? <Lock size={12} aria-hidden />
                      : <LockOpen size={12} aria-hidden />}
                    {review.locked ? "편집 잠김" : "편집 가능"}
                  </button>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <label className="text-[0.68rem] font-semibold text-fg-3">
                    검토 상태
                    <select
                      value={review.status}
                      disabled={batchBusy}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        onPatchReview(page.id, {
                          status: event.target.value as PageReviewStatus,
                          ...(event.target.value === "approved" ? { locked: true } : {}),
                        })}
                      className="mt-1 w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-xs text-fg outline-none focus:border-accent"
                    >
                      {PAGE_REVIEW_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {PAGE_REVIEW_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[0.68rem] font-semibold text-fg-3">
                    담당 / 확인자
                    <input
                      value={review.assignee ?? ""}
                      disabled={batchBusy}
                      maxLength={PAGE_REVIEW_ASSIGNEE_MAX_LENGTH}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        onPatchReview(page.id, { assignee: event.target.value })}
                      placeholder="예: 콘티 편집자"
                      className="mt-1 w-full rounded-lg border border-line bg-panel px-2.5 py-2 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent"
                    />
                  </label>
                </div>
                <label className="mt-2 block text-[0.68rem] font-semibold text-fg-3">
                  검토 메모
                  <textarea
                    value={review.note ?? ""}
                    disabled={batchBusy}
                    maxLength={PAGE_REVIEW_NOTE_MAX_LENGTH}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      onPatchReview(page.id, { note: event.target.value })}
                    rows={2}
                    placeholder="수정 요청이나 승인 근거를 남겨요."
                    className="mt-1 w-full resize-y rounded-lg border border-line bg-panel px-2.5 py-2 text-xs leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent"
                  />
                </label>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="rounded-xl border border-dashed border-line bg-card/35 px-4 py-8 text-center">
          <p className="text-sm font-bold text-fg">조건에 맞는 페이지가 없습니다.</p>
          <p className="mt-1 text-xs text-fg-3">검색어나 검토 상태 필터를 조정해 보세요.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatusFilter("all");
            }}
            className="mt-3 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg"
          >
            필터 초기화
          </button>
        </div>
      )}
    </>
  );

  if (!isMobile) {
    return createPortal(
      <StudioFloatingSurface
        surfaceId="page-review"
        label="페이지 검토와 잠금"
        layout={layout}
        defaultLayout={DEFAULT_STUDIO_PAGE_REVIEW_FLOATING_LAYOUT}
        minWidth={560}
        minHeight={460}
        maxWidth={1_180}
        maxHeight={1_000}
        insetTop={76}
        insetRight={12}
        insetBottom={12}
        insetLeft={12}
        onLayoutChange={setLayout}
        onClose={onClose}
        rootDataAttributes={{
          "data-studio-page-review-surface": "desktop",
          "data-studio-shortcut-boundary": "true",
          "data-layout-authority": authority,
          "data-layout-failure": failure ?? undefined,
        }}
        contentClassName="min-h-0 overflow-hidden"
      >
        <section
          aria-label="페이지 검토 작업 목록"
          className="flex h-full min-h-0 flex-col"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
            <p className="min-w-0 text-[0.7rem] leading-relaxed text-fg-3">
              승인 상태·담당·메모를 문서에 남기고 여러 페이지의 검토 정책을 한 번에
              정리합니다.
            </p>
            {statusSummary}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {reviewList}
          </div>
        </section>
      </StudioFloatingSurface>,
      document.body,
    );
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="페이지 검토와 잠금"
      data-studio-page-review-surface="mobile"
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"
    >
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <ClipboardCheck size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold tracking-tight text-fg">
              페이지 검토와 잠금
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
              검색·다중 선택·일괄 편집으로 승인 상태와 담당, 잠금을 빠르게 정리합니다.
            </p>
          </div>
          <div className="hidden sm:block">{statusSummary}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="페이지 검토 닫기"
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
          >
            <X size={15} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {reviewList}
        </div>
      </div>
    </div>,
    document.body,
  );
}
