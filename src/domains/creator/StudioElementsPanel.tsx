/**
 * StudioElementsPanel — PicsArt-class elements: shapes, frames, arrows, badges, decor.
 * Search + category chips + recent MRU. Placement via onAdd(svg, w, h, id).
 */
import { Grip, MessageCircle, MousePointer2, Search, Sparkles, X } from "lucide-react";
import { useId, useState, type DragEvent, type ReactElement } from "react";

import { svgToDataUrl } from "./studio-characters";
import {
  findStudioElement,
  listStudioElementLibrary,
  STUDIO_ELEMENT_CATEGORY_CHIPS,
  type StudioElementCategory,
  type StudioElementItem,
} from "./studio-elements-catalog";
import {
  loadStudioElementsRecent,
  pushStudioElementRecent,
} from "./studio-elements-recent";
import { writeStudioAssetDragPayload } from "./studio-insert-drag-writer";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { serializeStudioLocalAssetDragPayload } from "./studio-shared-asset-drag";

import { cn } from "@/lib/utils";

export interface StudioElementsPanelProps {
  onAdd: (item: StudioElementItem) => void;
  onOpenBubbles?: () => void;
  className?: string;
}

function ElementTile({
  item,
  onPick,
  placementHelpId,
}: {
  item: StudioElementItem;
  onPick: (item: StudioElementItem) => void;
  placementHelpId: string;
}): ReactElement {
  function handleDragStart(event: DragEvent<HTMLButtonElement>) {
    writeStudioAssetDragPayload(
      event.dataTransfer,
      serializeStudioLocalAssetDragPayload({
        src: svgToDataUrl(item.svg),
        width: item.width,
        height: item.height,
      })
    );
  }

  return (
    <button
      type="button"
      title={item.label}
      aria-label={item.label}
      aria-describedby={placementHelpId}
      onClick={() => onPick(item)}
      draggable
      onDragStart={handleDragStart}
      data-studio-element={item.id}
      className={cn(
        "group flex min-h-[4.75rem] flex-col items-center justify-center rounded-lg border border-line bg-card p-1",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        "hover:border-accent/50 hover:bg-raised active:scale-[0.98]"
      )}
    >
      <div className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded bg-[oklch(0.94_0.01_78)] p-1">
        <img
          src={svgToDataUrl(item.svg)}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain transition-transform group-hover:scale-105"
        />
        <Grip
          size={11}
          aria-hidden
          className="absolute right-0.5 top-0.5 text-[oklch(0.35_0.02_65/0.55)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </div>
      <span className="mt-0.5 block w-full truncate text-center text-[0.55rem] text-fg-3">
        {item.label}
      </span>
    </button>
  );
}

export function StudioElementsPanel({
  onAdd,
  onOpenBubbles,
  className,
}: StudioElementsPanelProps): ReactElement {
  const resultsId = useId();
  const placementHelpId = useId();
  const [category, setCategory] = useState<StudioElementCategory | "all">("shape");
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState(
    () => loadStudioElementsRecent(globalThis.localStorage).ids
  );

  const items = listStudioElementLibrary(category, query);
  const recentItems = recentIds
    .map((id) => findStudioElement(id))
    .filter((el): el is StudioElementItem => el !== null && el.category !== "bubble");

  function handlePick(item: StudioElementItem) {
    const next = pushStudioElementRecent(globalThis.localStorage, item.id);
    setRecentIds(next.ids);
    onAdd(item);
  }

  return (
    <div className={cn("grid gap-2", className)} data-studio-elements-panel="true">
      <div className="flex items-start gap-2 rounded-lg border border-line bg-card px-2 py-1.5">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold text-fg">요소 · 도형</p>
          <p className="text-[0.62rem] leading-snug text-fg-3">
            고급 도형·컷 패널·효과음·효과선·배경 패턴을 검색해 바로 배치합니다.
          </p>
        </div>
      </div>

      <div
        id={placementHelpId}
        className="grid grid-cols-2 gap-1 rounded-xl border border-accent/20 bg-accent-soft/35 p-1.5 text-[0.58rem] leading-snug text-fg-2"
      >
        <span className="flex min-h-11 items-center gap-1.5 rounded-lg bg-panel/65 px-2">
          <MousePointer2 size={12} className="shrink-0 text-accent" aria-hidden />
          <span><strong className="font-bold text-fg">클릭·탭</strong><br />선택 컷·현재 화면</span>
        </span>
        <span className="flex min-h-11 items-center gap-1.5 rounded-lg bg-panel/65 px-2">
          <Grip size={12} className="shrink-0 text-accent" aria-hidden />
          <span><strong className="font-bold text-fg">끌어 놓기</strong><br />정확한 위치 · Esc 취소</span>
        </span>
      </div>

      {onOpenBubbles ? (
        <button
          type="button"
          onClick={onOpenBubbles}
          className={cn(
            "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-card px-2.5 text-left text-[0.66rem] text-fg-2 hover:border-accent/45 hover:bg-raised",
            STUDIO_EASE,
            STUDIO_FOCUS_RING
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <MessageCircle size={14} className="shrink-0 text-accent" aria-hidden />
            <span>
              <strong className="block font-semibold text-fg">편집 가능한 말풍선</strong>
              <span className="block text-[0.58rem] text-fg-3">대사·꼬리·모양은 전용 도구에서</span>
            </span>
          </span>
          <span className="shrink-0 font-semibold text-accent">열기 →</span>
        </button>
      ) : null}

      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-3" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·용도 검색 (나선, 4컷, 집중선…)"
          className="min-h-10 w-full rounded-lg border border-line bg-card py-1 pl-8 pr-10 text-xs placeholder:text-fg-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
          aria-label="요소 검색"
        />
        {query ? (
          <button
            type="button"
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
              className="absolute right-0 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-fg-3 hover:bg-raised"
            >
              <X size={12} aria-hidden />
            </button>
          ) : null}
      </div>

      <div
        className="flex max-w-full gap-1 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:thin]"
        role="tablist"
        aria-label="요소 카테고리"
      >
        {STUDIO_ELEMENT_CATEGORY_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            id={`${resultsId}-${chip.id}`}
            role="tab"
            aria-selected={category === chip.id}
            aria-controls={resultsId}
            onClick={() => setCategory(chip.id)}
            className={cn(
              "min-h-10 shrink-0 rounded-full border px-2.5 text-[0.64rem] font-medium pointer-coarse:min-h-11",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              category === chip.id
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-3 hover:bg-raised"
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {recentItems.length > 0 && !query ? (
        <>
          <p className="text-[0.64rem] font-medium text-fg-3">최근 사용</p>
          <div className="grid grid-cols-4 gap-1.5">
            {recentItems.slice(0, 8).map((item) => (
              <ElementTile
                key={`recent-${item.id}`}
                item={item}
                onPick={handlePick}
                placementHelpId={placementHelpId}
              />
            ))}
          </div>
        </>
      ) : null}

      <p className="text-[0.64rem] font-medium text-fg-3" role="status" aria-live="polite">
        {category === "all" ? "전체 요소" : STUDIO_ELEMENT_CATEGORY_CHIPS.find((c) => c.id === category)?.label}
        <span className="ml-1 tabular-nums text-fg-3/80">{items.length}개</span>
      </p>
      <div id={resultsId} role="tabpanel" aria-labelledby={`${resultsId}-${category}`}>
        {items.length === 0 ? (
          <div className="flex h-24 flex-col items-center justify-center rounded-lg border border-dashed border-line text-center">
            <p className="text-xs font-semibold text-fg-2">검색 결과가 없습니다</p>
            <p className="mt-1 text-[0.62rem] text-fg-3">‘속도선’, ‘베지어’, ‘4컷’처럼 용도로 찾아보세요.</p>
          </div>
        ) : (
          <div className="grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]">
            {items.map((item) => (
              <ElementTile
                key={item.id}
                item={item}
                onPick={handlePick}
                placementHelpId={placementHelpId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
