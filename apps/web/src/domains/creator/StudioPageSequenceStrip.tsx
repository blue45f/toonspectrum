/**
 * Studio Page Sequence Strip — 캔버스 하단에서 페이지를 빠르게 오가고 순서를 바꾸는 필름스트립.
 *
 * 현재 위치를 확인하고 다른 페이지로 이동하거나 새 페이지를 추가하는 짧은 동선이 기본이다.
 * 호스트가 `onReorderPage`를 주면 썸네일을 끌어 놓거나(마우스·펜) 키보드(Alt+←/→, Shift+Alt+←/→)로
 * 순서를 바꿀 수 있다. 실제 문서 변경은 호출자가 기존 페이지 관리 경로(commitPages)로 처리하므로
 * 복제·삭제 같은 나머지 페이지 관리는 계속 페이지 관리 패널의 책임이다.
 * 호스트가 position:relative인 캔버스 셸 안에 마운트하는 것을 전제로 하며, 작은 가용 폭에서는
 * 가운데 목록만 수평 스크롤되고 추가/닫기 타일은 목록의 양 끝에서 안정적으로 접근할 수 있다.
 */
import { Files, FileText, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from "react";

import type { ThumbPageLike } from "./studio-page-thumbs";
import { StudioPageThumbnail } from "./StudioPageThumbnails";
import { resolveStudioPageStripKeyAction } from "./page/studio-page-strip-keyboard";
import { useStudioPageStripDnd } from "./page/studio-page-strip-dnd";
import "./page/studio-page-sequence-strip.css";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface StudioPageSequenceStripPage {
  id: string;
  label: string;
  thumbnailUrl?: string | null;
  /**
   * 실제 페이지 내용. 있으면 목록·스토리보드와 같은 경량 SVG 썸네일로 그린다
   * (페이지마다 Konva 스테이지를 띄우지 않는다).
   */
  thumbnailPage?: ThumbPageLike | null;
}

export interface StudioPageSequenceStripProps {
  open: boolean;
  pages: readonly StudioPageSequenceStripPage[];
  currentPageId: string;
  onSelectPage: (pageId: string) => void;
  onAddPage?: () => void;
  /** 주어지면 끌어 놓기·키보드로 페이지 순서를 바꾼다. 없으면(검토 잠금 등) 이동 전용이다. */
  onReorderPage?: (fromIndex: number, toIndex: number) => void;
  onClose: () => void;
}

/** 순서 바꾸기 단축키 — 스크린리더가 키 조합을 읽을 수 있게 각 페이지 버튼에 선언한다. */
const REORDER_KEY_SHORTCUTS =
  "ArrowLeft ArrowRight Home End Alt+ArrowLeft Alt+ArrowRight Shift+Alt+ArrowLeft Shift+Alt+ArrowRight";
const NAVIGATION_KEY_SHORTCUTS = "ArrowLeft ArrowRight Home End";
/** 호스트가 순서를 반영하지 않은 채(잠금 등) 남은 초점 복구 요청을 버리는 시간. */
const REFOCUS_GIVE_UP_MS = 1_000;

/** 현재 페이지를 갑자기 중앙으로 당기지 않고, 잘린 경우에만 가장 가까운 가장자리로 드러낸다. */
function revealStudioPageSequenceItem(
  target: Partial<Pick<Element, "scrollIntoView">> | null
): void {
  // scrollIntoView 가 없는 환경(구형 웹뷰·테스트 DOM)에서는 조용히 건너뛴다.
  target?.scrollIntoView?.({
    behavior: "auto",
    block: "nearest",
    inline: "nearest",
  });
}

export function StudioPageSequenceStrip({
  open,
  pages,
  currentPageId,
  onSelectPage,
  onAddPage,
  onReorderPage,
  onClose,
}: StudioPageSequenceStripProps): ReactElement | null {
  const bt = useBilingual("StudioPageSequenceStrip");
  const pageRefs = useRef(new Map<string, HTMLButtonElement>());
  /** 순서를 바꾼 직후 DOM이 재배열되며 잃을 수 있는 초점을 되돌릴 페이지와 새 자리. */
  const refocusRef = useRef<{ pageId: string; toIndex: number; at: number } | null>(null);
  const [focusedPageId, setFocusedPageId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const currentPageIndex = pages.findIndex((page) => page.id === currentPageId);
  const reorderEnabled = typeof onReorderPage === "function" && pages.length > 1;

  const defaultLabel = (index: number): string => bt(`${index + 1}페이지`, `Page ${index + 1}`);
  const labelOf = (index: number): string => pages[index]?.label.trim() || defaultLabel(index);

  /** 끌어 놓기와 키보드가 같은 경로로 순서를 바꾸고 결과를 말로 알린다. */
  const reorderPage = (fromIndex: number, toIndex: number): void => {
    const moved = pages[fromIndex];
    if (!onReorderPage || !moved || fromIndex === toIndex) return;
    refocusRef.current = { pageId: moved.id, toIndex, at: Date.now() };
    onReorderPage(fromIndex, toIndex);
    const named = moved.label.trim();
    setAnnouncement(
      named
        ? bt(
            `${fromIndex + 1}번 페이지(${named})를 ${toIndex + 1}번째로 옮겼어요. 전체 ${pages.length}페이지.`,
            `Moved page ${fromIndex + 1} (${named}) to position ${toIndex + 1} of ${pages.length}.`,
          )
        : bt(
            `${fromIndex + 1}번 페이지를 ${toIndex + 1}번째로 옮겼어요. 전체 ${pages.length}페이지.`,
            `Moved page ${fromIndex + 1} to position ${toIndex + 1} of ${pages.length}.`,
          ),
    );
  };
  const dnd = useStudioPageStripDnd(pages.length, reorderEnabled ? reorderPage : undefined);

  useEffect(() => {
    if (!open || currentPageIndex < 0) return;
    revealStudioPageSequenceItem(pageRefs.current.get(currentPageId) ?? null);
  }, [currentPageId, currentPageIndex, open]);

  // 새 순서가 화면에 반영된 렌더에서만 초점을 되돌린다(반영 전 렌더에서 소비하면 DOM 재배열에 다시 잃는다).
  useEffect(() => {
    const pending = refocusRef.current;
    if (!pending) return;
    if (pages[pending.toIndex]?.id !== pending.pageId) {
      if (Date.now() - pending.at > REFOCUS_GIVE_UP_MS) refocusRef.current = null;
      return;
    }
    refocusRef.current = null;
    const button = pageRefs.current.get(pending.pageId);
    // 끌어 놓기로 옮겼고 초점이 이미 캔버스 등 다른 곳에 있으면 훔치지 않는다.
    const active = document.activeElement;
    if (button && (active === document.body || (active !== null && button.closest("nav")?.contains(active)))) {
      button.focus({ preventScroll: true });
      revealStudioPageSequenceItem(button);
    }
  });

  if (!open) return null;

  // 키보드 진입점은 하나(마지막으로 초점을 둔 페이지, 없으면 현재 페이지)로 둬 긴 스트립을 Tab으로 일일이 지나지 않게 한다.
  const tabStopPageId = pages.some((page) => page.id === focusedPageId)
    ? focusedPageId
    : pages[currentPageIndex >= 0 ? currentPageIndex : 0]?.id ?? null;

  const handleItemKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const action = resolveStudioPageStripKeyAction({
      key: event.key,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      index,
      count: pages.length,
      rtl,
      canReorder: reorderEnabled,
    });
    if (!action) return;
    // 편집기 전역 단축키(선택 요소 미세 이동 등)로 새지 않게 먼저 소비한다.
    event.preventDefault();
    event.stopPropagation();
    if (action.kind === "focus") {
      const target = pages[action.index];
      const button = target ? pageRefs.current.get(target.id) : undefined;
      button?.focus({ preventScroll: true });
      revealStudioPageSequenceItem(button ?? null);
      return;
    }
    if (action.kind === "edge") {
      setAnnouncement(
        action.edge === "start"
          ? bt("이미 맨 앞 페이지예요.", "This page is already first.")
          : bt("이미 맨 뒤 페이지예요.", "This page is already last."),
      );
      return;
    }
    reorderPage(index, action.index);
  };

  return (
    <nav
      aria-label={bt("페이지 시퀀스", "Page sequence")}
      data-studio-page-sequence-strip="true"
      data-studio-page-sequence-reorderable={reorderEnabled ? "true" : undefined}
      className={cn(
        "absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40",
        "hidden min-w-0 items-stretch gap-2 overflow-hidden rounded-2xl border border-line",
        "bg-panel/95 p-2 text-fg shadow-[0_14px_42px_oklch(0.08_0.01_70/0.48)] backdrop-blur-md",
        "lg:flex"
      )}
    >
      <span className="sr-only">
        {bt(`총 ${pages.length}페이지.`, `${pages.length} pages.`)}
        {reorderEnabled
          ? ` ${bt(
              "좌우 방향키로 페이지를 옮겨 다니고, Alt와 좌우 방향키로 선택한 페이지의 순서를 바꿉니다.",
              "Use the left and right arrow keys to move between pages, and Alt with the arrow keys to change the selected page's order.",
            )}`
          : ""}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <div
        aria-hidden="true"
        className="hidden shrink-0 items-center gap-2 border-r border-line/70 px-1 pr-3 xl:flex"
      >
        <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
          <Files size={15} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[0.65rem] font-bold text-fg-2">{bt("시퀀스", "Sequence")}</span>
          <span className="block text-[0.625rem] tabular-nums text-fg-3">{bt(`${pages.length}페이지`, `${pages.length} pages`)}</span>
          {reorderEnabled ? (
            <span className="block text-[0.625rem] text-fg-3">{bt("끌어서 순서 변경", "Drag to reorder")}</span>
          ) : null}
        </span>
      </div>

      <div
        data-studio-page-sequence-scroller="true"
        className="min-w-0 flex-1 touch-pan-x overflow-x-auto overscroll-x-contain scroll-px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ol className="flex w-max min-w-full items-stretch gap-2 py-0.5 pr-4">
          {pages.length === 0 ? (
            <li
              role="status"
              className="flex h-[4.75rem] min-w-44 items-center justify-center rounded-xl border border-dashed border-line bg-card/55 px-4 text-center text-xs text-fg-3"
            >
              {bt("페이지가 아직 없어요.", "No pages yet.")}
            </li>
          ) : null}

          {pages.map((page, index) => {
            const active = page.id === currentPageId;
            const label = labelOf(index);
            const indicator = reorderEnabled ? dnd.indicatorFor(index) : null;
            const dragging = reorderEnabled && dnd.dragIndex === index;
            return (
              <li
                key={page.id}
                data-studio-page-sequence-drop={indicator ?? undefined}
                {...(reorderEnabled ? dnd.itemProps(index) : {})}
                className={cn(
                  "relative shrink-0 transition-opacity motion-reduce:transition-none",
                  reorderEnabled && "cursor-grab active:cursor-grabbing",
                  dragging && "opacity-45"
                )}
              >
                {indicator === "before" ? <StudioPageDropMark side="before" /> : null}
                <button
                  ref={(element) => {
                    if (element) pageRefs.current.set(page.id, element);
                    else pageRefs.current.delete(page.id);
                  }}
                  type="button"
                  data-studio-page-sequence-item="true"
                  tabIndex={page.id === tabStopPageId ? 0 : -1}
                  aria-current={active ? "page" : undefined}
                  aria-keyshortcuts={reorderEnabled ? REORDER_KEY_SHORTCUTS : NAVIGATION_KEY_SHORTCUTS}
                  aria-label={bt(
                    `${index + 1}번 페이지, ${label}${active ? ", 현재 페이지" : ""}`,
                    `Page ${index + 1}, ${label}${active ? ", current page" : ""}`,
                  )}
                  title={
                    reorderEnabled
                      ? `${index + 1}. ${label} · ${bt("끌어서 순서 변경 · Alt+←/→", "Drag to reorder · Alt+←/→")}`
                      : `${index + 1}. ${label}`
                  }
                  onClick={() => onSelectPage(page.id)}
                  onFocus={() => setFocusedPageId(page.id)}
                  onKeyDown={(event) => handleItemKeyDown(event, index)}
                  className={cn(
                    "group flex h-[4.75rem] w-32 min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-xl border px-2 py-1.5 text-left",
                    "transition-colors duration-150 motion-reduce:transition-none",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    active
                      ? "border-accent bg-accent-soft/70 text-fg shadow-[inset_0_0_0_1px_oklch(0.72_0.185_42/0.18)]"
                      : "border-line bg-card/85 text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
                  )}
                >
                  <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md border border-line/70 bg-raised">
                    {page.thumbnailPage ? (
                      <StudioPageThumbnail
                        page={page.thumbnailPage}
                        className="absolute inset-0 h-full w-full rounded-none border-0 bg-transparent"
                      />
                    ) : (
                      <span
                        data-studio-sequence-thumbnail-placeholder="true"
                        className="absolute inset-0 grid place-items-center text-fg-3"
                      >
                        <FileText size={15} aria-hidden />
                      </span>
                    )}
                    {!page.thumbnailPage && page.thumbnailUrl ? (
                      <img
                        key={page.thumbnailUrl}
                        src={page.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                        className="relative size-full bg-card object-contain"
                      />
                    ) : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-[0.625rem] font-semibold tabular-nums text-fg-3">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          active ? "bg-accent" : "bg-transparent"
                        )}
                      />
                      {bt(`페이지 ${index + 1}`, `Page ${index + 1}`)}
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs font-semibold leading-tight text-fg [overflow-wrap:anywhere]">
                      {label}
                    </span>
                  </span>
                </button>
                {indicator === "after" ? <StudioPageDropMark side="after" /> : null}
              </li>
            );
          })}

          {onAddPage ? (
            <li className="shrink-0">
              <button
                type="button"
                data-studio-page-sequence-add="true"
                aria-label={bt("새 페이지 추가", "Add a new page")}
                onClick={onAddPage}
                className={cn(
                  "flex h-[4.75rem] w-24 min-h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-card/55 px-2 text-xs font-semibold text-fg-2",
                  "transition-colors duration-150 hover:border-accent/60 hover:bg-accent-soft/45 hover:text-accent motion-reduce:transition-none",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                )}
              >
                <Plus size={17} aria-hidden />
                {bt("페이지 추가", "Add page")}
              </button>
            </li>
          ) : null}
        </ol>
      </div>

      <div className="flex shrink-0 items-center border-l border-line/70 pl-2">
        <button
          type="button"
          data-studio-page-sequence-close="true"
          aria-label={bt("페이지 시퀀스 닫기", "Close page sequence")}
          title={bt("페이지 시퀀스 닫기", "Close page sequence")}
          onClick={onClose}
          className={cn(
            "grid size-11 min-h-11 min-w-11 place-items-center rounded-xl border border-line bg-card text-fg-3",
            "transition-colors duration-150 hover:border-line-strong hover:bg-raised hover:text-fg motion-reduce:transition-none",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          )}
        >
          <X size={17} aria-hidden />
        </button>
      </div>
    </nav>
  );
}

/** 끌고 있는 페이지가 놓일 자리를 카드 앞·뒤의 굵은 세로선으로 보여 준다(색 + 형태, 색만으로 전달하지 않는다). */
function StudioPageDropMark({ side }: { readonly side: "before" | "after" }): ReactElement {
  return (
    <span
      aria-hidden="true"
      data-studio-page-sequence-drop-mark={side}
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 flex w-1 flex-col items-center justify-between",
        side === "before" ? "-left-1.5" : "-right-1.5"
      )}
    >
      <span className="size-2 rounded-full bg-accent" />
      <span className="w-[3px] flex-1 bg-accent" />
      <span className="size-2 rounded-full bg-accent" />
    </span>
  );
}
