import {
  Box,
  Bookmark,
  Clock3,
  Clapperboard,
  Grid2x2,
  Image as ImageIcon,
  Images,
  LayoutTemplate,
  MessageCircle,
  PenTool,
  Search,
  Shapes,
  Sparkles,
  Star,
  Sticker as StickerIcon,
  Type as TypeIcon,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { svgToDataUrl } from "./studio-characters";
import {
  buildStudioInsertHubEntries,
  countStudioInsertHubEntries,
  loadStudioInsertHubPreferences,
  reconcileStudioInsertHubPreferences,
  recordStudioInsertRecent,
  saveStudioInsertHubPreferences,
  selectStudioInsertHubEntries,
  setStudioInsertPlacementMode,
  STUDIO_INSERT_HUB_CATEGORY_LABELS,
  STUDIO_INSERT_HUB_COLLECTION_LABELS,
  STUDIO_INSERT_HUB_MAX_QUERY_LENGTH,
  STUDIO_INSERT_PLACEMENT_LABELS,
  toggleStudioInsertFavorite,
  type StudioInsertActionId,
  type StudioInsertHubCategory,
  type StudioInsertHubCollection,
  type StudioInsertHubEntry,
  type StudioInsertHubIcon,
  type StudioInsertHubPreferences,
  type StudioInsertPlacementMode,
} from "./studio-insert-hub-model";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

import { cn } from "@/shared/lib/utils";

const CATEGORY_OPTIONS: readonly StudioInsertHubCategory[] = [
  "all",
  "quick",
  "scene",
  "element",
  "media",
  "3d",
  "mine",
];

const COLLECTION_OPTIONS: readonly StudioInsertHubCollection[] = [
  "all",
  "favorites",
  "recent",
];

const PLACEMENT_OPTIONS: readonly StudioInsertPlacementMode[] = [
  "auto",
  "page",
  "selection",
];

const QUICK_ENTRY_IDS = [
  "action:text",
  "action:bubble",
  "action:upload",
  "action:elements",
  "action:scene",
  "action:ai",
] as const;

const QUICK_QUERIES = [
  "말풍선",
  "학교 배경",
  "효과",
  "소품",
  "3D",
  "내 에셋",
] as const;

const IMAGE_ACCEPT =
  "image/*,.bmp,.dib,.tga,.icb,.vda,.vst,.ppm,.pam,.qoi,.tif,.tiff";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-panel";
const CONTROL =
  `min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised ${FOCUS}`;

export type StudioInsertHubWorkspaceView = "insert" | "library";

type Status = {
  readonly tone: "success" | "error";
  readonly message: string;
};

export interface StudioInsertHubWorkspaceProps {
  readonly items: readonly StudioUnifiedAssetItem[];
  readonly legacyContent: ReactNode;
  readonly initialView?: StudioInsertHubWorkspaceView;
  readonly selectionPlacementAvailable: boolean;
  readonly onUseItem: (
    item: StudioUnifiedAssetItem,
    placementMode: StudioInsertPlacementMode,
  ) => boolean | void | Promise<boolean | void>;
  readonly onUseAction: (
    actionId: StudioInsertActionId,
  ) => boolean | void | Promise<boolean | void>;
  readonly onUploadImage: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  readonly onOpenAi: (prompt: string) => void;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function actionIcon(icon: StudioInsertHubIcon, size = 22) {
  const props = { size, "aria-hidden": true } as const;
  if (icon === "text") return <TypeIcon {...props} />;
  if (icon === "bubble") return <MessageCircle {...props} />;
  if (icon === "upload") return <Upload {...props} />;
  if (icon === "stock") return <Images {...props} />;
  if (icon === "template") return <LayoutTemplate {...props} />;
  if (icon === "collage") return <Grid2x2 {...props} />;
  if (icon === "elements") return <Shapes {...props} />;
  if (icon === "scene") return <Clapperboard {...props} />;
  if (icon === "clip") return <Bookmark {...props} />;
  if (icon === "sticker") return <StickerIcon {...props} />;
  if (icon === "emeres") return <PenTool {...props} />;
  if (icon === "background3d") return <Box {...props} />;
  return <Sparkles {...props} />;
}

function EntryPreview({ entry }: { readonly entry: StudioInsertHubEntry }) {
  if (entry.kind === "action") {
    return (
      <span className="grid size-14 place-items-center rounded-2xl border border-accent/20 bg-panel text-accent shadow-sm">
        {actionIcon(entry.icon)}
      </span>
    );
  }
  if (entry.preview.kind === "image") {
    return (
      <img
        src={entry.preview.src}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-contain"
      />
    );
  }
  if (entry.preview.kind === "svg") {
    return (
      <img
        src={svgToDataUrl(entry.preview.svg)}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-contain"
      />
    );
  }
  return (
    <span className="grid size-14 place-items-center rounded-2xl border border-line bg-panel text-accent">
      <ImageIcon size={22} aria-hidden />
    </span>
  );
}

function successMessage(entry: StudioInsertHubEntry): string {
  if (entry.kind === "action") {
    if (entry.actionId === "text") {
      return "편집 가능한 텍스트를 추가했습니다.";
    }
    return `${entry.title} 도구를 열었습니다.`;
  }
  if (entry.item.useMode === "open") {
    return `${entry.title} 편집 도구를 열었습니다.`;
  }
  if (entry.item.useMode === "apply") {
    return `${entry.title} 장면을 배치했습니다.`;
  }
  return `${entry.title}을(를) 캔버스에 삽입했습니다.`;
}

function countAvailablePreferenceIds(
  ids: readonly string[],
  availableIds: ReadonlySet<string>,
): number {
  return ids.reduce((count, id) => count + Number(availableIds.has(id)), 0);
}

export function StudioInsertHubWorkspace({
  items,
  legacyContent,
  initialView = "insert",
  selectionPlacementAvailable,
  onUseItem,
  onUseAction,
  onUploadImage,
  onOpenAi,
}: StudioInsertHubWorkspaceProps) {
  const searchId = useId();
  const uploadInputId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<StudioInsertHubWorkspaceView>(initialView);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<StudioInsertHubCategory>("all");
  const [collection, setCollection] =
    useState<StudioInsertHubCollection>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [preferences, setPreferences] = useState<StudioInsertHubPreferences>(() =>
    loadStudioInsertHubPreferences(browserStorage()),
  );
  const preferencesRef = useRef(preferences);

  const entries = useMemo(() => buildStudioInsertHubEntries(items), [items]);
  const availableIds = useMemo(
    () => new Set(entries.map((entry) => entry.id)),
    [entries],
  );
  const counts = useMemo(() => countStudioInsertHubEntries(entries), [entries]);
  const favoriteCount = countAvailablePreferenceIds(
    preferences.favoriteIds,
    availableIds,
  );
  const recentCount = countAvailablePreferenceIds(
    preferences.recentIds,
    availableIds,
  );
  const results = useMemo(
    () =>
      selectStudioInsertHubEntries(entries, {
        query,
        category,
        collection,
        preferences,
        limit: 160,
      }),
    [category, collection, entries, preferences, query],
  );
  const quickEntries = useMemo(() => {
    const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
    return QUICK_ENTRY_IDS.map((id) => byId.get(id)).filter(
      (entry): entry is StudioInsertHubEntry => Boolean(entry),
    );
  }, [entries]);

  function commitPreferences(next: StudioInsertHubPreferences): void {
    const saved = saveStudioInsertHubPreferences(browserStorage(), next);
    preferencesRef.current = saved;
    setPreferences(saved);
  }

  function updatePreferences(
    update: (current: StudioInsertHubPreferences) => StudioInsertHubPreferences,
  ): void {
    commitPreferences(update(preferencesRef.current));
  }

  function rememberRecent(entryId: string): void {
    updatePreferences((current) => recordStudioInsertRecent(current, entryId));
  }

  useEffect(() => {
    const next = reconcileStudioInsertHubPreferences(
      preferencesRef.current,
      availableIds,
    );
    const saved = saveStudioInsertHubPreferences(browserStorage(), next);
    preferencesRef.current = saved;
    setPreferences(saved);
  }, [availableIds]);

  useEffect(() => {
    if (
      selectionPlacementAvailable ||
      preferences.placementMode !== "selection"
    ) {
      return;
    }
    const next = setStudioInsertPlacementMode(
      preferencesRef.current,
      "auto",
    );
    const saved = saveStudioInsertHubPreferences(browserStorage(), next);
    preferencesRef.current = saved;
    setPreferences(saved);
  }, [preferences.placementMode, selectionPlacementAvailable]);

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent): void {
      if (
        view !== "insert" ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      const target = event.target;
      const editing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (event.key === "/" && !editing) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [view]);

  async function handleUseEntry(entry: StudioInsertHubEntry): Promise<void> {
    if (pendingId) return;
    if (entry.kind === "action" && entry.actionId === "upload") {
      setStatus(null);
      uploadRef.current?.click();
      return;
    }
    setPendingId(entry.id);
    setStatus(null);
    try {
      const outcome =
        entry.kind === "action"
          ? onUseAction(entry.actionId)
          : onUseItem(entry.item, preferencesRef.current.placementMode);
      const used =
        outcome &&
        typeof (outcome as PromiseLike<boolean | void>).then === "function"
          ? await outcome
          : outcome;
      if (used === false) {
        throw new Error(
          "현재 캔버스 상태에서는 이 에셋을 사용할 수 없습니다.",
        );
      }
      rememberRecent(entry.id);
      setStatus({ tone: "success", message: successMessage(entry) });
    } catch (caught: unknown) {
      setStatus({
        tone: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "항목을 사용하지 못했습니다. 캔버스 상태를 확인해 주세요.",
      });
    } finally {
      setPendingId(null);
    }
  }

  async function handleUploadChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const input = event.currentTarget;
    if (!input.files?.length) return;
    setPendingId("action:upload");
    setStatus(null);
    try {
      await onUploadImage(event);
      rememberRecent("action:upload");
      setStatus({
        tone: "success",
        message: "기기 이미지를 캔버스에 가져왔습니다.",
      });
    } catch (caught: unknown) {
      setStatus({
        tone: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "이미지를 가져오지 못했습니다.",
      });
    } finally {
      input.value = "";
      setPendingId(null);
    }
  }

  function resetDiscovery(): void {
    setQuery("");
    setCategory("all");
    setCollection("all");
    setStatus(null);
  }

  return (
    <section
      aria-label="삽입 허브"
      data-studio-insert-hub="true"
      className="min-w-0"
    >
      <input
        ref={uploadRef}
        id={uploadInputId}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          void handleUploadChange(event)
        }
      />

      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-line bg-card p-1">
        <button
          type="button"
          onClick={() => setView("insert")}
          aria-pressed={view === "insert"}
          className={cn(
            "min-h-11 rounded-lg px-2 text-xs font-bold transition-colors",
            FOCUS,
            view === "insert"
              ? "bg-accent text-on-accent shadow-sm"
              : "text-fg-3 hover:bg-raised",
          )}
        >
          삽입 허브
        </button>
        <button
          type="button"
          onClick={() => setView("library")}
          aria-pressed={view === "library"}
          className={cn(
            "min-h-11 rounded-lg px-2 text-xs font-bold transition-colors",
            FOCUS,
            view === "library"
              ? "bg-accent text-on-accent shadow-sm"
              : "text-fg-3 hover:bg-raised",
          )}
        >
          보관함 · 마켓
        </button>
      </div>

      {view === "library" ? (
        legacyContent
      ) : (
        <div className="space-y-3">
          <header className="rounded-xl border border-accent/25 bg-accent-soft/35 p-3">
            <div className="flex items-start gap-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-panel text-accent shadow-sm">
                <WandSparkles size={18} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-fg">
                    한곳에서 찾아 바로 삽입
                  </h3>
                  <kbd className="hidden rounded border border-line bg-panel px-1.5 py-0.5 text-[0.58rem] font-bold text-fg-3 sm:inline">
                    /
                  </kbd>
                </div>
                <p className="mt-1 text-[0.66rem] leading-relaxed text-fg-3">
                  텍스트·말풍선·이미지·레이아웃·효과·3D·내 에셋을 통합
                  검색하고 최근 사용과 즐겨찾기로 반복 작업을 줄입니다.
                </p>
              </div>
            </div>
          </header>

          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              에셋 통합 검색
            </label>
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
              aria-hidden
            />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              value={query}
              maxLength={STUDIO_INSERT_HUB_MAX_QUERY_LENGTH}
              aria-keyshortcuts="/"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setQuery(event.target.value);
                setStatus(null);
              }}
              onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  setQuery("");
                }
              }}
              placeholder="예: 말풍선, 학교 배경, 3D 소품, 내 에셋"
              className={cn(
                CONTROL,
                "w-full pl-9 pr-11 font-normal text-fg placeholder:text-fg-3",
              )}
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatus(null);
                  searchRef.current?.focus();
                }}
                aria-label="삽입 검색어 지우기"
                className={cn(
                  "absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-fg-3 hover:bg-raised",
                  FOCUS,
                )}
              >
                <X size={14} aria-hidden />
              </button>
            ) : null}
          </div>

          {!query && category === "all" && collection === "all" ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[0.6rem] font-bold uppercase tracking-wide text-fg-3">
                  빠른 삽입
                </p>
                <span className="text-[0.58rem] text-fg-3">
                  자주 쓰는 6개
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {quickEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={pendingId !== null}
                    onClick={() => void handleUseEntry(entry)}
                    className={cn(
                      "flex min-h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-line bg-card px-1.5 py-2 text-center text-[0.6rem] font-bold leading-tight text-fg-2 transition-colors hover:border-accent/45 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50",
                      FOCUS,
                    )}
                  >
                    {entry.kind === "action" ? (
                      actionIcon(entry.icon, 18)
                    ) : (
                      <ImageIcon size={18} aria-hidden />
                    )}
                    <span className="line-clamp-2">{entry.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!query ? (
            <div
              className="flex gap-1.5 overflow-x-auto pb-1"
              aria-label="빠른 삽입 검색"
            >
              {QUICK_QUERIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setQuery(value);
                    setStatus(null);
                  }}
                  className={cn(
                    "min-h-9 shrink-0 rounded-full border border-line bg-card px-3 text-[0.66rem] font-semibold text-fg-3 transition-colors hover:border-accent/50 hover:text-accent pointer-coarse:min-h-11",
                    FOCUS,
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          ) : null}

          <div>
            <p className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-fg-3">
              내 작업
            </p>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-card p-1">
              {COLLECTION_OPTIONS.map((option) => {
                const count =
                  option === "favorites"
                    ? favoriteCount
                    : option === "recent"
                      ? recentCount
                      : counts.all;
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
                      "min-h-10 rounded-md px-1.5 text-[0.62rem] font-semibold transition-colors pointer-coarse:min-h-11",
                      FOCUS,
                      collection === option
                        ? "bg-accent-soft text-accent"
                        : "text-fg-3 hover:bg-raised",
                    )}
                  >
                    <span className="inline-flex items-center justify-center gap-1">
                      {option === "favorites" ? (
                        <Star size={12} aria-hidden />
                      ) : null}
                      {option === "recent" ? (
                        <Clock3 size={12} aria-hidden />
                      ) : null}
                      {STUDIO_INSERT_HUB_COLLECTION_LABELS[option]} {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-fg-3">
              종류
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setCategory(option);
                    setStatus(null);
                  }}
                  aria-pressed={category === option}
                  className={cn(
                    "min-h-10 shrink-0 rounded-lg border px-2.5 text-[0.65rem] font-semibold transition-colors pointer-coarse:min-h-11",
                    FOCUS,
                    category === option
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-3 hover:bg-raised",
                  )}
                >
                  {STUDIO_INSERT_HUB_CATEGORY_LABELS[option]} {counts[option]}
                </button>
              ))}
            </div>
          </div>

          <fieldset className="rounded-xl border border-line bg-card p-2.5">
            <legend className="px-1 text-[0.6rem] font-bold uppercase tracking-wide text-fg-3">
              내 에셋 이미지 배치
            </legend>
            <div className="grid grid-cols-3 gap-1">
              {PLACEMENT_OPTIONS.map((option) => {
                const disabled =
                  option === "selection" && !selectionPlacementAvailable;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      updatePreferences((current) =>
                        setStudioInsertPlacementMode(current, option),
                      );
                      setStatus(null);
                    }}
                    aria-pressed={preferences.placementMode === option}
                    className={cn(
                      "min-h-10 rounded-lg border px-1.5 text-[0.61rem] font-semibold transition-colors pointer-coarse:min-h-11",
                      FOCUS,
                      preferences.placementMode === option
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-panel text-fg-3 hover:bg-raised",
                      disabled && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {STUDIO_INSERT_PLACEMENT_LABELS[option]}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[0.58rem] leading-relaxed text-fg-3">
              {selectionPlacementAvailable
                ? "내 에셋 이미지 카드에 적용됩니다. 선택 영역은 현재 선택한 레이어의 경계에 비율을 유지해 맞춥니다."
                : "내 에셋 이미지 카드에 적용됩니다. 레이어를 선택하면 선택 영역 배치를 사용할 수 있습니다."}
            </p>
          </fieldset>

          <div className="flex items-center justify-between gap-2 text-xs">
            <p role="status" aria-live="polite" className="text-fg-3">
              {query.trim()
                ? `검색 결과 ${results.length}개`
                : `${STUDIO_INSERT_HUB_COLLECTION_LABELS[collection]} ${results.length}개`}
            </p>
            {query || category !== "all" || collection !== "all" ? (
              <button
                type="button"
                onClick={resetDiscovery}
                className={cn(
                  "min-h-9 px-1 text-[0.66rem] font-semibold text-fg-3 underline pointer-coarse:min-h-11",
                  FOCUS,
                )}
              >
                초기화
              </button>
            ) : null}
          </div>

          {results.length > 0 ? (
            <div className="grid max-h-[min(54dvh,35rem)] grid-cols-2 gap-2 overflow-y-auto pr-1">
              {results.map((entry) => {
                const favorite = preferences.favoriteIds.includes(entry.id);
                const isCaution =
                  entry.kind === "asset" &&
                  entry.item.discoverability === "caution";
                return (
                  <article
                    key={entry.id}
                    data-studio-insert-entry={entry.id}
                    className="group min-w-0 overflow-hidden rounded-xl border border-line bg-card transition-colors hover:border-accent/45"
                  >
                    <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-[oklch(0.94_0.01_78)] p-2 dark:bg-neutral-800">
                      <EntryPreview entry={entry} />
                      <span className="absolute left-1.5 top-1.5 rounded-full border border-line bg-panel/95 px-2 py-0.5 text-[0.52rem] font-black text-fg-2">
                        {entry.categoryLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          updatePreferences((current) =>
                            toggleStudioInsertFavorite(current, entry.id),
                          );
                          setStatus(null);
                        }}
                        aria-label={
                          favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"
                        }
                        aria-pressed={favorite}
                        className={cn(
                          "absolute right-1 top-1 grid size-11 place-items-center rounded-full border border-line bg-panel/95 text-fg-3 shadow-sm transition-colors hover:text-accent",
                          favorite && "text-accent",
                          FOCUS,
                        )}
                      >
                        <Star
                          size={15}
                          fill={favorite ? "currentColor" : "none"}
                          aria-hidden
                        />
                      </button>
                      {isCaution ? (
                        <span className="absolute bottom-1.5 left-1.5 rounded-full border border-warn/40 bg-panel/95 px-2 py-0.5 text-[0.52rem] font-bold text-warn">
                          권리 확인 필요
                        </span>
                      ) : null}
                    </div>
                    <div className="p-2">
                      <h4 className="line-clamp-2 min-h-8 text-[0.7rem] font-black leading-4 text-fg">
                        {entry.title}
                      </h4>
                      <p className="mt-1 line-clamp-2 min-h-8 text-[0.58rem] leading-4 text-fg-3">
                        {entry.description}
                      </p>
                      <div className="mt-1.5 flex min-h-5 flex-wrap gap-1">
                        {entry.badges.slice(0, 3).map((badge) => (
                          <span
                            key={badge}
                            className={cn(
                              "rounded-full border px-1.5 py-0.5 text-[0.5rem] font-semibold",
                              badge === "권리 미확인"
                                ? "border-warn/40 text-warn"
                                : "border-line text-fg-3",
                            )}
                          >
                            {badge}
                          </span>
                        ))}
                        {entry.placementSupport === "image" ? (
                          <span className="rounded-full border border-accent/30 px-1.5 py-0.5 text-[0.5rem] font-semibold text-accent">
                            {
                              STUDIO_INSERT_PLACEMENT_LABELS[
                                preferences.placementMode
                              ]
                            }
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={pendingId !== null}
                        onClick={() => void handleUseEntry(entry)}
                        aria-label={`${entry.title} ${entry.useLabel}`}
                        className={cn(
                          "mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-2 text-[0.65rem] font-bold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50",
                          FOCUS,
                        )}
                      >
                        {entry.kind === "action" ? (
                          actionIcon(entry.icon, 13)
                        ) : (
                          <ImageIcon size={13} aria-hidden />
                        )}
                        {pendingId === entry.id ? "처리 중…" : entry.useLabel}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-card/50 p-5 text-center">
              {collection === "favorites" ? (
                <Star size={24} className="mx-auto text-fg-3" aria-hidden />
              ) : collection === "recent" ? (
                <Clock3 size={24} className="mx-auto text-fg-3" aria-hidden />
              ) : (
                <Search size={24} className="mx-auto text-fg-3" aria-hidden />
              )}
              <p className="mt-2 text-xs font-bold text-fg-2">
                {collection === "favorites"
                  ? "즐겨찾기한 삽입 항목이 없습니다."
                  : collection === "recent"
                    ? "아직 사용한 삽입 항목이 없습니다."
                    : "조건에 맞는 삽입 항목이 없습니다."}
              </p>
              <p className="mt-1 text-[0.66rem] leading-relaxed text-fg-3">
                조건을 초기화하거나 검색 문맥을 AI 제작 도구로 넘겨 새 에셋을
                만들 수 있습니다.
              </p>
              <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={resetDiscovery}
                  className={CONTROL}
                >
                  전체 항목 보기
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAi(query.trim())}
                  className={cn(
                    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent hover:bg-accent/90",
                    FOCUS,
                  )}
                >
                  <Sparkles size={14} aria-hidden />
                  AI 도구에서 만들기
                </button>
              </div>
            </div>
          )}

          {status ? (
            <p
              role={status.tone === "error" ? "alert" : "status"}
              aria-live="polite"
              className={cn(
                "rounded-lg border px-2.5 py-2 text-[0.65rem] leading-relaxed",
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
