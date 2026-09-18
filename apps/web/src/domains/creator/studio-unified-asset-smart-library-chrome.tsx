import {
  Bookmark,
  ChevronDown,
  Clock3,
  Library,
  Star,
  WandSparkles,
} from "lucide-react";

import type {
  StudioUnifiedAssetLibraryState,
  StudioUnifiedAssetLibraryView,
} from "./studio-unified-asset-intelligence";

import { cn } from "@/shared/lib/utils";

export const SMART_LIBRARY_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-panel";

const SHELVES: readonly {
  readonly id: StudioUnifiedAssetLibraryView;
  readonly label: string;
  readonly icon: typeof Library;
}[] = [
  { id: "all", label: "전체", icon: Library },
  { id: "favorites", label: "즐겨찾기", icon: Star },
  { id: "recent", label: "최근", icon: Clock3 },
  { id: "tray", label: "트레이", icon: Bookmark },
];

function shelfCount(
  view: StudioUnifiedAssetLibraryView,
  state: StudioUnifiedAssetLibraryState,
  availableIds: ReadonlySet<string>,
  total: number,
): number {
  if (view === "favorites") {
    return state.favorites.filter((id) => availableIds.has(id)).length;
  }
  if (view === "recent") {
    return state.recents.filter(({ id }) => availableIds.has(id)).length;
  }
  if (view === "tray") {
    return state.tray.filter((id) => availableIds.has(id)).length;
  }
  return total;
}

export function StudioUnifiedAssetSmartLibraryHeader({
  visibleCount,
  totalCount,
  persistence,
  expanded,
  onToggle,
}: {
  readonly visibleCount: number;
  readonly totalCount: number;
  readonly persistence: "persistent" | "memory";
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-1 text-xs font-black text-fg">
          <WandSparkles size={14} className="text-accent" aria-hidden />
          Smart library
        </p>
        <p className="mt-0.5 truncate text-[0.58rem] text-fg-3">
          {visibleCount} / {totalCount}개 · {persistence === "memory" ? "세션 보관" : "기기 저장"}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`스마트 라이브러리 ${expanded ? "접기" : "펼치기"}`}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-accent",
          SMART_LIBRARY_FOCUS,
        )}
      >
        <ChevronDown
          size={16}
          className={cn("transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
      </button>
    </div>
  );
}

export function StudioUnifiedAssetShelfNav({
  selected,
  state,
  availableIds,
  totalCount,
  onSelect,
}: {
  readonly selected: StudioUnifiedAssetLibraryView;
  readonly state: StudioUnifiedAssetLibraryState;
  readonly availableIds: ReadonlySet<string>;
  readonly totalCount: number;
  readonly onSelect: (view: StudioUnifiedAssetLibraryView) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-4 gap-1" aria-label="스마트 에셋 선반">
      {SHELVES.map((option) => {
        const Icon = option.icon;
        const count = shelfCount(option.id, state, availableIds, totalCount);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            aria-pressed={selected === option.id}
            aria-label={`${option.label} ${count}`}
            className={cn(
              "flex min-h-11 min-w-0 flex-col items-center justify-center rounded-lg px-1 text-[0.55rem] font-bold transition-colors",
              SMART_LIBRARY_FOCUS,
              selected === option.id
                ? "bg-accent text-on-accent shadow-sm"
                : "bg-card text-fg-3 hover:bg-raised hover:text-fg",
            )}
          >
            <Icon size={13} aria-hidden />
            <span className="mt-0.5 max-w-full truncate">{option.label} {count}</span>
          </button>
        );
      })}
    </div>
  );
}
