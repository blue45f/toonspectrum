import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Copy,
  Eraser,
  FlipHorizontal2,
  LayoutTemplate,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Suspense, memo, useState } from "react";

import { StudioEdgeRailButton } from "./studio-chrome-ui";
import {
  studioMobileSheetSizeStyle,
  type StudioMobileSheetSnap,
} from "./studio-mobile-sheet-snap";
import { StudioPageThumbnail } from "./studio-page-lazy-ui";
import {
  PAGE_NAME_MAX,
  PAGE_NOTE_MAX,
  autoPageName,
  pageDisplayName,
} from "./studio-page-meta";
import { shotTagBadgeText, shotTagBadgeTitle } from "./studio-panel-shot-tags";
import { StudioMobileSheetHandle } from "./StudioMobileSheetHandle";
import { StudioPanelResizeHandle } from "./StudioPanelResizeHandle";

import type { El } from "./studio-element-model";
import type { DocumentMaster } from "./studio-master-page";
import type { StudioPageDnd } from "./studio-page-dnd";
import type { PageState } from "./studio-page-state";
import type { StudioMobileSheet } from "./StudioMobileEditingDock";
import type { Resizable } from "@/components/use-resizable";
import type { Dispatch, RefObject, SetStateAction } from "react";

import { cn } from "@/lib/utils";

type StudioPagePreviewSize = "compact" | "comfortable" | "large";

const PAGE_PREVIEW_SIZE_STORAGE_KEY = "toonspectrum:studio:page-preview-size:v1";
const PAGE_PREVIEW_SIZE_VALUES: readonly StudioPagePreviewSize[] = [
  "compact",
  "comfortable",
  "large",
];
const PAGE_PREVIEW_SIZE_CLASS: Record<StudioPagePreviewSize, string> = {
  compact: "h-14",
  comfortable: "h-24",
  large: "h-36",
};
const PAGE_PREVIEW_SIZE_LABEL: Record<StudioPagePreviewSize, string> = {
  compact: "작게",
  comfortable: "보통",
  large: "크게",
};

function readPagePreviewSize(): StudioPagePreviewSize {
  if (typeof window === "undefined") return "comfortable";
  try {
    const stored = window.localStorage.getItem(PAGE_PREVIEW_SIZE_STORAGE_KEY);
    return PAGE_PREVIEW_SIZE_VALUES.includes(stored as StudioPagePreviewSize)
      ? (stored as StudioPagePreviewSize)
      : "comfortable";
  } catch {
    return "comfortable";
  }
}

function persistPagePreviewSize(value: StudioPagePreviewSize): void {
  try {
    window.localStorage.setItem(PAGE_PREVIEW_SIZE_STORAGE_KEY, value);
  } catch {
    // 사생활 보호 모드나 저장소 차단 환경에서도 현재 세션의 조절은 그대로 유지한다.
  }
}

export interface StudioPageListPaneHandlers {
  addPage: () => void;
  applyBgToAll: () => void;
  applyGradeToAll: () => void;
  clearPageFor: (pageId: string) => void;
  commitPageMeta: (pageId: string, patch: { name?: string | null; note?: string | null; }) => void;
  deletePage: (pageId: string) => void;
  deletePagesBulk: (ids: string[]) => void;
  duplicatePage: (pageId: string) => void;
  duplicatePageMirrored: (pageId: string) => void;
  insertPageAfter: (pageId: string) => void;
  insertPageBefore: (pageId: string) => void;
  movePageDown: (pageId: string) => void;
  movePagesBulk: (ids: string[], delta: number) => void;
  movePageToBottom: (pageId: string) => void;
  movePageToTop: (pageId: string) => void;
  movePageUp: (pageId: string) => void;
}

export interface StudioPageListPaneProps {
  collaborationDocumentLocked: boolean;
  collaborationLockMessage: () => string;
  composeWorkAssetPreviewPage: (page: PageState) => PageState;
  currentPageId: string;
  isMobile: boolean;
  leftResize: Resizable;
  master: DocumentMaster<El>;
  masterEditMode: boolean;
  masterPanelOpen: boolean;
  metaEditPageId: string | null;
  mobileKeyboardInset: number;
  mobileSheet: StudioMobileSheet;
  pageDnd: StudioPageDnd;
  pages: PageState[];
  pagesSheetRef: RefObject<HTMLDivElement | null>;
  presentationPanelsHidden: boolean;
  setCurrentPageId: (value: SetStateAction<string>) => boolean;
  setLeftPanelOpen: Dispatch<SetStateAction<boolean>>;
  setMasterPanelOpen: Dispatch<SetStateAction<boolean>>;
  setMetaEditPageId: Dispatch<SetStateAction<string | null>>;
  setMobileSheet: Dispatch<SetStateAction<StudioMobileSheet>>;
  visibleLeftPanelOpen: boolean;
  stableHandlers: StudioPageListPaneHandlers;
}

export const StudioPageListPane = memo(function StudioPageListPane({
  collaborationDocumentLocked,
  collaborationLockMessage,
  composeWorkAssetPreviewPage,
  currentPageId,
  isMobile,
  leftResize,
  master,
  masterEditMode,
  masterPanelOpen,
  metaEditPageId,
  mobileKeyboardInset,
  mobileSheet,
  pageDnd,
  pages,
  pagesSheetRef,
  presentationPanelsHidden,
  setCurrentPageId,
  setLeftPanelOpen,
  setMasterPanelOpen,
  setMetaEditPageId,
  setMobileSheet,
  visibleLeftPanelOpen,
  stableHandlers,
}: StudioPageListPaneProps) {
  const {
    addPage,
    applyBgToAll,
    applyGradeToAll,
    clearPageFor,
    commitPageMeta,
    deletePage,
    deletePagesBulk,
    duplicatePage,
    duplicatePageMirrored,
    insertPageAfter,
    insertPageBefore,
    movePageDown,
    movePagesBulk,
    movePageToBottom,
    movePageToTop,
    movePageUp,
  } = stableHandlers;
  const [mobileSnap, setMobileSnap] = useState<StudioMobileSheetSnap>("medium");
  const [pagePreviewSize, setPagePreviewSize] = useState<StudioPagePreviewSize>(
    readPagePreviewSize
  );
  // CSP EX 스타일 다중 페이지 선택 — currentPageId 와 별도로 벌크 이동/삭제 대상 id 목록.
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const pageIdSet = new Set(pages.map((page) => page.id));
  const liveSelectedPageIds = selectedPageIds.filter((id) => pageIdSet.has(id));
  const multiSelectActive = liveSelectedPageIds.length > 1;
  const safeMobileKeyboardInset = Number.isFinite(mobileKeyboardInset)
    ? Math.max(0, Math.round(mobileKeyboardInset))
    : 0;
  return (
    <>
        {!visibleLeftPanelOpen && !presentationPanelsHidden && (
          <StudioEdgeRailButton
            side="left"
            label="페이지"
            icon={LayoutTemplate}
            onClick={() => setLeftPanelOpen(true)}
            title="페이지 목록 펼치기"
          />
        )}
        <div
          ref={pagesSheetRef}
          role={isMobile ? "dialog" : undefined}
          aria-modal={isMobile && mobileSheet === "pages" ? true : undefined}
          data-studio-sheet-id="pages"
          data-studio-mobile-sheet={isMobile && mobileSheet === "pages" ? "true" : undefined}
          data-studio-sheet-snap={isMobile ? mobileSnap : undefined}
          data-popup-kind={isMobile && mobileSheet === "pages" ? "sheet" : undefined}
          aria-label={isMobile ? "페이지 목록" : undefined}
          tabIndex={isMobile ? -1 : undefined}
          inert={isMobile && mobileSheet !== "pages" ? true : undefined}
          className={cn(
            "flex flex-col gap-1.5 border border-line p-2",
            // 모바일: 하단에서 올라오는 바텀시트
            "fixed inset-x-0 bottom-0 z-[60] overflow-hidden rounded-t-3xl bg-panel pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl transition-[transform,height,max-height] duration-300 ease-out motion-reduce:transition-none",
            // 데스크톱: 엣지 도크(라운드·여백 최소, 캔버스 폭 최대)
            "lg:static lg:z-auto lg:max-h-none lg:min-h-0 lg:overflow-hidden lg:rounded-none lg:border-y-0 lg:border-l-0 lg:bg-panel/50 lg:pb-2 lg:shadow-none lg:transition-none lg:translate-y-0",
            mobileSheet === "pages" ? "translate-y-0" : "translate-y-full",
            !visibleLeftPanelOpen && "lg:hidden"
          )}
          style={
            isMobile
              ? {
                  bottom: safeMobileKeyboardInset,
                  ...studioMobileSheetSizeStyle(mobileSnap, safeMobileKeyboardInset),
                }
              : { width: leftResize.width, minWidth: 128 }
          }
        >
          <div className="shrink-0 border-b border-line/50 pb-1.5">
            <StudioMobileSheetHandle
              active={isMobile && mobileSheet === "pages"}
              kind="pages"
              label="페이지 시트"
              onDismiss={() => setMobileSheet(null)}
              onSnapChange={setMobileSnap}
              sheetRef={pagesSheetRef}
              snap={mobileSnap}
            />
            <div className="flex min-h-11 items-center justify-between gap-2 lg:min-h-6">
              <span className="flex items-center gap-1 text-[0.7rem] font-bold text-fg-2">
                <button
                  type="button"
                  onClick={() => setLeftPanelOpen(false)}
                  className="hidden text-fg-3 transition-colors hover:text-fg lg:inline-flex"
                  title="페이지 목록 접기"
                >
                  <ChevronLeft size={13} />
                </button>
                페이지
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMobileSheet(null)}
                  className="grid size-11 place-items-center rounded-xl text-fg-3 hover:bg-raised lg:hidden"
                  aria-label="페이지 시트 닫기"
                  data-autofocus
                >
                  <X size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  data-testid="studio-add-page"
                  onClick={addPage}
                  className="flex min-h-11 items-center gap-1 rounded-lg bg-accent px-3 text-[0.7rem] font-semibold text-on-accent hover:bg-accent-hover lg:min-h-6 lg:px-2 lg:text-[10px]"
                >
                  <Plus size={12} aria-hidden /> 추가
                </button>
              </div>
            </div>
            <div
              role="toolbar"
              aria-label="페이지 일괄 작업"
              className="flex items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap lg:overflow-x-visible"
            >
              <button
                type="button"
                onClick={applyGradeToAll}
                className="min-h-11 shrink-0 rounded-lg border border-line px-3 text-[0.7rem] text-fg-3 hover:bg-raised lg:min-h-6 lg:px-1.5 lg:text-[10px]"
                title="현재 페이지의 색보정을 모든 페이지에 적용"
              >
                그레이드 전체
              </button>
              <button
                type="button"
                onClick={applyBgToAll}
                className="min-h-11 shrink-0 rounded-lg border border-line px-3 text-[0.7rem] text-fg-3 hover:bg-raised lg:min-h-6 lg:px-1.5 lg:text-[10px]"
                title="현재 페이지의 배경을 모든 페이지에 적용"
              >
                배경 전체
              </button>
              <button
                type="button"
                onClick={() => setMasterPanelOpen((v) => !v)}
                disabled={collaborationDocumentLocked}
                aria-pressed={masterPanelOpen}
                className={cn(
                  "min-h-11 shrink-0 rounded-lg border px-3 text-[0.7rem] transition-colors disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-6 lg:px-1.5 lg:text-[10px]",
                  masterEditMode
                    ? "border-accent bg-accent-soft/50 text-accent"
                    : masterPanelOpen
                      ? "border-accent/60 text-fg-2 hover:bg-raised"
                      : "border-line text-fg-3 hover:bg-raised"
                )}
                title={collaborationDocumentLocked ? collaborationLockMessage() : "마스터 페이지(모든 페이지 공통 요소) 관리"}
              >
                마스터{master.elements.length > 0 ? ` ${master.elements.length}` : ""}
              </button>
              <div
                role="group"
                aria-label="페이지 미리보기 크기"
                className="ml-auto flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-line bg-card px-1.5 lg:min-h-6"
                title={`페이지 미리보기 ${PAGE_PREVIEW_SIZE_LABEL[pagePreviewSize]}`}
              >
                <Minimize2 size={12} className="shrink-0 text-fg-3" aria-hidden />
                <input
                  type="range"
                  min={0}
                  max={PAGE_PREVIEW_SIZE_VALUES.length - 1}
                  step={1}
                  value={PAGE_PREVIEW_SIZE_VALUES.indexOf(pagePreviewSize)}
                  onChange={(event) => {
                    const next = PAGE_PREVIEW_SIZE_VALUES[Number(event.currentTarget.value)];
                    if (!next) return;
                    setPagePreviewSize(next);
                    persistPagePreviewSize(next);
                  }}
                  aria-label="페이지 미리보기 크기 조절"
                  aria-valuetext={PAGE_PREVIEW_SIZE_LABEL[pagePreviewSize]}
                  className="h-11 w-20 cursor-pointer accent-accent lg:h-6 lg:w-16"
                />
                <Maximize2 size={12} className="shrink-0 text-fg-3" aria-hidden />
              </div>
            </div>
            {multiSelectActive ? (
              <div
                role="toolbar"
                aria-label="선택한 페이지 일괄 작업"
                data-testid="studio-page-bulk-toolbar"
                className="mt-1.5 flex min-h-11 items-center gap-1 overflow-x-auto overscroll-x-contain rounded-lg border border-accent/40 bg-accent-soft/30 px-1.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <span className="shrink-0 px-1.5 text-[0.7rem] font-bold tabular-nums text-accent lg:text-[10px]">
                  {liveSelectedPageIds.length}개 선택
                </span>
                <button
                  type="button"
                  data-testid="studio-page-bulk-move-up"
                  onClick={() => movePagesBulk(liveSelectedPageIds, -1)}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-2 hover:bg-raised lg:size-auto lg:min-h-6 lg:rounded-lg lg:px-1.5"
                  title="선택한 페이지 위로 이동"
                  aria-label="선택한 페이지 위로 이동"
                >
                  <ChevronUp size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  data-testid="studio-page-bulk-move-down"
                  onClick={() => movePagesBulk(liveSelectedPageIds, 1)}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-2 hover:bg-raised lg:size-auto lg:min-h-6 lg:rounded-lg lg:px-1.5"
                  title="선택한 페이지 아래로 이동"
                  aria-label="선택한 페이지 아래로 이동"
                >
                  <ChevronDown size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  data-testid="studio-page-bulk-delete"
                  onClick={() => {
                    if (
                      globalThis.confirm(
                        `선택한 ${liveSelectedPageIds.length}개 페이지를 삭제할까요?`
                      )
                    ) {
                      deletePagesBulk(liveSelectedPageIds);
                      setSelectedPageIds([]);
                    }
                  }}
                  disabled={pages.length <= 1}
                  className="ml-auto grid size-11 shrink-0 place-items-center rounded-xl text-bad hover:bg-bad-soft/20 disabled:opacity-30 lg:size-auto lg:min-h-6 lg:rounded-lg lg:px-1.5"
                  title="선택한 페이지 삭제"
                  aria-label="선택한 페이지 삭제"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pr-0.5">
            {pages.map((p, idx) => {
              const isActive = p.id === currentPageId;
              const isMultiSelected = liveSelectedPageIds.includes(p.id);
              const dropIndicator = pageDnd.indicatorFor(idx);
              return (
                <div
                  key={p.id}
                  data-testid="studio-page-item"
                  data-selected={isMultiSelected ? "true" : undefined}
                  {...pageDnd.itemProps(idx)}
                  title="드래그하여 순서 변경 · Shift/⌘/Ctrl+클릭으로 다중 선택"
                  className={cn(
                    "relative flex w-full flex-col gap-0.5 rounded-lg border p-1.5 transition-all hover:bg-raised/50",
                    isActive || isMultiSelected
                      ? "border-accent bg-accent-soft/40"
                      : "border-line bg-card",
                    isMultiSelected && !isActive && "ring-1 ring-accent/50",
                    pageDnd.dragIndex === idx && "opacity-50"
                  )}
                >
                  {/* 페이지 선택 — 접근성: 카드를 role=button 으로 만들면 내부 액션 버튼(편집·이동)이
                      중첩 인터랙티브가 되어 위반이므로, 카드 전체를 덮는 "늘린 버튼"으로 선택을 처리하고
                      액션 버튼은 z-index 로 그 위에 띄운다. 카드 div 는 드래그 정렬(draggable) 컨테이너로 유지. */}
                  <button
                    type="button"
                    onClick={(event) => {
                      const multi = event.metaKey || event.ctrlKey || event.shiftKey;
                      if (multi) {
                        setSelectedPageIds((prev) => {
                          const kept = prev.filter((id) => pageIdSet.has(id));
                          return kept.includes(p.id)
                            ? kept.filter((id) => id !== p.id)
                            : [...kept, p.id];
                        });
                        setCurrentPageId(p.id);
                        return;
                      }
                      setSelectedPageIds([p.id]);
                      setCurrentPageId(p.id);
                    }}
                    aria-label={`${pageDisplayName(p, idx)} 선택`}
                    aria-pressed={isActive || isMultiSelected}
                    className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                  {/* 드롭 삽입선(PPT식) — 카드 위/아래 절반 판정 결과 시각화. overflow 클리핑 없게 카드 가장자리에 겹쳐 그린다. */}
                  {dropIndicator && (
                    <span
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute inset-x-1 z-10 h-[3px] rounded-full bg-accent",
                        dropIndicator === "before" ? "top-0" : "bottom-0"
                      )}
                    />
                  )}
                  <div className="flex min-w-0 items-center justify-between gap-1">
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-fg-2 lg:text-[10px]" title={pageDisplayName(p, idx)}>
                      {pageDisplayName(p, idx)}
                    </span>
                    {shotTagBadgeText(p) ? (
                      <span
                        className="shrink-0 rounded bg-accent-soft px-1 py-0.5 text-[0.65rem] font-semibold text-accent lg:text-[8px]"
                        title={shotTagBadgeTitle(p) ?? undefined}
                      >
                        {shotTagBadgeText(p)}
                      </span>
                    ) : null}
                    {/* 액션 버튼은 늘린 선택 버튼(z-10) 위로 띄운다. */}
                    <div className="relative z-20 flex max-w-[70%] items-center gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:max-w-none lg:overflow-visible">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMetaEditPageId((v) => (v === p.id ? null : p.id));
                        }}
                        className={cn("grid size-11 shrink-0 place-items-center rounded-xl hover:bg-raised lg:size-auto lg:rounded lg:p-0.5", metaEditPageId === p.id ? "text-accent" : "text-fg-3")}
                        title="이름·콘티 메모 편집"
                        aria-label={`${pageDisplayName(p, idx)} 이름·콘티 메모 편집`}
                        aria-expanded={metaEditPageId === p.id}
                      >
                        <Pencil size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePageUp(p.id);
                        }}
                        disabled={idx === 0}
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised disabled:opacity-30 lg:size-auto lg:rounded lg:p-0.5"
                        title="위로 이동"
                        aria-label="위로 이동"
                      >
                        <ChevronUp size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePageDown(p.id);
                        }}
                        disabled={idx === pages.length - 1}
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised disabled:opacity-30 lg:size-auto lg:rounded lg:p-0.5"
                        title="아래로 이동"
                        aria-label="아래로 이동"
                      >
                        <ChevronDown size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePageToTop(p.id);
                        }}
                        disabled={idx === 0}
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised disabled:opacity-30 lg:size-auto lg:rounded lg:p-0.5"
                        title="맨 위로"
                        aria-label="맨 위로 이동"
                      >
                        <span aria-hidden="true" className="text-sm leading-none lg:text-[10px]">⇧</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePageToBottom(p.id);
                        }}
                        disabled={idx === pages.length - 1}
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised disabled:opacity-30 lg:size-auto lg:rounded lg:p-0.5"
                        title="맨 아래로"
                        aria-label="맨 아래로 이동"
                      >
                        <span aria-hidden="true" className="text-sm leading-none lg:text-[10px]">⇩</span>
                      </button>
                    </div>
                  </div>
                  {/* 실내용 미니 썸네일 — 마스터 요소를 페이지 요소 아래에 합성해 경량 SVG 프록시로 축소 렌더.
                      마스터 없음/페이지 숨김이면 원본 page 를 동일 참조로 넘겨 RC 메모이제이션을 보존한다. */}
                  <Suspense
                    fallback={(
                      <div
                        aria-hidden="true"
                        className="h-24 animate-pulse rounded border border-line/60 bg-raised/40"
                      />
                    )}
                  >
                    <StudioPageThumbnail
                      page={composeWorkAssetPreviewPage(p)}
                      className={PAGE_PREVIEW_SIZE_CLASS[pagePreviewSize]}
                    />
                  </Suspense>
                  {metaEditPageId === p.id ? (
                    // 인라인 편집 입력은 늘린 선택 버튼(z-10) 위로 올려 포커스·타이핑을 받게 한다.
                    <div className="relative z-20 flex flex-col gap-1 pt-1">
                      <input
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- 연필 버튼 클릭으로만 열리는 인라인 편집 — 열릴 때 이름란 포커스가 올바른 패턴(기존 텍스트 편집 모달과 동일)
                        autoFocus
                        type="text"
                        defaultValue={p.name ?? ""}
                        placeholder={autoPageName(idx)}
                        maxLength={PAGE_NAME_MAX}
                        aria-label="페이지 이름"
                        className="min-h-11 w-full rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none lg:min-h-0 lg:rounded lg:px-1.5 lg:py-1 lg:text-[10px]"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            commitPageMeta(p.id, { name: e.currentTarget.value });
                            setMetaEditPageId(null);
                          } else if (e.key === "Escape") {
                            setMetaEditPageId(null);
                          }
                        }}
                        onBlur={(e) => commitPageMeta(p.id, { name: e.target.value })}
                      />
                      <textarea
                        rows={2}
                        defaultValue={p.note ?? ""}
                        placeholder="콘티 메모 (장면·대사 아이디어)"
                        maxLength={PAGE_NOTE_MAX}
                        spellCheck
                        aria-label="콘티 메모"
                        className="min-h-16 w-full resize-none rounded-lg border border-line bg-card px-2 py-2 text-xs leading-tight text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none lg:min-h-0 lg:rounded lg:px-1.5 lg:py-1 lg:text-[9px]"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        onBlur={(e) => commitPageMeta(p.id, { note: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMetaEditPageId(null);
                        }}
                        className="min-h-11 self-end rounded-lg bg-accent px-4 text-xs font-semibold text-on-accent hover:bg-accent-hover lg:min-h-0 lg:rounded lg:px-2 lg:py-0.5 lg:text-[9px]"
                      >
                        완료
                      </button>
                    </div>
                  ) : p.note ? (
                    <p className="line-clamp-2 whitespace-pre-wrap text-[9px] leading-tight text-fg-3" title={p.note}>
                      {p.note}
                    </p>
                  ) : null}
                  <div className="relative z-20 flex items-center justify-start gap-1 overflow-x-auto overscroll-x-contain pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:justify-end lg:overflow-visible">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        insertPageBefore(p.id);
                      }}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised lg:size-auto lg:rounded lg:p-0.5"
                      title="이 앞에 빈 페이지 삽입"
                      aria-label="이 앞에 빈 페이지 삽입"
                    >
                      <Plus size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        insertPageAfter(p.id);
                      }}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised lg:size-auto lg:rounded lg:p-0.5"
                      title="이 뒤에 빈 페이지 삽입"
                      aria-label="이 뒤에 빈 페이지 삽입"
                    >
                      <Plus size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicatePage(p.id);
                      }}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised lg:size-auto lg:rounded lg:p-0.5"
                      title="페이지 복제"
                      aria-label="페이지 복제"
                    >
                      <Copy size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicatePageMirrored(p.id);
                      }}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised lg:size-auto lg:rounded lg:p-0.5"
                      title="미러 복제 (좌우 반전)"
                      aria-label="미러 복제 (좌우 반전)"
                    >
                      <FlipHorizontal2 size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearPageFor(p.id);
                      }}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-raised lg:size-auto lg:rounded lg:p-0.5"
                      title="이 페이지 내용 비우기"
                      aria-label="이 페이지 내용 비우기"
                    >
                      <Eraser size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (pages.length <= 1) return;
                        if (globalThis.confirm(`${idx + 1}페이지를 삭제할까요?`)) {
                          deletePage(p.id);
                        }
                      }}
                      disabled={pages.length <= 1}
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-bad hover:bg-bad-soft/20 disabled:opacity-30 lg:size-auto lg:rounded lg:p-0.5"
                      title="페이지 삭제"
                      aria-label="페이지 삭제"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 페이지 목록 ↔ 캔버스 너비 스플리터(데스크톱) */}
        {visibleLeftPanelOpen && (
          <StudioPanelResizeHandle handleProps={leftResize.handleProps} dragging={leftResize.dragging} label="페이지 목록 너비 조절" />
        )}
    </>
  );
});
