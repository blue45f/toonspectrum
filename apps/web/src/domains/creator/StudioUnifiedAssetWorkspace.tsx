import {
  Box,
  ChevronDown,
  Clock3,
  Filter,
  FolderOpen,
  GripVertical,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  LayoutList,
  Library,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
  Type,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import { StudioUnifiedAssetPreviewSurface } from "./StudioUnifiedAssetPreviewSurface";
import { canDragStudioInsertHubEntry } from "./studio-insert-hub-drag";
import {
  buildStudioInsertHubEntries,
  loadStudioInsertHubPreferences,
  reconcileStudioInsertHubPreferences,
  recordStudioInsertRecent,
  saveStudioInsertHubPreferences,
  selectStudioInsertHubEntries,
  setStudioInsertPlacementMode,
  STUDIO_INSERT_ACTIONS,
  STUDIO_INSERT_HUB_COLLECTION_LABELS,
  STUDIO_INSERT_PLACEMENT_LABELS,
  toggleStudioInsertFavorite,
  type StudioInsertActionId,
  type StudioInsertHubAssetEntry,
  type StudioInsertHubCategory,
  type StudioInsertHubCollection,
  type StudioInsertHubPreferences,
  type StudioInsertPlacementMode,
} from "./studio-insert-hub-model";
import {
  auditStudioUnifiedAssetPreviews,
  resolveStudioUnifiedAssetRichPreview,
} from "./studio-unified-asset-preview";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

import { cn } from "@/shared/lib/utils";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-panel";
const QUICK_QUERIES = ["학교", "로맨스", "밤", "효과", "소품", "3D"] as const;
type WorkspaceFacet =
  | "all"
  | "background"
  | "scene-template"
  | "story"
  | "character"
  | "prop"
  | "3d"
  | "mine";

interface WorkspaceFacetDefinition {
  readonly id: WorkspaceFacet;
  readonly label: string;
  readonly category: StudioInsertHubCategory;
}

const BROWSE_FACETS: readonly WorkspaceFacetDefinition[] = [
  { id: "all", label: "전체", category: "all" },
  { id: "background", label: "2D 배경", category: "scene" },
  { id: "scene-template", label: "장면 레시피", category: "scene" },
  { id: "story", label: "스토리 연출", category: "element" },
  { id: "character", label: "캐릭터·포즈", category: "element" },
  { id: "prop", label: "소품", category: "element" },
  { id: "3d", label: "3D", category: "3d" },
  { id: "mine", label: "내 에셋", category: "mine" },
];
const COLLECTIONS: readonly StudioInsertHubCollection[] = [
  "all",
  "favorites",
  "recent",
];
const QUICK_ACTION_IDS = [
  "text",
  "bubble",
  "upload",
  "template",
  "background3d",
  "ai",
] as const satisfies readonly StudioInsertActionId[];
const QUICK_ACTION_ID_SET = new Set<StudioInsertActionId>(QUICK_ACTION_IDS);

type WorkspaceView = "discover" | "library";
type GridDensity = "visual" | "compact";
type Status = { readonly tone: "success" | "error"; readonly message: string };

export interface StudioUnifiedAssetWorkspaceProps {
  readonly items: readonly StudioUnifiedAssetItem[];
  readonly legacyContent: ReactNode;
  readonly initialView?: WorkspaceView;
  readonly onUseItem: (
    item: StudioUnifiedAssetItem,
    placementMode?: StudioInsertPlacementMode,
  ) => boolean | void | Promise<boolean | void>;
  readonly onUseAction?: (
    actionId: StudioInsertActionId,
  ) => boolean | void | Promise<boolean | void>;
  readonly onUploadImage?: (event: ChangeEvent<HTMLInputElement>) => Promise<void> | void;
  readonly onOpenAi: (prompt: string) => void;
  readonly selectionPlacementAvailable?: boolean;
  readonly reviewLocked?: boolean;
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function successMessage(item: StudioUnifiedAssetItem): string {
  if (item.useMode === "open") return `${item.title} 편집 도구를 열었습니다.`;
  if (item.useMode === "apply") return `${item.title} 장면을 배치했습니다.`;
  return `${item.title}을(를) 캔버스에 삽입했습니다.`;
}

function quickActionIcon(actionId: StudioInsertActionId) {
  if (actionId === "text") return Type;
  if (actionId === "bubble") return MessageCircle;
  if (actionId === "upload") return Upload;
  if (actionId === "background3d") return Box;
  if (actionId === "ai") return Sparkles;
  return LayoutGrid;
}

function workspaceFacetForItem(
  item: StudioUnifiedAssetItem,
): Exclude<WorkspaceFacet, "all"> {
  const source = item.source;
  if (source.kind === "background") return "background";
  if (source.kind === "scene-template") return "scene-template";
  if (source.kind === "object-3d") return "3d";
  if (source.kind === "local") return "mine";
  if (source.kind === "native-tool") return "story";

  const searchable = [
    item.id,
    item.title,
    item.categoryLabel,
    source.value.category,
    ...item.keywords,
    ...source.value.keywords,
  ].join(" ").toLocaleLowerCase();
  if (/(?:character|pose|face|hand|캐릭터|포즈|표정|인물|손)/u.test(searchable)) {
    return "character";
  }
  if (/(?:panel|frame|bubble|speech|sfx|effect|line|arrow|컷|프레임|말풍선|효과음|연출|집중선|속도선)/u.test(searchable)) {
    return "story";
  }
  return "prop";
}

function matchesWorkspaceFacet(
  item: StudioUnifiedAssetItem,
  facet: WorkspaceFacet,
): boolean {
  return facet === "all" || workspaceFacetForItem(item) === facet;
}

function isPlacementCapable(item: StudioUnifiedAssetItem): boolean {
  return item.source.kind === "local";
}

function detailsForItem(item: StudioUnifiedAssetItem): readonly string[] {
  const source = item.source;
  if (source.kind === "scene-template") {
    return Object.freeze(["현재 페이지에 적용", "적용 후 개별 요소 편집", "한 번에 실행 취소"]);
  }
  if (source.kind === "object-3d") {
    return Object.freeze([
      source.value.openTarget === "vrm-poser" ? "3D 캐릭터·소품 편집기" : "3D 배경 편집기",
      "카메라·회전·크기 편집",
      "캔버스로 직접 드래그 가능",
    ]);
  }
  if (source.kind === "background") {
    return Object.freeze([source.value.genre, "현재 페이지에 삽입", "원본 비율 유지"]);
  }
  if (source.kind === "element") {
    return Object.freeze([source.value.category, "벡터 크기 조절", "회전·복제 가능"]);
  }
  if (source.kind === "local") {
    return Object.freeze([
      `${source.value.width} × ${source.value.height}px`,
      "내 에셋",
      "배치 방식 선택 가능",
    ]);
  }
  return Object.freeze(["Studio 네이티브 도구", "편집 가능한 결과"]);
}

export function StudioUnifiedAssetWorkspace({
  items,
  legacyContent,
  initialView = "discover",
  onUseItem,
  onUseAction,
  onUploadImage,
  onOpenAi,
  selectionPlacementAvailable = false,
  reviewLocked = false,
}: StudioUnifiedAssetWorkspaceProps) {
  const searchId = useId();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<WorkspaceView>(initialView);
  const [query, setQuery] = useState("");
  const [facet, setFacet] = useState<WorkspaceFacet>("all");
  const [collection, setCollection] = useState<StudioInsertHubCollection>("all");
  const [density, setDensity] = useState<GridDensity>("visual");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [acknowledgedCautionId, setAcknowledgedCautionId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<StudioInsertHubPreferences>(() =>
    loadStudioInsertHubPreferences(browserStorage()),
  );

  const allEntries = useMemo(() => buildStudioInsertHubEntries(items), [items]);
  const assetEntries = useMemo(
    () => allEntries.filter(
      (entry): entry is StudioInsertHubAssetEntry => entry.kind === "asset",
    ),
    [allEntries],
  );
  const entriesById = useMemo(
    () => new Map(assetEntries.map((entry) => [entry.id, entry] as const)),
    [assetEntries],
  );
  const activeFacet = BROWSE_FACETS.find((candidate) => candidate.id === facet)
    ?? BROWSE_FACETS[0];
  const category = activeFacet.category;
  const facetCounts = useMemo<Readonly<Record<WorkspaceFacet, number>>>(() => {
    const next = {} as Record<WorkspaceFacet, number>;
    for (const candidate of BROWSE_FACETS) {
      next[candidate.id] = candidate.id === "all"
        ? assetEntries.length
        : assetEntries.filter((entry) => matchesWorkspaceFacet(entry.item, candidate.id)).length;
    }
    return Object.freeze(next);
  }, [assetEntries]);
  const previewById = useMemo(
    () => new Map(items.map((item) => [
      item.id,
      resolveStudioUnifiedAssetRichPreview(item),
    ] as const)),
    [items],
  );
  const previewAudit = useMemo(() => auditStudioUnifiedAssetPreviews(items), [items]);
  const results = useMemo(
    () => selectStudioInsertHubEntries(assetEntries, {
      query,
      category,
      collection,
      preferences,
      limit: 180,
    }).filter((entry): entry is StudioInsertHubAssetEntry => entry.kind === "asset")
      .filter((entry) => matchesWorkspaceFacet(entry.item, facet)),
    [assetEntries, category, collection, facet, preferences, query],
  );
  const selectedEntry = selectedId ? entriesById.get(selectedId) ?? null : null;
  const selected = selectedEntry?.item ?? null;
  const selectedPreview = selected ? previewById.get(selected.id) ?? null : null;
  const selectedRequiresReview = selected?.discoverability === "caution";
  const selectedAcknowledged = !selectedRequiresReview
    || acknowledgedCautionId === selected?.id;
  const availableIdsKey = useMemo(
    () => assetEntries.map((entry) => entry.id).sort().join("\u0000"),
    [assetEntries],
  );

  useEffect(() => {
    const availableIds = new Set(assetEntries.map((entry) => entry.id));
    setPreferences((current) => saveStudioInsertHubPreferences(
      browserStorage(),
      reconcileStudioInsertHubPreferences(current, availableIds),
    ));
  }, [assetEntries, availableIdsKey]);

  useEffect(() => {
    if (selectedId && results.some((entry) => entry.id === selectedId)) return;
    setSelectedId(results[0]?.id ?? null);
  }, [results, selectedId]);

  useEffect(() => {
    setAcknowledgedCautionId(null);
  }, [selectedId]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent): void {
      if (
        event.key !== "/"
        || event.metaKey
        || event.ctrlKey
        || event.altKey
        || event.defaultPrevented
      ) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  function commitPreferences(
    next: StudioInsertHubPreferences,
  ): void {
    setPreferences(saveStudioInsertHubPreferences(browserStorage(), next));
  }

  async function handleUseItem(item: StudioUnifiedAssetItem): Promise<void> {
    if (pendingId || reviewLocked) {
      if (reviewLocked) {
        setStatus({ tone: "error", message: "검토 잠금을 해제한 뒤 에셋을 추가해 주세요." });
      }
      return;
    }
    if (item.discoverability === "caution" && acknowledgedCautionId !== item.id) {
      setSelectedId(item.id);
      setStatus({
        tone: "error",
        message: "권리와 출처 확인이 필요한 에셋입니다. 상세 패널에서 확인 후 사용해 주세요.",
      });
      return;
    }
    setPendingId(item.id);
    setStatus(null);
    try {
      const used = await onUseItem(item, preferences.placementMode);
      if (used === false) {
        throw new Error("현재 캔버스 상태에서는 이 에셋을 사용할 수 없습니다.");
      }
      commitPreferences(recordStudioInsertRecent(preferences, item.id));
      setStatus({ tone: "success", message: successMessage(item) });
    } catch (caught: unknown) {
      setStatus({
        tone: "error",
        message: caught instanceof Error
          ? caught.message
          : "에셋을 사용하지 못했습니다. 캔버스 상태를 확인해 주세요.",
      });
    } finally {
      setPendingId(null);
    }
  }

  async function handleQuickAction(actionId: StudioInsertActionId): Promise<void> {
    if (!onUseAction || pendingId || reviewLocked) return;
    if (actionId === "upload") {
      uploadInputRef.current?.click();
      return;
    }
    const pendingKey = `action:${actionId}`;
    setPendingId(pendingKey);
    setStatus(null);
    try {
      const used = await onUseAction(actionId);
      if (used === false) throw new Error("현재 상태에서는 이 도구를 열 수 없습니다.");
    } catch (caught: unknown) {
      setStatus({
        tone: "error",
        message: caught instanceof Error ? caught.message : "도구를 열지 못했습니다.",
      });
    } finally {
      setPendingId(null);
    }
  }

  function resetDiscovery(): void {
    setQuery("");
    setFacet("all");
    setCollection("all");
    setStatus(null);
  }

  const quickActions = onUseAction
    ? STUDIO_INSERT_ACTIONS.filter((action) => QUICK_ACTION_ID_SET.has(action.actionId))
    : [];

  return (
    <section
      aria-label="통합 에셋 작업 공간"
      data-studio-unified-asset-workspace="true"
      data-studio-asset-workspace-layout="responsive-three-pane"
      className="w-[min(74rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] min-w-0"
    >
      <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-line bg-card p-1">
        <div className="grid flex-1 grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setView("discover")}
            aria-pressed={view === "discover"}
            className={cn(
              "min-h-11 rounded-lg px-3 text-xs font-bold transition-colors",
              FOCUS,
              view === "discover"
                ? "bg-accent text-on-accent shadow-sm"
                : "text-fg-3 hover:bg-raised",
            )}
          >
            통합 탐색
          </button>
          <button
            type="button"
            onClick={() => setView("library")}
            aria-pressed={view === "library"}
            className={cn(
              "min-h-11 rounded-lg px-3 text-xs font-bold transition-colors",
              FOCUS,
              view === "library"
                ? "bg-accent text-on-accent shadow-sm"
                : "text-fg-3 hover:bg-raised",
            )}
          >
            보관함 · 마켓
          </button>
        </div>
        <span className="hidden rounded-full border border-good/30 bg-good/10 px-2.5 py-1 text-[0.68rem] font-bold text-good sm:inline-flex">
          시각 미리보기 {previewAudit.coveragePercent}%
        </span>
      </div>

      {view === "library" ? (
        <div className="max-h-[min(78dvh,52rem)] overflow-y-auto rounded-xl border border-line bg-panel p-3">
          {legacyContent}
        </div>
      ) : (
        <div className="space-y-3">
          <header className="rounded-2xl border border-accent/20 bg-gradient-to-br from-accent-soft/55 via-panel to-panel p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-panel text-accent shadow-sm">
                    <Library size={18} aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-fg">에셋 워크스페이스</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
                      2D 배경 {facetCounts.background}개 · 3D {previewAudit.interactive3d}개 · 장면 레시피 {previewAudit.templates}개
                    </p>
                  </div>
                </div>
              </div>
              <div className="relative min-w-0 flex-1 sm:max-w-xl">
                <label htmlFor={searchId} className="sr-only">에셋 통합 검색</label>
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
                  aria-hidden
                />
                <input
                  ref={searchInputRef}
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value.slice(0, 120));
                    setStatus(null);
                  }}
                  placeholder="비 오는 밤 골목, 학교 대화 장면, 3D 책상…  / 로 검색"
                  className={cn(
                    "min-h-12 w-full rounded-xl border border-line bg-card pl-10 pr-12 text-sm text-fg shadow-sm placeholder:text-fg-3",
                    FOCUS,
                  )}
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setStatus(null);
                    }}
                    aria-label="통합 에셋 검색어 지우기"
                    className={cn(
                      "absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-fg-3 hover:bg-raised",
                      FOCUS,
                    )}
                  >
                    <X size={15} aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>

            {quickActions.length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="빠른 삽입">
                {quickActions.map((action) => {
                  const Icon = quickActionIcon(action.actionId);
                  return (
                    <button
                      key={action.id}
                      type="button"
                      disabled={pendingId !== null || reviewLocked}
                      onClick={() => void handleQuickAction(action.actionId)}
                      className={cn(
                        "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs font-semibold text-fg-2 shadow-sm transition-colors hover:border-accent/45 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50",
                        FOCUS,
                      )}
                    >
                      <Icon size={14} className="text-accent" aria-hidden />
                      {action.title}
                    </button>
                  );
                })}
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(event) => {
                    if (reviewLocked) {
                      setStatus({
                        tone: "error",
                        message: "검토 잠금을 해제한 뒤 이미지를 가져와 주세요.",
                      });
                    } else if (onUploadImage) {
                      void Promise.resolve(onUploadImage(event)).catch((caught: unknown) => {
                        setStatus({
                          tone: "error",
                          message: caught instanceof Error
                            ? caught.message
                            : "이미지를 가져오지 못했습니다.",
                        });
                      });
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </div>
            ) : null}
          </header>

          {!query ? (
            <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="빠른 에셋 검색">
              {QUICK_QUERIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setQuery(value)}
                  className={cn(
                    "min-h-9 shrink-0 rounded-full border border-line bg-card px-3 text-xs font-semibold text-fg-3 hover:border-accent/50 hover:text-accent pointer-coarse:min-h-11",
                    FOCUS,
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid min-h-0 gap-3 lg:grid-cols-[11rem_minmax(22rem,1fr)_20rem]">
            <aside className="min-w-0 rounded-xl border border-line bg-panel p-2 lg:max-h-[min(68dvh,46rem)] lg:overflow-y-auto">
              <div className="flex gap-1 overflow-x-auto lg:block lg:space-y-1" aria-label="에셋 분류">
                {BROWSE_FACETS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setFacet(option.id);
                      setStatus(null);
                    }}
                    aria-pressed={facet === option.id}
                    className={cn(
                      "flex min-h-10 shrink-0 items-center justify-between gap-2 rounded-lg px-3 text-left text-xs font-semibold transition-colors lg:w-full",
                      FOCUS,
                      facet === option.id
                        ? "bg-accent-soft text-accent"
                        : "text-fg-3 hover:bg-raised hover:text-fg-2",
                    )}
                  >
                    <span>{option.label}</span>
                    <span className="rounded-full bg-panel px-1.5 py-0.5 text-[0.65rem] tabular-nums">
                      {facetCounts[option.id]}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-2 border-t border-line pt-2">
                <p className="mb-1 hidden px-3 text-[0.68rem] font-bold uppercase tracking-wide text-fg-3 lg:block">
                  내 작업
                </p>
                <div className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
                  {COLLECTIONS.map((option) => {
                    const Icon = option === "favorites"
                      ? Heart
                      : option === "recent"
                        ? Clock3
                        : FolderOpen;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setCollection(option);
                          setStatus(null);
                        }}
                        aria-pressed={collection === option}
                        className={cn(
                          "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors lg:w-full",
                          FOCUS,
                          collection === option
                            ? "bg-raised text-fg"
                            : "text-fg-3 hover:bg-raised",
                        )}
                      >
                        <Icon size={14} aria-hidden />
                        {STUDIO_INSERT_HUB_COLLECTION_LABELS[option]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFiltersOpen((value) => !value)}
                aria-expanded={filtersOpen}
                className={cn(
                  "mt-2 flex min-h-10 w-full items-center justify-between rounded-lg border border-line px-3 text-xs font-semibold text-fg-3 hover:bg-raised",
                  FOCUS,
                )}
              >
                <span className="inline-flex items-center gap-2"><Filter size={14} aria-hidden />필터·보기</span>
                <ChevronDown size={14} className={cn("transition-transform", filtersOpen && "rotate-180")} aria-hidden />
              </button>

              {filtersOpen ? (
                <div className="mt-2 space-y-2 rounded-lg bg-card p-2">
                  <p className="text-[0.68rem] font-bold text-fg-3">카드 밀도</p>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setDensity("visual")}
                      aria-pressed={density === "visual"}
                      className={cn(
                        "grid min-h-10 place-items-center rounded-lg border text-xs",
                        FOCUS,
                        density === "visual" ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-3",
                      )}
                    ><LayoutGrid size={15} aria-hidden /><span className="sr-only">큰 그리드</span></button>
                    <button
                      type="button"
                      onClick={() => setDensity("compact")}
                      aria-pressed={density === "compact"}
                      className={cn(
                        "grid min-h-10 place-items-center rounded-lg border text-xs",
                        FOCUS,
                        density === "compact" ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-3",
                      )}
                    ><LayoutList size={15} aria-hidden /><span className="sr-only">작은 그리드</span></button>
                  </div>
                </div>
              ) : null}
            </aside>

            <main className="min-w-0 rounded-xl border border-line bg-panel p-2 sm:p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p role="status" aria-live="polite" className="text-xs text-fg-3">
                  {query.trim()
                    ? `검색 결과 ${results.length}개`
                    : `${activeFacet.label} ${results.length}개`}
                </p>
                {(query || facet !== "all" || collection !== "all") ? (
                  <button
                    type="button"
                    onClick={resetDiscovery}
                    className={cn("min-h-9 px-2 text-xs font-semibold text-fg-3 underline", FOCUS)}
                  >
                    초기화
                  </button>
                ) : null}
              </div>

              {results.length > 0 ? (
                <div
                  className={cn(
                    "grid max-h-[min(64dvh,43rem)] gap-2 overflow-y-auto pr-1",
                    density === "visual"
                      ? "grid-cols-2 2xl:grid-cols-3"
                      : "grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4",
                  )}
                >
                  {results.map((entry) => {
                    const item = entry.item;
                    const preview = previewById.get(item.id)!;
                    const favorite = preferences.favoriteIds.includes(item.id);
                    const selectedCard = selectedId === item.id;
                    const draggable = !reviewLocked && canDragStudioInsertHubEntry(entry);
                    return (
                      <article
                        key={item.id}
                        data-studio-insert-entry={item.id}
                        data-studio-unified-asset={item.id}
                        className={cn(
                          "group relative min-w-0 overflow-hidden rounded-xl border bg-card transition-all",
                          selectedCard
                            ? "border-accent shadow-[0_0_0_1px_var(--accent)]"
                            : "border-line hover:border-accent/45 hover:shadow-sm",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(item.id);
                            setStatus(null);
                          }}
                          onDoubleClick={() => {
                            if (item.discoverability !== "caution") void handleUseItem(item);
                          }}
                          onKeyDown={(event) => {
                            if (
                              event.key === "Enter"
                              && item.discoverability !== "caution"
                            ) {
                              event.preventDefault();
                              void handleUseItem(item);
                            }
                          }}
                          aria-label={`${item.title} 상세 미리보기`}
                          className={cn("block w-full text-left", FOCUS)}
                        >
                          <div className={cn(
                            "relative overflow-hidden",
                            density === "visual" ? "aspect-[4/3]" : "aspect-square",
                          )}>
                            <StudioUnifiedAssetPreviewSurface preview={preview} mode="thumbnail" />
                            <span className="absolute left-2 top-2 rounded-full border border-white/60 bg-panel/90 px-2 py-1 text-[0.65rem] font-bold text-fg-2 shadow-sm backdrop-blur">
                              {item.categoryLabel}
                            </span>
                            {item.discoverability === "caution" ? (
                              <span className="absolute bottom-2 left-2 rounded-full border border-warn/35 bg-panel/90 px-2 py-1 text-[0.65rem] font-bold text-warn backdrop-blur">
                                권리 확인
                              </span>
                            ) : null}
                          </div>
                          <div className="p-2.5">
                            <h4 className="line-clamp-2 text-sm font-black leading-5 text-fg">{item.title}</h4>
                            {density === "visual" ? (
                              <p className="mt-1 line-clamp-2 min-h-9 text-xs leading-[1.15rem] text-fg-3">{item.description}</p>
                            ) : null}
                          </div>
                        </button>

                        <div className="flex items-center gap-1 border-t border-line p-1.5">
                          <button
                            type="button"
                            onClick={() => commitPreferences(toggleStudioInsertFavorite(preferences, item.id))}
                            aria-label={favorite ? `${item.title} 즐겨찾기 해제` : `${item.title} 즐겨찾기 추가`}
                            aria-pressed={favorite}
                            className={cn(
                              "grid size-10 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-accent",
                              FOCUS,
                              favorite && "text-accent",
                            )}
                          >
                            <Heart size={15} fill={favorite ? "currentColor" : "none"} aria-hidden />
                          </button>
                          <button
                            type="button"
                            data-studio-insert-drag-handle="true"
                            draggable={draggable}
                            onClick={() => setSelectedId(item.id)}
                            aria-label={`${item.title} 캔버스로 끌어 놓기`}
                            title={draggable ? "캔버스의 원하는 위치로 끌어 놓기" : "상세 미리보기 선택"}
                            className={cn(
                              "grid size-10 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised",
                              FOCUS,
                              draggable && "cursor-grab active:cursor-grabbing",
                            )}
                          >
                            <GripVertical size={15} aria-hidden />
                          </button>
                          <button
                            type="button"
                            disabled={pendingId !== null || reviewLocked}
                            onClick={() => void handleUseItem(item)}
                            aria-label={`${item.title} ${item.useLabel}`}
                            className={cn(
                              "inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-2 text-xs font-bold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50",
                              FOCUS,
                            )}
                          >
                            {item.useMode === "open" ? <Box size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
                            <span className="truncate">{pendingId === item.id ? "처리 중…" : item.useLabel}</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-line bg-card p-6 text-center">
                  <div>
                    <ImageIcon size={30} className="mx-auto text-fg-3" aria-hidden />
                    <h4 className="mt-3 text-sm font-black text-fg">조건에 맞는 에셋이 없습니다.</h4>
                    <p className="mt-1 text-xs leading-relaxed text-fg-3">검색어 또는 분류를 넓히거나 새 장면을 만들어 보세요.</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={resetDiscovery}
                        className={cn("min-h-10 rounded-lg border border-line bg-panel px-3 text-xs font-bold text-fg-2", FOCUS)}
                      >
                        조건 넓히기
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenAi(query.trim())}
                        aria-label="AI 도구에서 만들기"
                        className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent", FOCUS)}
                      >
                        <Sparkles size={14} aria-hidden />AI 도구에서 만들기
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </main>

            <aside className="min-w-0 rounded-xl border border-line bg-panel p-3 lg:max-h-[min(68dvh,46rem)] lg:overflow-y-auto">
              {selected && selectedPreview ? (
                <div data-studio-asset-detail={selected.id}>
                  <div className="aspect-[4/3] overflow-hidden rounded-xl border border-line bg-card">
                    <StudioUnifiedAssetPreviewSurface
                      preview={selectedPreview}
                      mode={selectedPreview.kind === "three" ? "interactive" : "thumbnail"}
                    />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[0.68rem] font-bold uppercase tracking-wide text-accent">{selected.categoryLabel}</p>
                        <h3 className="mt-1 text-base font-black leading-tight text-fg">{selected.title}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => commitPreferences(toggleStudioInsertFavorite(preferences, selected.id))}
                        aria-label={preferences.favoriteIds.includes(selected.id) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                        aria-pressed={preferences.favoriteIds.includes(selected.id)}
                        className={cn("grid size-10 shrink-0 place-items-center rounded-lg border border-line text-fg-3 hover:bg-raised hover:text-accent", FOCUS)}
                      >
                        <Heart
                          size={16}
                          fill={preferences.favoriteIds.includes(selected.id) ? "currentColor" : "none"}
                          aria-hidden
                        />
                      </button>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-fg-3">{selected.description}</p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Array.from(new Set([...selectedPreview.facts, ...detailsForItem(selected)])).slice(0, 6).map((fact) => (
                      <span key={fact} className="rounded-full border border-line bg-card px-2 py-1 text-[0.68rem] font-semibold text-fg-3">
                        {fact}
                      </span>
                    ))}
                  </div>

                  {isPlacementCapable(selected) ? (
                    <fieldset className="mt-3 rounded-xl border border-line bg-card p-2.5">
                      <legend className="px-1 text-xs font-bold text-fg-2">삽입 위치</legend>
                      <div className="grid grid-cols-3 gap-1">
                        {(["auto", "page", "selection"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            disabled={mode === "selection" && !selectionPlacementAvailable}
                            onClick={() => commitPreferences(setStudioInsertPlacementMode(preferences, mode))}
                            aria-pressed={preferences.placementMode === mode}
                            className={cn(
                              "min-h-10 rounded-lg border px-1 text-[0.68rem] font-semibold disabled:cursor-not-allowed disabled:opacity-40",
                              FOCUS,
                              preferences.placementMode === mode
                                ? "border-accent bg-accent-soft text-accent"
                                : "border-line text-fg-3 hover:bg-raised",
                            )}
                          >
                            {STUDIO_INSERT_PLACEMENT_LABELS[mode]}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  {selectedRequiresReview ? (
                    <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-warn/35 bg-warn/10 p-3 text-xs leading-relaxed text-fg-2">
                      <input
                        type="checkbox"
                        checked={selectedAcknowledged}
                        onChange={(event) => setAcknowledgedCautionId(event.target.checked ? selected.id : null)}
                        className="mt-0.5 size-4 accent-current"
                      />
                      <span>
                        <strong className="block text-warn">권리·출처 확인 필요</strong>
                        이 에셋의 사용 조건을 확인했으며 현재 작품에서 사용할 책임이 있음을 이해했습니다.
                      </span>
                    </label>
                  ) : (
                    <p className="mt-3 rounded-xl border border-good/30 bg-good/10 p-2.5 text-xs font-semibold text-good">
                      Studio 내장 또는 확인된 에셋 · 별도 검토 없이 바로 사용할 수 있습니다.
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={pendingId !== null || reviewLocked || !selectedAcknowledged}
                    onClick={() => void handleUseItem(selected)}
                    className={cn(
                      "mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 text-sm font-black text-on-accent shadow-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50",
                      FOCUS,
                    )}
                  >
                    {selected.useMode === "open" ? <Box size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
                    {pendingId === selected.id ? "처리 중…" : selected.useLabel}
                  </button>
                  {selectedEntry && canDragStudioInsertHubEntry(selectedEntry) ? (
                    <p className="mt-2 text-center text-[0.68rem] text-fg-3">카드의 드래그 핸들로 캔버스 위치에 바로 놓을 수 있습니다.</p>
                  ) : null}
                </div>
              ) : (
                <div className="grid min-h-72 place-items-center text-center text-xs text-fg-3">
                  <div>
                    <Search size={24} className="mx-auto mb-2" aria-hidden />
                    에셋을 선택하면 실제 미리보기와 적용 옵션이 표시됩니다.
                  </div>
                </div>
              )}
            </aside>
          </div>

          {status ? (
            <p
              role={status.tone === "error" ? "alert" : "status"}
              aria-live="polite"
              className={cn(
                "rounded-xl border px-3 py-2.5 text-xs leading-relaxed",
                status.tone === "error"
                  ? "border-bad/35 bg-bad/10 text-bad"
                  : "border-good/35 bg-good/10 text-good",
              )}
            >
              {status.message}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
