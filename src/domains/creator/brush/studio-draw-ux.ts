/**
 * Draw UX helpers — 상용 드로잉 앱(PicsArt/Procreate) 관례의 편의 계산.
 * Pure, no React.
 */

import { BRUSH_PRESETS, type BrushPreset } from "../studio-brush";
import {
  listStudioBrushTrayItems,
  type StudioBrushTrayCategory,
  type StudioBrushTrayItem,
} from "../studio-creative-ux";

import { isStudioBrushEngineLaneId } from "./studio-brush-engine-lane-catalog";
import {
  isStudioBrushPackCatalogId,
  STUDIO_BRUSH_PACK_CATALOG_IDS,
} from "./studio-brush-pack-id";

export const STUDIO_BRUSH_SIZE_RANGE = { min: 1, max: 80 } as const;
export const STUDIO_BRUSH_OPACITY_RANGE = { min: 0.05, max: 1 } as const;

/** Size nudge steps (coarse when large). */
export function studioBrushSizeStep(current: number, direction: 1 | -1): number {
  const w = Number.isFinite(current) ? current : 6;
  let step = 1;
  if (w >= 40) step = 4;
  else if (w >= 20) step = 2;
  return step * direction;
}

export function adjustStudioBrushSize(width: unknown, delta: number): number {
  const w = typeof width === "number" && Number.isFinite(width) ? width : 6;
  const d = typeof delta === "number" && Number.isFinite(delta) ? delta : 0;
  return Math.min(
    STUDIO_BRUSH_SIZE_RANGE.max,
    Math.max(STUDIO_BRUSH_SIZE_RANGE.min, Math.round(w + d))
  );
}

export function adjustStudioBrushOpacity(opacity: unknown, delta: number): number {
  const o = typeof opacity === "number" && Number.isFinite(opacity) ? opacity : 1;
  const d = typeof delta === "number" && Number.isFinite(delta) ? delta : 0;
  const next = o + d;
  return Math.min(
    STUDIO_BRUSH_OPACITY_RANGE.max,
    Math.max(STUDIO_BRUSH_OPACITY_RANGE.min, Math.round(next * 100) / 100)
  );
}

export function filterStudioBrushLibraryItems(options: {
  category?: StudioBrushTrayCategory | "favorites" | "recent";
  query?: string;
  favoriteIds?: readonly string[];
  recentIds?: readonly string[];
  /** Optional extended catalogue supplied by the lazy library surface. */
  catalogItems?: readonly StudioBrushTrayItem[];
}): StudioBrushTrayItem[] {
  const query = (options.query ?? "").trim().toLowerCase();
  const favoriteIds = options.favoriteIds ?? [];
  const recentIds = options.recentIds ?? [];
  const category = options.category ?? "all";

  const allItems = options.catalogItems
    ? [...options.catalogItems]
    : listStudioBrushTrayItems("all");
  const byId = new Map(allItems.map((item) => [item.id, item]));
  let items: StudioBrushTrayItem[];
  if (category === "favorites") {
    items = favoriteIds.map((id) => byId.get(id)).filter((item): item is StudioBrushTrayItem => Boolean(item));
  } else if (category === "recent") {
    items = recentIds.map((id) => byId.get(id)).filter((item): item is StudioBrushTrayItem => Boolean(item));
  } else if (category === "pro") {
    items = allItems.filter((item) => isStudioBrushPackCatalogId(item.id));
  } else if (category === "engines") {
    items = allItems.filter((item) => isStudioBrushEngineLaneId(item.id));
  } else if (category === "all" || category === "expressive") {
    items = category === "all"
      ? allItems
      : allItems.filter((item) => item.category === "expressive");
  } else if (category === "beginner") {
    items = allItems.filter((item) => item.category === "beginner");
  } else {
    items = allItems.filter((item) => item.mediaGroup === category);
  }

  if (!query) return items;
  return items.filter((item) => {
    const hay = [
      item.name,
      item.shortName,
      item.hint,
      item.id,
      item.mediaGroup,
      ...(item.searchAliases ?? []),
    ].join(" ").toLowerCase();
    return hay.includes(query);
  });
}

export function studioBrushPresetById(id: unknown): BrushPreset | null {
  if (typeof id !== "string" || !id) return null;
  return BRUSH_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Group chips for the brush library sheet. */
export const STUDIO_BRUSH_LIBRARY_TABS: readonly {
  id: StudioBrushTrayCategory | "favorites" | "recent";
  label: string;
  title: string;
}[] = [
  { id: "favorites", label: "즐겨찾기", title: "즐겨찾기 브러시" },
  { id: "recent", label: "최근", title: "최근 사용한 브러시" },
  { id: "beginner", label: "기본", title: "초보 키트" },
  {
    id: "pro",
    label: `프로 ${STUDIO_BRUSH_PACK_CATALOG_IDS.length}`,
    title: `프로시저럴 확장 브러시 ${STUDIO_BRUSH_PACK_CATALOG_IDS.length}종`,
  },
  {
    id: "engines",
    label: "엔진",
    title: "엔진 레인 브러시 — 같은 재료·다른 엔진",
  },
  { id: "line", label: "선", title: "펜·연필·G펜" },
  { id: "marker", label: "마커", title: "마커·형광·네온" },
  { id: "paint", label: "페인트", title: "붓·수채·유화" },
  { id: "fx", label: "효과", title: "글로우·글리터" },
  { id: "texture", label: "질감", title: "크레용·파스텔·톤" },
  { id: "all", label: "전체", title: "모든 브러시" },
];
