import { Bookmark, Check, Star } from "lucide-react";

import {
  deriveStudioUnifiedAssetFacet,
  STUDIO_UNIFIED_ASSET_EDITABILITY_LABELS,
  STUDIO_UNIFIED_ASSET_FORMAT_LABELS,
  STUDIO_UNIFIED_ASSET_RIGHTS_LABELS,
  type StudioUnifiedAssetLibraryState,
} from "./studio-unified-asset-intelligence";
import { SMART_LIBRARY_FOCUS } from "./studio-unified-asset-smart-library-chrome";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

import { cn } from "@/shared/lib/utils";

export interface StudioUnifiedAssetSmartManagerProps {
  readonly open: boolean;
  readonly items: readonly StudioUnifiedAssetItem[];
  readonly state: StudioUnifiedAssetLibraryState;
  readonly relatedAnchor: StudioUnifiedAssetItem | null;
  readonly related: readonly StudioUnifiedAssetItem[];
  readonly onToggleOpen: () => void;
  readonly onToggleFavorite: (id: string) => void;
  readonly onToggleTray: (id: string) => void;
  readonly onUseItem: (item: StudioUnifiedAssetItem) => void;
}

export function StudioUnifiedAssetSmartManager({
  open,
  items,
  state,
  relatedAnchor,
  related,
  onToggleOpen,
  onToggleFavorite,
  onToggleTray,
  onUseItem,
}: StudioUnifiedAssetSmartManagerProps) {
  return (
    <>
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className={cn(
          "mt-1.5 flex min-h-11 w-full items-center justify-between rounded-lg border border-line bg-card px-2.5 text-[0.62rem] font-bold text-fg-2 hover:bg-raised",
          SMART_LIBRARY_FOCUS,
        )}
      >
        <span>즐겨찾기 · 프로젝트 트레이 관리</span>
        <span className="text-[0.54rem] text-fg-3">상위 {items.length}개</span>
      </button>

      {open ? (
        <div className="mt-1.5 max-h-64 space-y-1 overflow-y-auto pr-1" aria-label="스마트 에셋 관리 목록">
          {items.map((item) => {
            const facet = deriveStudioUnifiedAssetFacet(item);
            const favorite = state.favorites.includes(item.id);
            const inTray = state.tray.includes(item.id);
            return (
              <div
                key={item.id}
                className="grid min-h-12 grid-cols-[1fr_2.75rem_2.75rem] items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.6rem] font-bold text-fg">{item.title}</p>
                  <p className="truncate text-[0.5rem] text-fg-3">
                    {STUDIO_UNIFIED_ASSET_FORMAT_LABELS[facet.format]} · {STUDIO_UNIFIED_ASSET_RIGHTS_LABELS[facet.rights]} · {STUDIO_UNIFIED_ASSET_EDITABILITY_LABELS[facet.editability]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(item.id)}
                  aria-pressed={favorite}
                  aria-label={`${item.title} 즐겨찾기 ${favorite ? "제거" : "추가"}`}
                  className={cn(
                    "grid min-h-11 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-accent",
                    SMART_LIBRARY_FOCUS,
                    favorite && "bg-accent-soft text-accent",
                  )}
                >
                  <Star size={14} fill={favorite ? "currentColor" : "none"} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTray(item.id)}
                  aria-pressed={inTray}
                  aria-label={`${item.title} 프로젝트 트레이 ${inTray ? "제거" : "추가"}`}
                  className={cn(
                    "grid min-h-11 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-accent",
                    SMART_LIBRARY_FOCUS,
                    inTray && "bg-accent-soft text-accent",
                  )}
                >
                  {inTray ? <Check size={14} aria-hidden /> : <Bookmark size={14} aria-hidden />}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {relatedAnchor && related.length > 0 ? (
        <div className="mt-1.5 rounded-lg border border-accent/25 bg-card p-2" aria-label={`${relatedAnchor.title} 연관 에셋`}>
          <p className="text-[0.56rem] font-bold text-accent">방금 사용한 에셋과 잘 맞는 항목</p>
          <div className="mt-1 flex gap-1 overflow-x-auto pb-1">
            {related.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onUseItem(item)}
                className={cn(
                  "min-h-10 max-w-36 shrink-0 truncate rounded-lg border border-line bg-panel px-2 text-[0.56rem] font-semibold text-fg-2 hover:border-accent/50 hover:text-accent pointer-coarse:min-h-11",
                  SMART_LIBRARY_FOCUS,
                )}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
