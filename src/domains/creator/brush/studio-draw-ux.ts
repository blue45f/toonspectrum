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

/**
 * 브러시 라이브러리 탭 — 재질 축 하나로 정리했다.
 *
 * "프로"와 "엔진" 탭은 삭제했다. 둘 다 브러시가 어떤 재료를 남기는지 말해주지 않는 구현 티어라,
 * 유화 리본과 수채 과립이 "엔진" 한 칸에 뒤섞여 있었고 프로 160종은 재질과 무관하게 한 덩어리였다.
 * 지금은 잉크·연필·마커·수채·유화·에어·파스텔·질감·톤·효과 열 갈래이며, 각 항목의 소속은
 * 렌더 계약에서 파생되므로 새 브러시가 추가돼도 손으로 표를 고칠 일이 없다.
 */
export const STUDIO_BRUSH_LIBRARY_TABS: readonly {
  id: StudioBrushTrayCategory | "favorites" | "recent";
  label: string;
  title: string;
}[] = [
  { id: "favorites", label: "즐겨찾기", title: "즐겨찾기 브러시" },
  { id: "recent", label: "최근", title: "최근 사용한 브러시" },
  { id: "beginner", label: "기본", title: "초보 키트" },
  { id: "ink", label: "잉크", title: "펜·G펜·붓펜 — 균일한 잉크 선" },
  { id: "pencil", label: "연필", title: "연필·흑연 — 종이결 그레인" },
  { id: "marker", label: "마커", title: "마커·형광펜 — 반투명 균일 도포" },
  { id: "watercolor", label: "수채", title: "수채·수묵·과슈 — 웻엣지 번짐" },
  { id: "oil", label: "유화", title: "유화·아크릴·임파스토 — 강모결과 두께" },
  { id: "airbrush", label: "에어브러시", title: "에어·스프레이·스플래터 — 소프트 입자" },
  { id: "pastel", label: "파스텔", title: "파스텔·목탄·크레용·초크 — 마른 가루" },
  { id: "texture", label: "질감", title: "천·암석·나뭇잎·털 — 재질 스탬프" },
  { id: "tone", label: "톤", title: "스크린톤·망점·해칭" },
  { id: "fx", label: "효과", title: "네온·글로우·글리터·비·눈·불꽃" },
  { id: "all", label: "전체", title: "모든 브러시" },
];
