/**
 * StudioElementsPanel — PicsArt/Canva-class elements: shapes + 3D object insert rail.
 * 2D: search + category chips + recent MRU. Placement via onAdd(svg, w, h, id).
 * 3D: searchable catalog (primitives / props / scene templates) → openTarget routing.
 */
import { Box, Grip, MessageCircle, MousePointer2, Search, Sparkles, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent, type ReactElement } from "react";

import { svgToDataUrl } from "./studio-characters";
import {
  findStudioElement,
  listStudioElementLibrary,
  STUDIO_ELEMENT_CATEGORY_CHIPS,
  type StudioElementCategory,
  type StudioElementItem,
} from "./studio-elements-catalog";
import {
  rememberStudioElementRecent,
} from "./studio-elements-recent";
import { writeStudioAssetDragPayload } from "./studio-insert-drag-writer";
import {
  filterStudioObjectInsertItems,
  listStudioObjectInsertFamilies,
  planStudioObjectInsertPlacement,
  type StudioObjectInsertFamily,
  type StudioObjectInsertItem,
  type StudioObjectInsertPlacementPlan,
} from "./studio-object-insert-catalog";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { serializeStudioLocalAssetDragPayload } from "./studio-shared-asset-drag";
import {
  acquireProductStudioUiPreferencesRepository,
  type StudioUiPreferencesRepository,
} from "./studio-ui-preferences-sqlite";
import { StudioSvgAssetPreview } from "./StudioSvgAssetPreview";

import type { StudioSvgProductTournament } from "./studio-svg-vello-product-router";

import { cn } from "@/lib/utils";

export interface StudioElementsObjectInsertRequest {
  readonly item: StudioObjectInsertItem;
  readonly plan: StudioObjectInsertPlacementPlan;
}

export interface StudioElementsPanelProps {
  onAdd: (item: StudioElementItem) => void;
  onOpenBubbles?: () => void;
  /**
   * Canva-style 3D object pick: panel plans placement + openTarget; host opens
   * BG3D / VRM poser / template path. Omit to hide the 3D rail.
   */
  onOpenObjectInsert?: (request: StudioElementsObjectInsertRequest) => void;
  /** Canvas size used only for 3D insert placement planning. */
  canvasWidth?: number;
  canvasHeight?: number;
  previewTournament?: Pick<StudioSvgProductTournament, "resolve">;
  /** Test seam; product defaults to SQLite over OPFS. */
  acquireUiPreferences?: () => Promise<StudioUiPreferencesRepository>;
  className?: string;
}

function ElementTile({
  item,
  onPick,
  placementHelpId,
  previewTournament,
}: {
  item: StudioElementItem;
  onPick: (item: StudioElementItem) => void;
  placementHelpId: string;
  previewTournament?: Pick<StudioSvgProductTournament, "resolve">;
}): ReactElement {
  const [previewRequested, setPreviewRequested] = useState(false);

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
      onFocus={() => setPreviewRequested(true)}
      onPointerEnter={() => setPreviewRequested(true)}
      onPointerDown={() => setPreviewRequested(true)}
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
        <StudioSvgAssetPreview
          assetId={item.id}
          svg={item.svg}
          width={item.width}
          height={item.height}
          requested={previewRequested}
          tournament={previewTournament}
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
  onOpenObjectInsert,
  canvasWidth = 800,
  canvasHeight = 1200,
  previewTournament,
  acquireUiPreferences = acquireProductStudioUiPreferencesRepository,
  className,
}: StudioElementsPanelProps): ReactElement {
  const resultsId = useId();
  const placementHelpId = useId();
  const [surface, setSurface] = useState<"vector" | "object3d">("vector");
  const [category, setCategory] = useState<StudioElementCategory | "all">("shape");
  const [objectFamily, setObjectFamily] = useState<StudioObjectInsertFamily | "all">("all");
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [preferenceAuthority, setPreferenceAuthority] = useState<
    "loading" | "sqlite-opfs" | "memory-only"
  >("loading");
  const preferenceRepositoryRef = useRef<StudioUiPreferencesRepository | null>(null);
  const recentDirtyRef = useRef(false);
  const mountedRef = useRef(true);
  const showObject3d = typeof onOpenObjectInsert === "function";

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void acquireUiPreferences()
      .then(async (repository) => {
        preferenceRepositoryRef.current = repository;
        const recent = await repository.loadElementsRecent();
        if (!active) return;
        setPreferenceAuthority("sqlite-opfs");
        if (!recentDirtyRef.current) setRecentIds(recent.ids);
      })
      .catch(() => {
        if (active) setPreferenceAuthority("memory-only");
      });
    return () => { active = false; };
  }, [acquireUiPreferences]);

  const items = listStudioElementLibrary(category, query);
  const objectFamilies = listStudioObjectInsertFamilies();
  const objectItems = showObject3d
    ? filterStudioObjectInsertItems({
        query,
        family: objectFamily,
        limit: 120,
      })
    : [];
  const recentItems = recentIds
    .map((id) => findStudioElement(id))
    .filter((el): el is StudioElementItem => el !== null && el.category !== "bubble");

  function handlePickObject(item: StudioObjectInsertItem) {
    if (!onOpenObjectInsert) return;
    const plan = planStudioObjectInsertPlacement({
      itemId: item.id,
      canvasWidth,
      canvasHeight,
      existingCount: 0,
    });
    if (!plan) return;
    onOpenObjectInsert({ item, plan });
  }

  function handlePick(item: StudioElementItem) {
    recentDirtyRef.current = true;
    setRecentIds((current) => {
      const next = rememberStudioElementRecent({ version: 1, ids: current }, item.id);
      const save = preferenceRepositoryRef.current
        ? preferenceRepositoryRef.current.saveElementsRecent(next)
        : acquireUiPreferences().then((repository) => {
            preferenceRepositoryRef.current = repository;
            return repository.saveElementsRecent(next);
          });
      void save
        .then(() => {
          if (mountedRef.current) setPreferenceAuthority("sqlite-opfs");
        })
        .catch(() => {
          if (mountedRef.current) setPreferenceAuthority("memory-only");
        });
      return next.ids;
    });
    onAdd(item);
  }

  return (
    <div
      className={cn("grid gap-2", className)}
      data-studio-elements-panel="true"
      data-studio-ui-preferences-authority={preferenceAuthority}
    >
      <div className="flex items-start gap-2 rounded-lg border border-line bg-card px-2 py-1.5">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold text-fg">
            {surface === "object3d" ? "요소 · 3D 오브젝트" : "요소 · 도형"}
          </p>
          <p className="text-[0.62rem] leading-snug text-fg-3">
            {surface === "object3d"
              ? "기본 입체·소품·씬 템플릿을 검색해 BG3D·VRM 도구로 바로 엽니다."
              : "고급 도형·컷 패널·효과음·효과선·배경 패턴을 검색해 바로 배치합니다."}
          </p>
        </div>
      </div>

      {showObject3d ? (
        <div
          className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-card p-1"
          role="tablist"
          aria-label="요소 표면"
          data-studio-elements-surface={surface}
        >
          <button
            type="button"
            role="tab"
            aria-selected={surface === "vector"}
            onClick={() => setSurface("vector")}
            className={cn(
              "min-h-10 rounded-lg text-[0.64rem] font-semibold",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              surface === "vector"
                ? "bg-accent text-on-accent"
                : "text-fg-3 hover:bg-raised",
            )}
          >
            2D 도형
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={surface === "object3d"}
            onClick={() => setSurface("object3d")}
            className={cn(
              "inline-flex min-h-10 items-center justify-center gap-1 rounded-lg text-[0.64rem] font-semibold",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              surface === "object3d"
                ? "bg-accent text-on-accent"
                : "text-fg-3 hover:bg-raised",
            )}
          >
            <Box size={12} aria-hidden />
            3D 오브젝트
          </button>
        </div>
      ) : null}

      {preferenceAuthority === "memory-only" ? (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-2 py-1 text-[0.62rem] text-fg-2">
          최근 요소는 저장소를 다시 연결하기 전까지 이번 탭에서만 유지됩니다.
        </p>
      ) : null}

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
          placeholder={
            surface === "object3d"
              ? "3D 검색 (검, 교실, 상자…)"
              : "이름·용도 검색 (나선, 4컷, 집중선…)"
          }
          className="min-h-10 w-full rounded-lg border border-line bg-card py-1 pl-8 pr-10 text-xs placeholder:text-fg-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
          aria-label={surface === "object3d" ? "3D 오브젝트 검색" : "요소 검색"}
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

      {surface === "object3d" && showObject3d ? (
        <>
          <div
            className="flex max-w-full gap-1 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:thin]"
            role="tablist"
            aria-label="3D 오브젝트 분류"
          >
            <button
              type="button"
              role="tab"
              aria-selected={objectFamily === "all"}
              onClick={() => setObjectFamily("all")}
              className={cn(
                "min-h-10 shrink-0 rounded-full border px-2.5 text-[0.64rem] font-medium pointer-coarse:min-h-11",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                objectFamily === "all"
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-3 hover:bg-raised",
              )}
            >
              전체
            </button>
            {objectFamilies.map((family) => (
              <button
                key={family.id}
                type="button"
                role="tab"
                aria-selected={objectFamily === family.id}
                onClick={() => setObjectFamily(family.id)}
                className={cn(
                  "min-h-10 shrink-0 rounded-full border px-2.5 text-[0.64rem] font-medium pointer-coarse:min-h-11",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  objectFamily === family.id
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-3 hover:bg-raised",
                )}
              >
                {family.label}
                <span className="ml-1 tabular-nums opacity-80">{family.count}</span>
              </button>
            ))}
          </div>
          <p className="text-[0.64rem] font-medium text-fg-3" role="status" aria-live="polite">
            {objectFamily === "all"
              ? "전체 3D"
              : objectFamilies.find((family) => family.id === objectFamily)?.label}
            <span className="ml-1 tabular-nums text-fg-3/80">{objectItems.length}개</span>
          </p>
          <div
            id={resultsId}
            role="tabpanel"
            data-studio-elements-3d-results="true"
            className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]"
          >
            {objectItems.length === 0 ? (
              <div className="col-span-2 flex h-24 flex-col items-center justify-center rounded-lg border border-dashed border-line text-center">
                <p className="text-xs font-semibold text-fg-2">검색 결과가 없습니다</p>
                <p className="mt-1 text-[0.62rem] text-fg-3">
                  ‘검’, ‘교실’, ‘상자’처럼 소품·씬·도형 이름으로 찾아보세요.
                </p>
              </div>
            ) : (
              objectItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.hint ?? item.label}
                  aria-label={`${item.label}, ${item.familyLabel}`}
                  data-studio-object-insert={item.id}
                  data-studio-object-open-target={item.openTarget}
                  onClick={() => handlePickObject(item)}
                  className={cn(
                    "flex min-h-[4.5rem] flex-col items-start justify-center gap-0.5 rounded-lg border border-line bg-card px-2 py-1.5 text-left",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                    "hover:border-accent/45 hover:bg-raised",
                  )}
                >
                  <span className="text-[0.68rem] font-semibold text-fg">{item.label}</span>
                  <span className="text-[0.55rem] text-fg-3">{item.familyLabel}</span>
                  <span className="text-[0.52rem] font-medium text-accent">
                    {item.openTarget === "vrm-poser"
                      ? "VRM 포저 열기"
                      : item.openTarget === "bg3d-templates"
                        ? "BG3D 템플릿"
                        : "BG3D 편집기"}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <>
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
                    previewTournament={previewTournament}
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
                    previewTournament={previewTournament}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
