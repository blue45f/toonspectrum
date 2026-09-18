import { Clock3, Search, Star, X } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import { writeStudioInsertDragPayload } from "../studio-insert-drag-writer";

import { StudioBubbleVariantGlyph } from "./StudioBubbleVariantGlyph";
import {
  BUBBLE_LIBRARY_QUERY_LIMIT,
  buildBubbleLibrarySections,
  countUniqueBubbleLibraryVariants,
  getBubbleLibraryVariant,
  type BubbleLibraryPreferences,
} from "./studio-bubble-library";

import type { BubbleVariant } from "../studio-assets";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export interface StudioBubbleLibraryPanelProps {
  readonly preferences: BubbleLibraryPreferences;
  readonly onInsertBubble: (id: BubbleVariant) => void;
  readonly onMarkBubbleUsed: (id: BubbleVariant) => void;
  readonly onToggleFavorite: (id: BubbleVariant) => void;
}

function localizeText(t: (key: string) => string, fallback: string, key: string): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function StudioBubbleLibraryPanel({
  preferences,
  onInsertBubble,
  onMarkBubbleUsed,
  onToggleFavorite,
}: StudioBubbleLibraryPanelProps) {
  const t = useT();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const sections = useMemo(
    () =>
      buildBubbleLibrarySections({
        query,
        favoritesOnly,
        preferences,
      }),
    [favoritesOnly, preferences, query],
  );
  const visibleVariantCount = useMemo(
    () => countUniqueBubbleLibraryVariants(sections),
    [sections],
  );
  const lastUsedVariant = getBubbleLibraryVariant(preferences.recentIds[0]);
  const chooseHint = localizeText(
    t,
    "클릭·탭하면 선택 컷/현재 화면에, 끌면 놓은 위치에 추가됩니다",
    "studio.bubble.chooseHint",
  );

  return (
    <>
      <div className="space-y-2.5 border-b border-line/50 px-2.5 py-2.5">
        <div role="search" className="relative">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
          />
          <input
            ref={searchInputRef}
            data-studio-bubble-library-search="true"
            value={query}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setQuery(event.target.value)
            }
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
              }
            }}
            maxLength={BUBBLE_LIBRARY_QUERY_LIMIT}
            autoComplete="off"
            aria-label={localizeText(
              t,
              "말풍선 이름, 감정 또는 용도 검색",
              "studio.bubble.library.searchAria",
            )}
            aria-controls="studio-bubble-library-results"
            aria-keyshortcuts="/"
            placeholder={localizeText(
              t,
              "이름·감정·용도 검색",
              "studio.bubble.library.searchPlaceholder",
            )}
            className="min-h-11 w-full rounded-xl border border-line/60 bg-card/80 py-2 pl-9 pr-12 text-[0.7rem] text-fg outline-none transition-colors placeholder:text-fg-3/80 focus:border-accent/45 focus:bg-card"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchInputRef.current?.focus();
              }}
              aria-label={localizeText(
                t,
                "말풍선 검색어 지우기",
                "studio.bubble.library.clearSearch",
              )}
              className="absolute right-0 top-0 grid size-11 place-items-center rounded-xl text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
            >
              <X size={15} aria-hidden />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line/60 bg-canvas/70 px-1.5 py-0.5 text-[0.58rem] font-medium text-fg-3">
              /
            </kbd>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-studio-bubble-favorites-filter="true"
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((current) => !current)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-2.5 text-[0.66rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              favoritesOnly
                ? "border-accent/35 bg-accent-soft text-accent"
                : "border-line/60 bg-card/70 text-fg-2 hover:bg-raised",
            )}
          >
            <Star
              size={14}
              aria-hidden
              fill={favoritesOnly ? "currentColor" : "none"}
            />
            {localizeText(t, "즐겨찾기", "studio.bubble.library.favorites")}
            <span className="tabular-nums text-fg-3">
              {preferences.favoriteIds.length}
            </span>
          </button>

          {lastUsedVariant ? (
            <button
              type="button"
              data-studio-bubble-repeat-last={lastUsedVariant.id}
              onClick={() => onInsertBubble(lastUsedVariant.id)}
              className="inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl border border-line/60 bg-card/70 px-2.5 text-[0.66rem] font-medium text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Clock3 size={14} aria-hidden className="shrink-0" />
              <span className="truncate">
                {localizeText(
                  t,
                  "최근 다시 넣기",
                  "studio.bubble.library.repeatLast",
                )}{" "}
                · {lastUsedVariant.label}
              </span>
            </button>
          ) : null}

          <span
            role="status"
            aria-live="polite"
            data-studio-bubble-result-count="true"
            className="ml-auto inline-flex min-h-11 items-center text-[0.62rem] tabular-nums text-fg-3"
          >
            {visibleVariantCount}
            {localizeText(t, "개", "studio.bubble.library.countSuffix")}
          </span>
        </div>
      </div>

      <div
        id="studio-bubble-library-results"
        className="space-y-3 p-2.5"
        role="list"
        aria-label={localizeText(t, "말풍선 종류", "studio.bubble.kindMenuAria")}
      >
        {sections.length > 0 ? (
          sections.map((section, sectionIndex) => (
            <section
              key={section.id}
              role="group"
              aria-labelledby={`studio-bubble-section-${sectionIndex}`}
            >
              <h3
                id={`studio-bubble-section-${sectionIndex}`}
                className="mb-1.5 flex items-center gap-1.5 px-1 text-[0.62rem] font-semibold text-fg-3"
              >
                {section.kind === "favorite" ? (
                  <Star
                    size={11}
                    aria-hidden
                    fill="currentColor"
                    className="text-accent"
                  />
                ) : section.kind === "recent" ? (
                  <Clock3 size={11} aria-hidden className="text-accent" />
                ) : (
                  <span
                    className="inline-block size-1 rounded-full bg-accent/55"
                    aria-hidden
                  />
                )}
                {section.label}
              </h3>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {section.variants.map((variant) => {
                  const favorite = preferences.favoriteIds.includes(variant.id);
                  return (
                    <div
                      key={variant.id}
                      role="listitem"
                      data-studio-bubble-variant={variant.id}
                      className="group relative min-h-[5.75rem] overflow-hidden rounded-2xl border border-line/55 bg-gradient-to-b from-card/90 to-canvas/30 shadow-[inset_0_1px_0_oklch(0.95_0.02_85_/_0.04)] transition-[border-color,background,transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:border-accent/40 hover:bg-raised/80 hover:shadow-sm focus-within:border-accent/45"
                    >
                      <button
                        type="button"
                        onClick={() => onInsertBubble(variant.id)}
                        draggable
                        onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                          writeStudioInsertDragPayload(event.dataTransfer, {
                            kind: "bubble",
                            variant: variant.id,
                          });
                        }}
                        onDragEnd={(event: DragEvent<HTMLButtonElement>) => {
                          if (event.dataTransfer.dropEffect !== "none") {
                            onMarkBubbleUsed(variant.id);
                          }
                        }}
                        aria-describedby="studio-bubble-placement-help"
                        title={`${variant.label} — ${chooseHint}`}
                        className="group/card flex min-h-[5.75rem] w-full flex-col p-2 pr-11 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent active:translate-y-0"
                      >
                        <span className="flex h-12 items-center justify-center rounded-xl bg-canvas/45 ring-1 ring-line/35 transition-colors group-hover/card:bg-accent-soft/25 group-hover/card:ring-accent/20">
                          <StudioBubbleVariantGlyph
                            variant={variant.id}
                            className="h-10 w-full text-fg-2 transition-colors duration-200 group-hover/card:text-accent"
                          />
                        </span>
                        <span className="mt-1.5 block text-[0.78rem] font-semibold tracking-tight text-fg">
                          {variant.label}
                        </span>
                        <span className="mt-0.5 block text-[0.6rem] leading-snug text-fg-3">
                          {variant.hint}
                        </span>
                      </button>
                      <button
                        type="button"
                        data-studio-bubble-favorite={variant.id}
                        aria-pressed={favorite}
                        aria-label={`${variant.label} ${localizeText(
                          t,
                          favorite ? "즐겨찾기 해제" : "즐겨찾기에 추가",
                          favorite
                            ? "studio.bubble.library.unfavorite"
                            : "studio.bubble.library.favorite",
                        )}`}
                        onClick={() => onToggleFavorite(variant.id)}
                        className={cn(
                          "absolute right-0 top-0 z-10 grid size-11 place-items-center rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent",
                          favorite
                            ? "text-accent hover:bg-accent-soft/70"
                            : "text-fg-3 hover:bg-raised hover:text-accent",
                        )}
                      >
                        <Star
                          size={15}
                          aria-hidden
                          fill={favorite ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-line/70 bg-canvas/30 px-4 py-6 text-center">
            <p className="text-[0.72rem] font-semibold text-fg-2">
              {localizeText(
                t,
                favoritesOnly
                  ? "조건에 맞는 즐겨찾기가 없어요"
                  : "검색 결과가 없어요",
                favoritesOnly
                  ? "studio.bubble.library.emptyFavorites"
                  : "studio.bubble.library.emptySearch",
              )}
            </p>
            <p className="mt-1 text-[0.62rem] leading-relaxed text-fg-3">
              {localizeText(
                t,
                "감정·용도·한국어/영어 키워드로 다시 찾아보세요.",
                "studio.bubble.library.emptyHint",
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFavoritesOnly(false);
                searchInputRef.current?.focus();
              }}
              className="mt-3 min-h-11 rounded-xl border border-line/60 bg-card px-3 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {localizeText(t, "전체 말풍선 보기", "studio.bubble.library.reset")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
