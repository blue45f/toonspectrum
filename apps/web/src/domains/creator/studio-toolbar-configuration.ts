import {
  DEFAULT_STUDIO_RAIL_TOOL_ORDER, normalizeStudioToolbarPreferences,
  type StudioRailToolId, type StudioToolbarPreferences, type StudioToolbarView,
} from "./studio-app-settings";
import { studioDrawingVisibleTools } from "./studio-drawing-core-tools";

export function configuredStudioToolbar(toolbar: StudioToolbarPreferences): StudioToolbarPreferences {
  return { ...normalizeStudioToolbarPreferences(toolbar), configured: true,
    visibleIds: studioDrawingVisibleTools(toolbar.visibleIds, toolbar.configured === true) };
}

export function pinStudioToolbarTools(toolbar: StudioToolbarPreferences, ids: readonly StudioRailToolId[]): StudioToolbarPreferences {
  const next = configuredStudioToolbar(toolbar);
  return { ...next, activeProfileId: null, visibleIds: [...new Set([...next.visibleIds, ...ids])] };
}

export function unpinStudioToolbarTools(toolbar: StudioToolbarPreferences, ids: readonly StudioRailToolId[]): StudioToolbarPreferences {
  const next = configuredStudioToolbar(toolbar);
  const remaining = next.visibleIds.filter((id) => !ids.includes(id));
  return remaining.length ? { ...next, activeProfileId: null, visibleIds: remaining } : next;
}

export function moveStudioToolbarTool(toolbar: StudioToolbarPreferences, id: StudioRailToolId, to: number): StudioToolbarPreferences {
  const next = configuredStudioToolbar(toolbar);
  if (!next.visibleIds.includes(id)) return next;
  const ids = next.visibleIds.filter((item) => item !== id);
  ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
  return { ...next, activeProfileId: null, visibleIds: ids };
}

export function pinAllStudioToolbarTools(toolbar: StudioToolbarPreferences): StudioToolbarPreferences {
  return pinStudioToolbarTools(toolbar, DEFAULT_STUDIO_RAIL_TOOL_ORDER);
}

export const STUDIO_TOOLBAR_PRESETS = [
  { id: "line", name: "선화", ids: ["select", "pen", "eraser", "transform", "lasso", "reference", "zoom-fit"] },
  { id: "paint", name: "채색", ids: ["select", "pen", "eraser", "fill", "lasso-fill", "eyedropper", "blend", "wet-mix", "reference", "zoom-fit"] },
  { id: "comic", name: "웹툰", ids: ["select", "pen", "eraser", "fill", "text", "bubble", "image", "shape-rect", "reference", "zoom-fit"] },
  { id: "all", name: "전체", ids: DEFAULT_STUDIO_RAIL_TOOL_ORDER },
] as const satisfies readonly { id: string; name: string; ids: readonly StudioRailToolId[] }[];

export function toolbarViewWidth(view: StudioToolbarView | undefined): number {
  return view === "double" ? 104 : view === "list" ? 184 : 56;
}
