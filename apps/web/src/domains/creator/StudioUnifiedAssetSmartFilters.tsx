import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ChangeEvent } from "react";

import {
  STUDIO_UNIFIED_ASSET_FORMAT_LABELS,
  type StudioUnifiedAssetEditabilityFilter,
  type StudioUnifiedAssetFormat,
  type StudioUnifiedAssetRightsFilter,
  type StudioUnifiedAssetSort,
} from "./studio-unified-asset-intelligence";
import { SMART_LIBRARY_FOCUS } from "./studio-unified-asset-smart-library-chrome";

import { cn } from "@/shared/lib/utils";

const FORMATS: readonly StudioUnifiedAssetFormat[] = [
  "all",
  "template",
  "image",
  "vector",
  "3d",
  "tool",
];
const RIGHTS: readonly {
  readonly id: StudioUnifiedAssetRightsFilter;
  readonly label: string;
}[] = [
  { id: "all", label: "권리 전체" },
  { id: "ready", label: "바로 사용" },
  { id: "review", label: "검토 필요" },
];

export interface StudioUnifiedAssetSmartFiltersProps {
  readonly format: StudioUnifiedAssetFormat;
  readonly rights: StudioUnifiedAssetRightsFilter;
  readonly editability: StudioUnifiedAssetEditabilityFilter;
  readonly sort: StudioUnifiedAssetSort;
  readonly activeCount: number;
  readonly onFormatChange: (value: StudioUnifiedAssetFormat) => void;
  readonly onRightsChange: (value: StudioUnifiedAssetRightsFilter) => void;
  readonly onEditabilityChange: (value: StudioUnifiedAssetEditabilityFilter) => void;
  readonly onSortChange: (value: StudioUnifiedAssetSort) => void;
  readonly onReset: () => void;
}

export function StudioUnifiedAssetSmartFilters({
  format,
  rights,
  editability,
  sort,
  activeCount,
  onFormatChange,
  onRightsChange,
  onEditabilityChange,
  onSortChange,
  onReset,
}: StudioUnifiedAssetSmartFiltersProps) {
  return (
    <div className="mt-2 space-y-1.5 border-t border-line/80 pt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1 text-[0.58rem] font-bold text-fg-2">
          <SlidersHorizontal size={12} aria-hidden />
          제작 조건
        </p>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onReset}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-md px-1.5 text-[0.55rem] font-semibold text-fg-3 hover:bg-raised hover:text-accent pointer-coarse:min-h-11",
              SMART_LIBRARY_FOCUS,
            )}
          >
            <RotateCcw size={11} aria-hidden />
            초기화 {activeCount}
          </button>
        ) : null}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1" aria-label="에셋 기술 형식">
        {FORMATS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onFormatChange(option)}
            aria-pressed={format === option}
            aria-label={`에셋 형식 ${STUDIO_UNIFIED_ASSET_FORMAT_LABELS[option]}`}
            className={cn(
              "min-h-10 shrink-0 rounded-lg border px-2 text-[0.56rem] font-semibold pointer-coarse:min-h-11",
              SMART_LIBRARY_FOCUS,
              format === option
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-3 hover:bg-raised",
            )}
          >
            {STUDIO_UNIFIED_ASSET_FORMAT_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1">
        {RIGHTS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onRightsChange(option.id)}
            aria-pressed={rights === option.id}
            className={cn(
              "min-h-10 rounded-lg border px-1 text-[0.55rem] font-semibold pointer-coarse:min-h-11",
              SMART_LIBRARY_FOCUS,
              rights === option.id
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-3 hover:bg-raised",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-card px-2 text-[0.58rem] font-semibold text-fg-2">
          <input
            type="checkbox"
            checked={editability === "editable"}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onEditabilityChange(event.target.checked ? "editable" : "all")
            }
            className="size-4 accent-[var(--accent)]"
          />
          계속 편집 가능한 에셋만
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-card px-2 text-[0.58rem] font-semibold text-fg-2">
          정렬
          <select
            value={sort}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              onSortChange(event.target.value as StudioUnifiedAssetSort)
            }
            aria-label="스마트 에셋 정렬"
            className={cn(
              "min-h-9 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 text-[0.58rem] text-fg",
              SMART_LIBRARY_FOCUS,
            )}
          >
            <option value="recommended">추천순</option>
            <option value="name">이름순</option>
          </select>
        </label>
      </div>
    </div>
  );
}
