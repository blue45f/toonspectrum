import {
  Box,
  Clapperboard,
  Image as ImageIcon,
  Library,
  Search,
  Shapes,
  Sparkles,
  X,
} from "lucide-react";
import {
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { svgToDataUrl } from "./studio-characters";
import {
  countStudioUnifiedAssets,
  curateStudioUnifiedAssetHighlights,
  searchStudioUnifiedAssets,
  STUDIO_UNIFIED_ASSET_CATEGORY_LABELS,
  type StudioUnifiedAssetCategory,
  type StudioUnifiedAssetItem,
  type StudioUnifiedAssetScope,
} from "./studio-unified-asset-catalog";

import { cn } from "@/shared/lib/utils";

const CATEGORY_OPTIONS: readonly StudioUnifiedAssetCategory[] = [
  "all",
  "scene",
  "element",
  "3d",
  "mine",
];

const SCOPE_OPTIONS: readonly {
  readonly id: StudioUnifiedAssetScope;
  readonly label: string;
}[] = [
  { id: "all", label: "전체" },
  { id: "studio", label: "Studio" },
  { id: "mine", label: "내 에셋" },
];

const QUICK_QUERIES = ["학교", "로맨스", "밤", "효과", "소품", "3D"] as const;

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-panel";
const CONTROL =
  `min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised ${FOCUS}`;

export interface StudioUnifiedAssetWorkspaceProps {
  readonly items: readonly StudioUnifiedAssetItem[];
  readonly legacyContent: ReactNode;
  readonly initialView?: WorkspaceView;
  readonly onUseItem: (
    item: StudioUnifiedAssetItem,
  ) => boolean | void | Promise<boolean | void>;
  readonly onOpenAi: (prompt: string) => void;
}

export type WorkspaceView = "discover" | "library";
type Status = { readonly tone: "success" | "error"; readonly message: string };

function categoryIcon(category: Exclude<StudioUnifiedAssetCategory, "all">) {
  if (category === "scene") return <Clapperboard size={22} aria-hidden />;
  if (category === "element") return <Shapes size={22} aria-hidden />;
  if (category === "3d") return <Box size={22} aria-hidden />;
  return <Library size={22} aria-hidden />;
}

function AssetPreview({ item }: { readonly item: StudioUnifiedAssetItem }) {
  if (item.preview.kind === "image") {
    return (
      <img
        src={item.preview.src}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-contain"
      />
    );
  }
  if (item.preview.kind === "svg") {
    return (
      <img
        src={svgToDataUrl(item.preview.svg)}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-contain"
      />
    );
  }
  return (
    <span className="grid size-14 place-items-center rounded-2xl border border-line bg-panel text-accent">
      {categoryIcon(item.category)}
    </span>
  );
}

function successMessage(item: StudioUnifiedAssetItem): string {
  if (item.useMode === "open") return `${item.title} 편집 도구를 열었습니다.`;
  if (item.useMode === "apply") return `${item.title} 장면을 배치했습니다.`;
  return `${item.title}을(를) 캔버스에 삽입했습니다.`;
}

export function StudioUnifiedAssetWorkspace({
  items,
  legacyContent,
  initialView = "discover",
  onUseItem,
  onOpenAi,
}: StudioUnifiedAssetWorkspaceProps) {
  const searchId = useId();
  const [view, setView] = useState<WorkspaceView>(initialView);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<StudioUnifiedAssetCategory>("all");
  const [scope, setScope] = useState<StudioUnifiedAssetScope>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  const counts = useMemo(() => countStudioUnifiedAssets(items, scope), [items, scope]);
  const results = useMemo(() => {
    if (!query.trim()) {
      return curateStudioUnifiedAssetHighlights(items, {
        category,
        scope,
        limit: 60,
      });
    }
    return searchStudioUnifiedAssets(items, {
      query,
      category,
      scope,
      limit: 120,
    });
  }, [category, items, query, scope]);

  async function handleUseItem(item: StudioUnifiedAssetItem): Promise<void> {
    if (pendingId) return;
    setPendingId(item.id);
    setStatus(null);
    try {
      const used = await onUseItem(item);
      if (used === false) {
        throw new Error("현재 캔버스 상태에서는 이 에셋을 사용할 수 없습니다.");
      }
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

  return (
    <section aria-label="통합 에셋 작업 공간" data-studio-unified-asset-workspace="true">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-line bg-card p-1">
        <button
          type="button"
          onClick={() => setView("discover")}
          aria-pressed={view === "discover"}
          className={cn(
            "min-h-11 rounded-lg px-2 text-xs font-bold transition-colors",
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

      {view === "library" ? legacyContent : (
        <div className="space-y-3">
          <header className="rounded-xl border border-accent/25 bg-accent-soft/35 p-3">
            <div className="flex items-start gap-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-panel text-accent shadow-sm">
                <Search size={18} aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-fg">통합 에셋 탐색</h3>
                <p className="mt-1 text-[0.66rem] leading-relaxed text-fg-3">
                  2D 배경·장면 템플릿·벡터 요소·3D 오브젝트·내 에셋을 한 번에 찾고 기존 안전한 삽입 경로로 사용합니다.
                </p>
              </div>
            </div>
          </header>

          <div className="relative">
            <label htmlFor={searchId} className="sr-only">에셋 통합 검색</label>
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
              aria-hidden
            />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value.slice(0, 120));
                setStatus(null);
              }}
              placeholder="예: 비 오는 밤 학교, 로맨스 장면, 3D 소품"
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
                }}
                aria-label="통합 에셋 검색어 지우기"
                className={cn(
                  "absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-fg-3 hover:bg-raised",
                  FOCUS,
                )}
              >
                <X size={14} aria-hidden />
              </button>
            ) : null}
          </div>

          {!query ? (
            <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="빠른 에셋 검색">
              {QUICK_QUERIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setQuery(value)}
                  className={cn(
                    "min-h-9 shrink-0 rounded-full border border-line bg-card px-3 text-[0.66rem] font-semibold text-fg-3 hover:border-accent/50 hover:text-accent pointer-coarse:min-h-11",
                    FOCUS,
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          ) : null}

          <div>
            <p className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-fg-3">범위</p>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-card p-1">
              {SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setScope(option.id)}
                  aria-pressed={scope === option.id}
                  className={cn(
                    "min-h-10 rounded-md px-2 text-[0.65rem] font-semibold transition-colors pointer-coarse:min-h-11",
                    FOCUS,
                    scope === option.id
                      ? "bg-accent-soft text-accent"
                      : "text-fg-3 hover:bg-raised",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-fg-3">종류</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCategory(option)}
                  aria-pressed={category === option}
                  className={cn(
                    "min-h-10 shrink-0 rounded-lg border px-2.5 text-[0.65rem] font-semibold transition-colors pointer-coarse:min-h-11",
                    FOCUS,
                    category === option
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-3 hover:bg-raised",
                  )}
                >
                  {STUDIO_UNIFIED_ASSET_CATEGORY_LABELS[option]} {counts[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <p role="status" aria-live="polite" className="text-fg-3">
              {query.trim()
                ? `검색 결과 ${results.length}개`
                : `추천 ${results.length}개 · 범위 내 ${counts.all}개`}
            </p>
            {(query || category !== "all" || scope !== "all") ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                  setScope("all");
                  setStatus(null);
                }}
                className={cn("min-h-9 px-1 text-[0.66rem] font-semibold text-fg-3 underline pointer-coarse:min-h-11", FOCUS)}
              >
                초기화
              </button>
            ) : null}
          </div>

          {results.length > 0 ? (
            <div className="grid max-h-[min(56dvh,36rem)] grid-cols-2 gap-2 overflow-y-auto pr-1">
              {results.map((item) => (
                <article
                  key={item.id}
                  data-studio-unified-asset={item.id}
                  className="group min-w-0 overflow-hidden rounded-xl border border-line bg-card transition-colors hover:border-accent/45"
                >
                  <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-[oklch(0.94_0.01_78)] p-2 dark:bg-neutral-800">
                    <AssetPreview item={item} />
                    <span className="absolute left-1.5 top-1.5 rounded-full border border-line bg-panel/95 px-2 py-0.5 text-[0.52rem] font-black text-fg-2">
                      {item.categoryLabel}
                    </span>
                    {item.discoverability === "caution" ? (
                      <span className="absolute bottom-1.5 left-1.5 rounded-full border border-warn/40 bg-panel/95 px-2 py-0.5 text-[0.52rem] font-bold text-warn">
                        확인 필요
                      </span>
                    ) : null}
                  </div>
                  <div className="p-2">
                    <h4 className="line-clamp-2 min-h-8 text-[0.7rem] font-black leading-4 text-fg">
                      {item.title}
                    </h4>
                    <p className="mt-1 line-clamp-2 min-h-8 text-[0.58rem] leading-4 text-fg-3">
                      {item.description}
                    </p>
                    <div className="mt-1.5 flex min-h-5 flex-wrap gap-1">
                      {item.badges.slice(0, 3).map((badge) => (
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
                    </div>
                    <button
                      type="button"
                      disabled={pendingId !== null}
                      onClick={() => void handleUseItem(item)}
                      aria-label={`${item.title} ${item.useLabel}`}
                      className={cn(
                        "mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-2 text-[0.65rem] font-bold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50",
                        FOCUS,
                      )}
                    >
                      {item.useMode === "open" ? <Box size={13} aria-hidden /> : <ImageIcon size={13} aria-hidden />}
                      {pendingId === item.id ? "처리 중…" : item.useLabel}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-card/50 p-5 text-center">
              <Search size={24} className="mx-auto text-fg-3" aria-hidden />
              <p className="mt-2 text-xs font-bold text-fg-2">조건에 맞는 에셋이 없습니다.</p>
              <p className="mt-1 text-[0.66rem] leading-relaxed text-fg-3">
                조건을 초기화하거나 검색 문맥을 AI 제작 도구로 넘겨 새 에셋을 만들 수 있습니다.
              </p>
              <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setCategory("all");
                    setScope("all");
                  }}
                  className={CONTROL}
                >
                  조건 넓히기
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
