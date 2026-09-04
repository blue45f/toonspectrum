/**
 * Character Shaper — the preset shelf for the active slot: header, debounced search, genre chips,
 * a "추천" strip, the equipped strip for multi slots, the hand-side selector for hand poses, and
 * the 2-column card grid with roving focus. Everything is read through `binding.catalog` so tests
 * can stub the catalog.
 */
import { Search, Sparkles, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { STUDIO_FOCUS_RING, StudioEmptyState, studioSegmentChipClass } from "../studio-panel-ui";

import { CHARACTER_GENRE_TAG_LABELS } from "./character-shaper-catalog";
import { CharacterSlotPreview } from "./character-shaper-preview";
import {
  CHARACTER_HAND_SIDE_OPTIONS,
  CHARACTER_SHELF_COLUMNS,
  characterSlotSelection,
  collectShelfTags,
  filterShelfEntries,
  isCharacterEntrySelected,
  isCharacterMultiSlot,
  listShelfEntries,
  moveCharacterGridIndex,
} from "./character-shaper-ui-model";
import { CharacterSlotCard } from "./CharacterSlotCard";

import type { CharacterGenreTag, CharacterSlotEntry } from "./character-shaper-contract";
import type { CharacterShaperShelfProps } from "./character-shaper-ui-contract";
import type { CharacterGridDirection } from "./character-shaper-ui-model";

import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 120;

export function CharacterShaperShelf({
  binding,
  slot,
  query,
  tag,
  onQueryChange,
  onTagChange,
  onHoverEntry,
  onCommitEntry,
}: CharacterShaperShelfProps) {
  const searchId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const meta = binding.catalog.slots.find((candidate) => candidate.id === slot) ?? null;
  const slotLabel = meta?.label ?? slot;
  const slotEntries = listShelfEntries(binding.catalog.entries, slot);
  const tags = collectShelfTags(slotEntries);
  const visible = filterShelfEntries(slotEntries, query, tag, CHARACTER_GENRE_TAG_LABELS);
  const featured = slotEntries.filter((entry) => entry.featured);
  const filtering = query.trim().length > 0 || tag !== null;
  const multi = isCharacterMultiSlot(slot);
  const selection = characterSlotSelection(binding.recipe, slot);
  const equipped = multi
    ? selection
        .map((id) => slotEntries.find((entry) => entry.id === id) ?? null)
        .filter((entry): entry is CharacterSlotEntry => entry !== null)
    : [];

  // Search draft: immediate input value, emitted after a short debounce. An external query change
  // (slot switch resets to "") re-syncs the draft during render, and the effect cleanup drops any
  // pending emission so a stale draft never lands on the new slot.
  const [draft, setDraft] = useState(query);
  const [syncedQuery, setSyncedQuery] = useState(query);
  if (syncedQuery !== query) {
    setSyncedQuery(query);
    setDraft(query);
  }
  useEffect(() => {
    if (draft === query) return;
    const timer = window.setTimeout(() => onQueryChange(draft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, query, onQueryChange]);

  // Roving focus inside the grid: the last focused card, else the selected one, else the first.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusedIndex = focusedId ? visible.findIndex((entry) => entry.id === focusedId) : -1;
  const rovingIndex = focusedIndex >= 0
    ? focusedIndex
    : Math.max(0, visible.findIndex((entry) => selection.includes(entry.id)));

  const focusCardAt = (index: number) => {
    const cards = gridRef.current?.querySelectorAll<HTMLElement>("[data-character-slot-card]");
    cards?.[index]?.focus();
  };

  const navigateFrom = (index: number, direction: CharacterGridDirection) => {
    const next = moveCharacterGridIndex(index, visible.length, direction, CHARACTER_SHELF_COLUMNS);
    focusCardAt(next);
  };

  const clearSearch = () => {
    setDraft("");
    onQueryChange("");
  };

  const tagLabel = (genre: CharacterGenreTag): string => CHARACTER_GENRE_TAG_LABELS[genre] ?? genre;

  return (
    <div
      data-character-shaper-shelf={slot}
      className="flex h-full min-h-0 min-w-0 flex-col bg-panel"
    >
      <div className="shrink-0 border-b border-line px-3 pb-2.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold tracking-tight text-fg">{slotLabel}</h3>
            {meta?.hint ? <p className="mt-0.5 line-clamp-1 text-[0.7rem] leading-snug text-fg-3">{meta.hint}</p> : null}
          </div>
          <span
            className="shrink-0 rounded-md border border-line/70 bg-card px-1.5 py-0.5 text-[0.66rem] font-semibold tabular-nums text-fg-3"
            aria-live="polite"
          >
            {filtering ? `${visible.length}/${slotEntries.length}` : `${slotEntries.length}개`}
          </span>
        </div>

        <div className="relative mt-2">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
          <input
            id={searchId}
            type="search"
            value={draft}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="이름·키워드 검색"
            aria-label={`${slotLabel} 프리셋 검색`}
            data-character-shaper-search="true"
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && draft.length > 0) {
                event.preventDefault();
                clearSearch();
              }
            }}
            className={cn(
              "h-11 w-full rounded-xl border border-line bg-card pl-8 pr-10 text-[0.8rem] text-fg placeholder:text-fg-3",
              "[&::-webkit-search-cancel-button]:hidden",
              STUDIO_FOCUS_RING,
            )}
          />
          {draft.length > 0 ? (
            <button
              type="button"
              aria-label="검색 지우기"
              onClick={clearSearch}
              className={cn(
                "absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg pointer-coarse:size-11",
                STUDIO_FOCUS_RING,
              )}
            >
              <X size={14} aria-hidden />
            </button>
          ) : null}
        </div>

        {tags.length > 0 ? (
          <div
            role="group"
            aria-label="장르 필터"
            className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              type="button"
              aria-pressed={tag === null}
              onClick={() => onTagChange(null)}
              className={cn(studioSegmentChipClass(tag === null), "shrink-0")}
            >
              전체
            </button>
            {tags.map((genre) => (
              <button
                key={genre}
                type="button"
                aria-pressed={tag === genre}
                onClick={() => onTagChange(tag === genre ? null : genre)}
                className={cn(studioSegmentChipClass(tag === genre), "shrink-0")}
              >
                {tagLabel(genre)}
              </button>
            ))}
          </div>
        ) : null}

        {slot === "hand-pose" ? (
          <div role="group" aria-label="적용할 손" className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-line bg-card p-1">
            {CHARACTER_HAND_SIDE_OPTIONS.map((option) => {
              const active = binding.handSide === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => binding.setHandSide(option.value)}
                  className={cn(
                    "min-h-11 rounded-lg text-[0.74rem] font-semibold transition-colors motion-reduce:transition-none",
                    STUDIO_FOCUS_RING,
                    active ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        {multi && equipped.length > 0 ? (
          <section aria-label="장착 중" className="border-b border-line/70 px-3 py-2.5">
            <p className="mb-1.5 text-[0.66rem] font-semibold tracking-wide text-fg-3">장착 중 · {equipped.length}</p>
            <ul className="flex flex-wrap gap-1.5">
              {equipped.map((entry) => (
                <li
                  key={entry.id}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-accent/45 bg-accent-soft pl-3 pr-1 text-[0.72rem] font-semibold text-fg"
                >
                  <span className="max-w-[9rem] truncate">{entry.label}</span>
                  <button
                    type="button"
                    aria-label={`${entry.label} 해제`}
                    title={`${entry.label} 해제`}
                    onClick={() => binding.remove(slot, entry.id)}
                    className={cn(
                      "grid size-9 place-items-center rounded-full text-fg-2 hover:bg-raised hover:text-fg pointer-coarse:size-11",
                      STUDIO_FOCUS_RING,
                    )}
                  >
                    <X size={13} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!filtering && featured.length > 0 ? (
          <section aria-label="추천" className="border-b border-line/70 px-3 py-2.5">
            <p className="mb-1.5 inline-flex items-center gap-1 text-[0.66rem] font-semibold tracking-wide text-fg-3">
              <Sparkles size={12} aria-hidden className="text-accent" />
              추천
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {featured.map((entry) => {
                const availability = binding.evaluate(entry);
                const selected = isCharacterEntrySelected(binding.recipe, entry);
                const unavailable = availability.status === "unavailable";
                return (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={selected}
                    aria-disabled={unavailable || undefined}
                    title={availability.reason ?? entry.hint}
                    data-character-shaper-featured={entry.id}
                    onClick={() => {
                      if (unavailable) return;
                      onCommitEntry(entry);
                    }}
                    onPointerEnter={() => onHoverEntry(entry.id)}
                    onPointerLeave={() => onHoverEntry(null)}
                    className={cn(
                      "flex min-h-11 shrink-0 items-center gap-2 rounded-xl border py-1 pl-1 pr-3 text-left text-[0.72rem] font-semibold",
                      "transition-colors motion-reduce:transition-none",
                      STUDIO_FOCUS_RING,
                      selected
                        ? "border-accent bg-accent-soft text-fg"
                        : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                      unavailable && "cursor-not-allowed opacity-55",
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-canvas/70">
                      <CharacterSlotPreview spec={entry.preview} size={36} selected={selected} title={entry.label} />
                    </span>
                    <span className="max-w-[7.5rem] truncate">{entry.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {slotEntries.length === 0 ? (
          <div className="p-3">
            <StudioEmptyState
              icon={<Sparkles size={18} aria-hidden />}
              title="이 슬롯에는 아직 프리셋이 없습니다"
              description="카탈로그가 준비되면 여기에 카드가 나타납니다."
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-3">
            <StudioEmptyState
              icon={<Search size={18} aria-hidden />}
              title="검색 결과가 없습니다"
              description="다른 검색어를 입력하거나 장르 필터를 해제해 보세요."
              action={
                <button
                  type="button"
                  onClick={() => {
                    clearSearch();
                    onTagChange(null);
                  }}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-[0.75rem] font-semibold text-fg-2 hover:bg-raised hover:text-fg",
                    STUDIO_FOCUS_RING,
                  )}
                >
                  검색·필터 지우기
                </button>
              }
            />
          </div>
        ) : (
          <div
            ref={gridRef}
            role="group"
            aria-label={`${slotLabel} 프리셋`}
            data-character-shaper-grid="true"
            className="grid grid-cols-2 gap-2 p-3"
          >
            {visible.map((entry, index) => (
              <CharacterSlotCard
                key={entry.id}
                entry={entry}
                availability={binding.evaluate(entry)}
                selected={isCharacterEntrySelected(binding.recipe, entry)}
                tabIndex={index === rovingIndex ? 0 : -1}
                onCommit={onCommitEntry}
                onHover={onHoverEntry}
                onFocus={(entryId) => {
                  setFocusedId(entryId);
                  onHoverEntry(entryId);
                }}
                onKeyNavigate={(direction) => navigateFrom(index, direction)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
